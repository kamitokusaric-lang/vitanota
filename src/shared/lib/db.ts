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

  const token = await getDbAuthToken();

  pool = new Pool({
    host: process.env.RDS_PROXY_ENDPOINT,
    port: 5432,
    user: process.env.DB_USER,
    password: token,
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

// withTenant: PostgreSQL RLS でテナント隔離を行うラッパー（SP-04 Layer 5）
export async function withTenant<T>(
  tenantId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    );
    return fn(tx as unknown as DrizzleDb);
  });
}

// withTenantUser: Unit-02 用拡張 - tenant_id と user_id 両方を設定
// owner_all RLS ポリシーで user_id による所有者判定を行うため必須
// SP-U02-02 RLS 2ポリシー構成・RP-U02-01 トランザクション必須化
export async function withTenantUser<T>(
  tenantId: string,
  userId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // set_config(name, value, is_local=true) でトランザクションスコープに限定
    // R1 対策: SET LOCAL はトランザクション終了時に自動リセット、RDS Proxy ピン回避
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${userId}, true)`
    );
    return fn(tx as unknown as DrizzleDb);
  });
}

// system_admin 用: RLS バイパス（全テナントにアクセス可能）
export async function withSystemAdmin<T>(
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', 'system_admin', true)`
    );
    return fn(tx as unknown as DrizzleDb);
  });
}
