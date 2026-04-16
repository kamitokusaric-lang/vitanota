// Step 16a: 統合テスト用 DB ヘルパー
// CI 側 (GitHub Actions services: postgres) で起動済みの PostgreSQL に接続する
// 環境変数: DATABASE_URL (例: postgresql://test:test@localhost:5432/vitanota_test)
// ローカルで実行したい場合は別途 PostgreSQL を起動して DATABASE_URL を設定する
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import * as schema from '@/db/schema';

export type TestDb = NodePgDatabase<typeof schema>;

let migrationPool: Pool | null = null;
let appPool: Pool | null = null;
let db: TestDb | null = null;
let migrationApplied = false;

const MIGRATIONS_DIR = resolve(__dirname, '../../../migrations');

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. 統合テストは CI で実行されます。\n' +
        'ローカル実行する場合は PostgreSQL を起動して DATABASE_URL を設定してください。\n' +
        '例: DATABASE_URL=postgresql://test:test@localhost:5432/vitanota_test pnpm test:integration'
    );
  }
  return url;
}

function getAppDatabaseUrl(): string {
  const base = getDatabaseUrl();
  const url = new URL(base);
  url.username = 'vitanota_app';
  url.password = 'vitanota_app_local';
  return url.toString();
}

/**
 * 既存の PostgreSQL に接続し、初回呼び出し時にマイグレーションを適用する
 * マイグレーションはスーパーユーザー（DATABASE_URL）で実行し、
 * テスト用クエリは非特権ロール（vitanota_app）で実行する
 */
export async function startTestDb(): Promise<TestDb> {
  if (db && appPool) return db;

  // マイグレーション用（スーパーユーザー）
  migrationPool = new Pool({ connectionString: getDatabaseUrl(), max: 2 });

  const client = await migrationPool.connect();
  try {
    await client.query('SELECT 1');

    if (!migrationApplied) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      for (const file of files) {
        const { rows } = await client.query(
          'SELECT 1 FROM _migrations WHERE filename = $1',
          [file]
        );
        if (rows.length > 0) continue;

        const sqlContent = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        try {
          await client.query(sqlContent);
          await client.query(
            'INSERT INTO _migrations (filename) VALUES ($1)',
            [file]
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Migration ${file} failed: ${message}`);
        }
      }
      migrationApplied = true;
    }
  } finally {
    client.release();
  }

  // テスト用（非特権ロール vitanota_app — RLS が適用される）
  appPool = new Pool({ connectionString: getAppDatabaseUrl(), max: 5 });
  db = drizzle(appPool, { schema });
  return db;
}

/**
 * 接続を閉じる (各テストファイルの afterAll で呼ぶ)
 */
export async function stopTestDb(): Promise<void> {
  if (appPool) {
    await appPool.end();
    appPool = null;
  }
  if (migrationPool) {
    await migrationPool.end();
    migrationPool = null;
  }
  db = null;
}

/**
 * 全テーブルを TRUNCATE してテスト間の状態をリセット
 * スーパーユーザー接続で実行（vitanota_app でも TRUNCATE 権限ありだが確実を期す）
 */
export async function truncateAll(_database: TestDb): Promise<void> {
  if (!migrationPool) throw new Error('Test DB not started');
  await migrationPool.query(`
    TRUNCATE TABLE
      journal_entry_tags,
      journal_entries,
      tags,
      sessions,
      verification_tokens,
      accounts,
      user_tenant_roles,
      invitation_tokens,
      users,
      tenants
    RESTART IDENTITY CASCADE
  `);
}

/**
 * RLS セッション変数を設定してコールバックを実行
 */
export async function withTenantContext<T>(
  database: TestDb,
  tenantId: string,
  userId: string,
  fn: (tx: TestDb) => Promise<T>,
  role = 'teacher'
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', ${role}, true)`);
    return fn(tx as unknown as TestDb);
  });
}

export async function withSystemAdminContext<T>(
  database: TestDb,
  userId: string,
  fn: (tx: TestDb) => Promise<T>
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
    return fn(tx as unknown as TestDb);
  });
}

/**
 * RLS セッション変数なしで生クエリを実行 (fail-safe 検証用)
 */
export async function rawQuery<T = unknown>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!appPool) throw new Error('Test DB not started. Call startTestDb() first.');
  const result = await appPool.query(query, params);
  return result.rows as T[];
}

export async function rawQueryAsSuperuser<T = unknown>(
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!migrationPool) throw new Error('Test DB not started. Call startTestDb() first.');
  const result = await migrationPool.query(query, params);
  return result.rows as T[];
}
