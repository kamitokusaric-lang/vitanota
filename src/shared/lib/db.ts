// PP-01: Drizzle シングルトン + withTenant パターン
// App Runner はコンテナを再利用するため接続プールが維持される
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { getDbAuthToken } from './db-auth';
import { logger } from './logger';
import * as schema from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  // IAM トークンは 15 分で expire するため、Pool 側で保持すると
  // 新規 backend connection 時に古い token で PAM 認証失敗する。
  // pg は password に関数を渡すと新規 Client 毎に評価する仕様なので、
  // getDbAuthToken (12 分 TTL キャッシュ) を毎回呼ばせて fresh token を使わせる。
  const password: string | (() => Promise<string>) = process.env.DB_PASSWORD
    ? process.env.DB_PASSWORD
    : () => getDbAuthToken();

  pool = new Pool({
    host: process.env.RDS_PROXY_ENDPOINT,
    port: 5432,
    user: process.env.DB_USER,
    password,
    database: process.env.DB_NAME,
    // MVP β: AWS RDS の CA チェーン（デフォルトで Node.js に信頼されていない）
    // を検証せず接続する。通信は VPC 内で閉じており MITM リスクは実質ゼロ。
    // Phase 2 で RDS CA bundle を Docker に同梱して rejectUnauthorized: true に戻す。
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,              // RDS Proxy がプール管理するためアプリ側は小さく
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (err) => {
    logger.error({ event: 'db.pool.error', err }, 'Unexpected DB pool error');
  });

  logger.info({ event: 'db.pool.created' }, 'DB connection pool created');

  return pool;
}

export async function getDb(): Promise<DrizzleDb> {
  const p = await getPool();
  return drizzle(p, { schema });
}

// テナントユーザー用: RLS の 3 変数を設定してトランザクション内で fn を実行
export async function withTenantUser<T>(
  tenantId: string,
  userId: string,
  role: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  if (!tenantId) throw new Error('withTenantUser: tenantId is required');
  if (!userId) throw new Error('withTenantUser: userId is required');
  if (!role) throw new Error('withTenantUser: role is required');

  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', ${role}, true)`);
    return fn(tx as unknown as DrizzleDb);
  });
}

// system_admin 用: 全テナントにアクセス可能
// app.tenant_id は設定しない（system_admin にテナントは不要。CASE で先に判定される）
export async function withSystemAdmin<T>(
  adminUserId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  if (!adminUserId) throw new Error('withSystemAdmin: adminUserId is required');

  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${adminUserId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.role', 'system_admin', true)`
    );
    return fn(tx as unknown as DrizzleDb);
  });
}

// セッション解決専用: ログイン直後に自分の user_tenant_roles を読むためだけのロール
// user_tenant_roles の bootstrap ポリシーでのみ許可（user_id = 自分の行の SELECT のみ）
// 他テーブルへのアクセスは CASE の ELSE false で拒否される
export async function withSessionBootstrap<T>(
  userId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  if (!userId) throw new Error('withSessionBootstrap: userId is required');

  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${userId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.role', 'bootstrap', true)`
    );
    return fn(tx as unknown as DrizzleDb);
  });
}
