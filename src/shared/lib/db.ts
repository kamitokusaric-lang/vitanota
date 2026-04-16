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

async function getPool(): Promise<Pool> {
  if (pool) return pool;

  // ローカル開発時は静的パスワードを使用（AWS 認証情報不要）
  const password = process.env.DB_PASSWORD
    ? process.env.DB_PASSWORD
    : await getDbAuthToken();

  pool = new Pool({
    host: process.env.RDS_PROXY_ENDPOINT,
    port: 5432,
    user: process.env.DB_USER,
    password,
    database: process.env.DB_NAME,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
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
