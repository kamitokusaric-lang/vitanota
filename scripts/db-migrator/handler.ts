// Lambda マイグレーター参考実装 (Step 19)
// Unit-01 infrastructure-design.md の vitanota-db-migrator Lambda
//
// 参照: aidlc-docs/construction/unit-01/infrastructure-design/infrastructure-design.md
//       「DB マイグレーション: AWS Lambda (vitanota-db-migrator)」セクション
//
// デプロイ:
//   1. このディレクトリで pnpm install + tsc でビルド
//   2. dist/ + node_modules を zip
//   3. aws lambda update-function-code --function-name vitanota-db-migrator-{env}
//
// 呼び出し:
//   aws lambda invoke \
//     --function-name vitanota-db-migrator-dev \
//     --payload '{"command":"migrate"}' \
//     --cli-binary-format raw-in-base64-out response.json
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Client } from 'pg';
import { Signer } from '@aws-sdk/rds-signer';

interface MigrateEvent {
  command: 'migrate' | 'status' | 'drop';
}

interface MigrationRow {
  id: number;
  filename: string;
  applied_at: string;
}

const RDS_HOST = process.env.RDS_PROXY_ENDPOINT!;
const RDS_PORT = Number(process.env.RDS_PROXY_PORT ?? '5432');
const RDS_USER = process.env.DB_USER!;
const RDS_DATABASE = process.env.DB_NAME!;
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const ENV = process.env.ENV ?? 'dev';
const MIGRATIONS_DIR = resolve(__dirname, '../migrations');

/**
 * RDS Proxy への IAM 認証トークンを生成
 * トークン有効期限は 15 分
 */
async function buildAuthToken(): Promise<string> {
  const signer = new Signer({
    region: AWS_REGION,
    hostname: RDS_HOST,
    port: RDS_PORT,
    username: RDS_USER,
  });
  return signer.getAuthToken();
}

async function connect(): Promise<Client> {
  const password = await buildAuthToken();
  const client = new Client({
    host: RDS_HOST,
    port: RDS_PORT,
    user: RDS_USER,
    database: RDS_DATABASE,
    password,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();
  return client;
}

/**
 * マイグレーション履歴テーブルを初期化
 */
async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * 適用済みマイグレーション一覧を取得
 */
async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  const result = await client.query<MigrationRow>(
    'SELECT filename FROM _migrations ORDER BY id'
  );
  return new Set(result.rows.map((r) => r.filename));
}

/**
 * migrations/ ディレクトリの全 SQL ファイルをソートして返す
 */
function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * command: migrate - 未適用マイグレーションを順次実行
 */
async function runMigrate(): Promise<{
  applied: string[];
  skipped: string[];
}> {
  const client = await connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = listMigrationFiles();

    const newlyApplied: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        skipped.push(file);
        continue;
      }

      const sqlContent = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

      // 各マイグレーションは独立したトランザクション
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        newlyApplied.push(file);
        console.log(`✅ Applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${file} failed: ${message}`);
      }
    }

    return { applied: newlyApplied, skipped };
  } finally {
    await client.end();
  }
}

/**
 * command: status - 適用済み・未適用一覧を返す
 */
async function runStatus(): Promise<{
  applied: string[];
  pending: string[];
}> {
  const client = await connect();
  try {
    await ensureMigrationsTable(client);
    const appliedSet = await getAppliedMigrations(client);
    const files = listMigrationFiles();

    const applied: string[] = [];
    const pending: string[] = [];
    for (const f of files) {
      (appliedSet.has(f) ? applied : pending).push(f);
    }
    return { applied, pending };
  } finally {
    await client.end();
  }
}

/**
 * command: drop - 全テーブル削除 (dev 環境のみ)
 * SECURITY: prod では絶対に実行しない
 */
async function runDrop(): Promise<{ dropped: boolean }> {
  if (ENV === 'prod') {
    throw new Error('drop is disabled on prod environment');
  }
  const client = await connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    return { dropped: true };
  } finally {
    await client.end();
  }
}

/**
 * Lambda エントリポイント
 */
export const handler = async (event: MigrateEvent) => {
  console.log(`vitanota-db-migrator invoked: ${event.command} (env=${ENV})`);

  try {
    switch (event.command) {
      case 'migrate': {
        const result = await runMigrate();
        return {
          statusCode: 200,
          body: JSON.stringify(result),
        };
      }
      case 'status': {
        const result = await runStatus();
        return {
          statusCode: 200,
          body: JSON.stringify(result),
        };
      }
      case 'drop': {
        const result = await runDrop();
        return {
          statusCode: 200,
          body: JSON.stringify(result),
        };
      }
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: `Unknown command: ${(event as { command: string }).command}`,
          }),
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Migration error:', message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
};
