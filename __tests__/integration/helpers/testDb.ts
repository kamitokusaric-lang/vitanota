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

let pool: Pool | null = null;
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

/**
 * 既存の PostgreSQL に接続し、初回呼び出し時にマイグレーションを適用する
 * 各テストファイルの beforeAll で呼ぶ
 */
export async function startTestDb(): Promise<TestDb> {
  if (db && pool) return db;

  pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 5,
  });

  // 接続疎通確認 + 初回マイグレーション適用
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');

    if (!migrationApplied) {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      for (const file of files) {
        const sqlContent = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        try {
          await client.query(sqlContent);
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

  db = drizzle(pool, { schema });
  return db;
}

/**
 * 接続を閉じる (各テストファイルの afterAll で呼ぶ)
 */
export async function stopTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  db = null;
}

/**
 * 全テーブルを TRUNCATE してテスト間の状態をリセット
 * 各 beforeEach で呼ぶ
 */
export async function truncateAll(database: TestDb): Promise<void> {
  await database.execute(sql`
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
  fn: (tx: TestDb) => Promise<T>
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
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
  if (!pool) throw new Error('Test DB not started. Call startTestDb() first.');
  const result = await pool.query(query, params);
  return result.rows as T[];
}
