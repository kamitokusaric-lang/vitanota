// DB マイグレーション Lambda (Phase 1: RDS 直接接続 + Secrets Manager パスワード認証)
//
// 呼び出し:
//   aws lambda invoke \
//     --function-name vitanota-prod-db-migrator \
//     --payload '{"command":"migrate"}' \
//     --cli-binary-format raw-in-base64-out response.json
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

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
const AWS_REGION = process.env.AWS_REGION_OVERRIDE ?? process.env.AWS_REGION ?? 'ap-northeast-1';
const DB_PASSWORD_SECRET_ARN = process.env.DB_PASSWORD_SECRET_ARN!;
const ENV = process.env.ENV ?? 'dev';

// Lambda 環境では task ディレクトリ直下に migrations がバンドルされる
const MIGRATIONS_DIR = resolve(process.env.LAMBDA_TASK_ROOT ?? __dirname, 'migrations');

const secretsClient = new SecretsManagerClient({ region: AWS_REGION });

/**
 * Secrets Manager から RDS マスターパスワードを取得
 */
async function getMasterPassword(): Promise<string> {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: DB_PASSWORD_SECRET_ARN })
  );
  if (!response.SecretString) {
    throw new Error('Secret value is empty');
  }
  // RDS 自動生成シークレットは {"username":"...","password":"..."} 形式
  const parsed = JSON.parse(response.SecretString) as { username: string; password: string };
  return parsed.password;
}

async function connect(): Promise<Client> {
  const password = await getMasterPassword();
  const client = new Client({
    host: RDS_HOST,
    port: RDS_PORT,
    user: RDS_USER,
    database: RDS_DATABASE,
    password,
    ssl: { rejectUnauthorized: false }, // RDS 自己署名証明書を許可
  });
  await client.connect();
  return client;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  const result = await client.query<MigrationRow>(
    'SELECT filename FROM _migrations ORDER BY id'
  );
  return new Set(result.rows.map((r) => r.filename));
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function runMigrate(): Promise<{ applied: string[]; skipped: string[] }> {
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
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
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

async function runStatus(): Promise<{ applied: string[]; pending: string[] }> {
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

export const handler = async (event: MigrateEvent) => {
  console.log(`vitanota-db-migrator invoked: ${event.command} (env=${ENV})`);
  try {
    switch (event.command) {
      case 'migrate': {
        const result = await runMigrate();
        return { statusCode: 200, body: JSON.stringify(result) };
      }
      case 'status': {
        const result = await runStatus();
        return { statusCode: 200, body: JSON.stringify(result) };
      }
      case 'drop': {
        const result = await runDrop();
        return { statusCode: 200, body: JSON.stringify(result) };
      }
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `Unknown command: ${(event as { command: string }).command}` }),
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Migration error:', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};
