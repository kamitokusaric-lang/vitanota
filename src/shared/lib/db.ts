// PP-01: Drizzle シングルトン + withTenant パターン
// App Runner はコンテナを再利用するため接続プールが維持される
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDbAuthToken, getCurrentTokenMeta } from './db-auth';
import { logger } from './logger';
import * as schema from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// pg.Pool の subclass。pool.connect() の失敗経路では pool.on('connect') が発火しないため
// 失敗時に IAM token のメタ情報を構造化ログに残せない。それを救済するための薄いラッパ。
// drizzle は this.client.connect() を直接叩く実装 (drizzle-orm/node-postgres/session.cjs)
// なので、subclass の connect() を override すれば transaction 経路も透過的に拾える。
//
// Phase 4 (D-passive: client max age 強制) を将来的に追加する場合、同 subclass の
// connect() に age 判定 + 再取得ループを足すことで段階的に拡張できる。
export class ObservablePool extends Pool {
  override async connect(): Promise<PoolClient> {
    const meta = getCurrentTokenMeta();
    const startedAt = Date.now();
    try {
      return await super.connect();
    } catch (err) {
      const tokenAge = meta ? Date.now() - meta.createdAt : null;
      const errCode = (err as { code?: string }).code;
      const errMessage = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          event: 'db.client.connect.failed',
          token_generation_id: meta?.generationId,
          token_age_at_connect_ms: tokenAge,
          connect_duration_ms: Date.now() - startedAt,
          err_code: errCode,
          err_message: errMessage,
          pool_total: this.totalCount,
          pool_idle: this.idleCount,
          pool_waiting: this.waitingCount,
        },
        'pool.connect() failed',
      );
      throw err;
    }
  }
}

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

  pool = new ObservablePool({
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

  // 観測 A: client の生成と認証に使った IAM token のメタデータを attach する。
  // PAM auth failed 調査で「stale な token を保持した client が pool 内に残るか」を
  // 識別するため、後段（Phase 4 D-passive）の age 判定にも使う。
  pool.on('connect', (client) => {
    const now = Date.now();
    const meta = getCurrentTokenMeta();
    const augmented = client as PoolClient & {
      __clientId?: string;
      __createdAt?: number;
      __tokenGenerationId?: string;
      __tokenCreatedAt?: number;
    };
    augmented.__clientId = randomUUID();
    augmented.__createdAt = now;
    if (meta) {
      augmented.__tokenGenerationId = meta.generationId;
      augmented.__tokenCreatedAt = meta.createdAt;
    }

    logger.info(
      {
        event: 'db.client.connect',
        pool_client_id: augmented.__clientId,
        token_generation_id: meta?.generationId,
        token_age_at_connect_ms: meta ? now - meta.createdAt : null,
      },
      'New DB pool client connected',
    );
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
