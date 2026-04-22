// DB マイグレーション Lambda (Phase 1: RDS 直接接続 + Secrets Manager パスワード認証)
//
// 呼び出し:
//   aws lambda invoke \
//     --function-name vitanota-prod-db-migrator \
//     --payload '{"command":"migrate"}' \
//     --cli-binary-format raw-in-base64-out response.json
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

interface MigrateEvent {
  command: 'migrate' | 'status' | 'drop' | 'bootstrap-admin' | 'inspect' | 'demo-setup';
  email?: string;
  name?: string;
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

async function runBootstrapAdmin(
  email: string,
  name: string | null
): Promise<{ userId: string; userCreated: boolean; roleCreated: boolean }> {
  const client = await connect();
  try {
    await client.query('BEGIN');

    // users に INSERT（冪等: email UNIQUE 制約で既存を検出）
    const userInsert = await client.query<{ id: string }>(
      `INSERT INTO users (email, name, email_verified)
       VALUES ($1, $2, now())
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, name]
    );

    let userId: string;
    let userCreated: boolean;
    if (userInsert.rows.length > 0) {
      userId = userInsert.rows[0].id;
      userCreated = true;
    } else {
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      userId = existing.rows[0].id;
      userCreated = false;
    }

    // user_tenant_roles に system_admin 権限を付与（tenant_id IS NULL のため
    // UNIQUE 制約が効かず、WHERE NOT EXISTS で手動冪等化）
    const roleInsert = await client.query<{ id: string }>(
      `INSERT INTO user_tenant_roles (user_id, tenant_id, role)
       SELECT $1, NULL, 'system_admin'
       WHERE NOT EXISTS (
         SELECT 1 FROM user_tenant_roles
         WHERE user_id = $1 AND tenant_id IS NULL AND role = 'system_admin'
       )
       RETURNING id`,
      [userId]
    );

    await client.query('COMMIT');

    return {
      userId,
      userCreated,
      roleCreated: roleInsert.rows.length > 0,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

async function runInspect(): Promise<{
  tenants: unknown[];
  users: unknown[];
  userTenantRoles: unknown[];
  invitationTokens: unknown[];
}> {
  const client = await connect();
  try {
    const tenants = await client.query(
      `SELECT id, name, slug, status, created_at FROM tenants ORDER BY created_at`
    );
    const users = await client.query(
      `SELECT id, email, name, email_verified, deleted_at, created_at
       FROM users ORDER BY created_at`
    );
    const userTenantRoles = await client.query(
      `SELECT utr.user_id, u.email, utr.tenant_id, t.slug AS tenant_slug, utr.role, utr.created_at
       FROM user_tenant_roles utr
       JOIN users u ON u.id = utr.user_id
       LEFT JOIN tenants t ON t.id = utr.tenant_id
       ORDER BY utr.created_at`
    );
    const invitationTokens = await client.query(
      `SELECT id, tenant_id, email, role, invited_by, expires_at, used_at, created_at
       FROM invitation_tokens ORDER BY created_at`
    );
    return {
      tenants: tenants.rows,
      users: users.rows,
      userTenantRoles: userTenantRoles.rows,
      invitationTokens: invitationTokens.rows,
    };
  } finally {
    await client.end();
  }
}

const DEMO_TENANT_SLUG = 'mito';
const DEMO_INVITE_EXPIRES_DAYS = 90;
const DEMO_INVITE_BASE_URL = 'https://vitanota.io';
const DEMO_INVITATIONS: { email: string; role: 'school_admin' | 'teacher' }[] = [
  { email: 'chimo@cozi73.com', role: 'school_admin' },
  { email: 'zenikami@cozi73.com', role: 'teacher' },
];
const DEMO_TEST_USERS: { email: string; name: string }[] = [
  { email: 'testuser_1@example.com', name: 'テストユーザー1' },
  { email: 'testuser_2@example.com', name: 'テストユーザー2' },
  { email: 'testuser_3@example.com', name: 'テストユーザー3' },
];

interface DemoInviteResult {
  email: string;
  role: string;
  token: string;
  url: string;
  expiresAt: string;
  reused: boolean;
}

interface DemoTestUserResult {
  email: string;
  userId: string;
  userCreated: boolean;
  roleCreated: boolean;
}

async function runDemoSetup(): Promise<{
  tenantId: string;
  invitedBy: string;
  invites: DemoInviteResult[];
  testUsers: DemoTestUserResult[];
}> {
  const client = await connect();
  try {
    // demo テナント (slug = 'mito') を特定
    const tenantRow = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE slug = $1`,
      [DEMO_TENANT_SLUG]
    );
    if (tenantRow.rows.length === 0) {
      throw new Error(`demo tenant not found (slug='${DEMO_TENANT_SLUG}')`);
    }
    const tenantId = tenantRow.rows[0].id;

    // invited_by に使う system_admin を特定 (複数いる場合は最初の1人)
    const adminRow = await client.query<{ user_id: string }>(
      `SELECT user_id FROM user_tenant_roles
       WHERE role = 'system_admin' AND tenant_id IS NULL
       ORDER BY created_at LIMIT 1`
    );
    if (adminRow.rows.length === 0) {
      throw new Error('no system_admin found; run bootstrap-admin first');
    }
    const invitedBy = adminRow.rows[0].user_id;

    // ── 招待トークン × 2 ───────────────────────────────────
    const invites: DemoInviteResult[] = [];
    for (const inv of DEMO_INVITATIONS) {
      // 既存の未使用かつ有効な招待があれば再利用 (重複 INSERT 回避)
      const existing = await client.query<{ token: string; expires_at: Date }>(
        `SELECT token, expires_at FROM invitation_tokens
         WHERE email = $1 AND tenant_id = $2 AND role = $3
           AND used_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [inv.email, tenantId, inv.role]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        invites.push({
          email: inv.email,
          role: inv.role,
          token: row.token,
          url: `${DEMO_INVITE_BASE_URL}/auth/invite?token=${row.token}`,
          expiresAt: row.expires_at.toISOString(),
          reused: true,
        });
        continue;
      }

      const token = randomBytes(32).toString('hex');
      const inserted = await client.query<{ expires_at: Date }>(
        `INSERT INTO invitation_tokens (tenant_id, email, role, token, invited_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval)
         RETURNING expires_at`,
        [tenantId, inv.email, inv.role, token, invitedBy, String(DEMO_INVITE_EXPIRES_DAYS)]
      );
      invites.push({
        email: inv.email,
        role: inv.role,
        token,
        url: `${DEMO_INVITE_BASE_URL}/auth/invite?token=${token}`,
        expiresAt: inserted.rows[0].expires_at.toISOString(),
        reused: false,
      });
    }

    // ── testuser × 3 流し込み ─────────────────────────────
    const testUsers: DemoTestUserResult[] = [];
    for (const tu of DEMO_TEST_USERS) {
      await client.query('BEGIN');
      try {
        const userInsert = await client.query<{ id: string }>(
          `INSERT INTO users (email, name, email_verified)
           VALUES ($1, $2, NOW())
           ON CONFLICT (email) DO NOTHING
           RETURNING id`,
          [tu.email, tu.name]
        );
        let userId: string;
        let userCreated: boolean;
        if (userInsert.rows.length > 0) {
          userId = userInsert.rows[0].id;
          userCreated = true;
        } else {
          const existingUser = await client.query<{ id: string }>(
            `SELECT id FROM users WHERE email = $1`,
            [tu.email]
          );
          userId = existingUser.rows[0].id;
          userCreated = false;
        }

        // user_tenant_roles に teacher 権限を付与 (UNIQUE 制約で冪等)
        const roleInsert = await client.query<{ id: string }>(
          `INSERT INTO user_tenant_roles (user_id, tenant_id, role)
           VALUES ($1, $2, 'teacher')
           ON CONFLICT (user_id, tenant_id, role) DO NOTHING
           RETURNING id`,
          [userId, tenantId]
        );

        await client.query('COMMIT');

        testUsers.push({
          email: tu.email,
          userId,
          userCreated,
          roleCreated: roleInsert.rows.length > 0,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    return { tenantId, invitedBy, invites, testUsers };
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
      case 'bootstrap-admin': {
        if (!event.email) {
          return { statusCode: 400, body: JSON.stringify({ error: 'email is required' }) };
        }
        const result = await runBootstrapAdmin(event.email, event.name ?? null);
        return { statusCode: 200, body: JSON.stringify(result) };
      }
      case 'inspect': {
        const result = await runInspect();
        return { statusCode: 200, body: JSON.stringify(result) };
      }
      case 'demo-setup': {
        const result = await runDemoSetup();
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
