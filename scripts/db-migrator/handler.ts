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
  command:
    | 'migrate'
    | 'status'
    | 'drop'
    | 'bootstrap-admin'
    | 'inspect'
    | 'demo-setup'
    | 'seed-demo-posts'
    | 'cleanup-orphan-accepted-invitations';
  email?: string;
  name?: string;
  dryRun?: boolean;
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

interface DemoPost {
  userEmail: string;
  date: string; // YYYY-MM-DD (JST)
  time: string; // HH:MM (JST)
  content: string;
  emotion: string; // tag name
  context?: string; // tag name
}

// 2026-04-01〜04-22 の平日ベースで 3 ユーザー × 16 投稿 = 48 投稿。
// ペルソナ別トーン: testuser_1=ネガティブ多め / testuser_2=助けて欲しい /
// testuser_3=余裕・楽しんでる。生徒名は名前空間分離 (A-D / E-G / H-K)。
const DEMO_POSTS: DemoPost[] = [
  // ── testuser_1 (ネガティブ多め、遅め投稿) ────────────────
  { userEmail: 'testuser_1@example.com', date: '2026-04-01', time: '19:48', content: '着任初日。名簿だけで既に気が重いケースがあった。', emotion: '不安', context: '事務作業' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-02', time: '20:12', content: '職員会議が長い。自分の担当クラスの打ち合わせに辿り着かない。', emotion: '疲労', context: '会議' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-03', time: '19:30', content: '新学期の掲示物の準備が終わらない。週末も持ち帰り。', emotion: '焦り', context: '事務作業' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-06', time: '19:55', content: '始業式。担任発表で A さんの名前を見た瞬間、胃がキュッとなった。', emotion: '不安', context: '生徒対応' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-07', time: '20:18', content: '学級開きで自己紹介したら言葉が詰まった。準備不足を見抜かれた気がする。', emotion: '焦り', context: '授業' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-08', time: '18:45', content: '初日の授業、生徒の目が泳いでた。自分が話しすぎなのか。', emotion: '焦り', context: '授業' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-09', time: '20:32', content: 'B さんが保健室へ。声をかけるべきだったか。', emotion: '無力感', context: '生徒対応' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-10', time: '19:15', content: '今週はあっという間。ほとんど何もできていない気がする。', emotion: '疲労' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-13', time: '19:50', content: '週明け、C さんが教室に来れず渡り廊下にいた。どう声かければ。', emotion: '無力感', context: '生徒対応' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-14', time: '21:00', content: '授業準備が間に合わない。夜中に慌てて手書きで作る。', emotion: 'ストレス', context: '事務作業' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-15', time: '18:20', content: '年配の先生に注意された。謝ったのに、なぜか自分も腹が立っている。', emotion: '不満' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-16', time: '19:40', content: 'D さんが今日は笑った。それだけで少しだけ救われた気がする。', emotion: '安心', context: '生徒対応' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-17', time: '20:10', content: '一週間で何ができたか思い出せない。書き出してみたら空欄が多い。', emotion: '無力感' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-20', time: '19:05', content: '朝、出勤するのが少しだけ嫌だった。気づかないふりをした。', emotion: 'もやもや' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-21', time: '19:25', content: 'A さんとようやく廊下で目が合って、会釈した。それが今日の成果。', emotion: '安心', context: '生徒対応' },
  { userEmail: 'testuser_1@example.com', date: '2026-04-22', time: '20:00', content: '職員室で誰とも話さず一日が終わった。静かすぎる。', emotion: 'もやもや' },

  // ── testuser_2 (助けて欲しい、相談機会を探す時間帯) ────────
  { userEmail: 'testuser_2@example.com', date: '2026-04-01', time: '18:30', content: '前担任からの引継で既に E さんのことが気になった。明日からどう動くか。', emotion: '不安', context: '校務' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-02', time: '19:12', content: '職員会議で E さんの名前が何度か出た。私ひとりで抱えるのは無理そう。', emotion: '混乱', context: '会議' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-03', time: '19:45', content: '週末までに保護者宛てのプリントを整える。書き方で迷って手が止まる。', emotion: '不安', context: '事務作業' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-06', time: '17:50', content: '始業式。E さんが急に泣き出して教室を出ていった。追いかけて良かったのか。', emotion: '混乱', context: '生徒対応' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-07', time: '18:40', content: 'E さんの保護者から電話。長話になって、正解が分からないまま切ってしまった。', emotion: '不安', context: '保護者対応' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-08', time: '19:20', content: '学年主任に相談したかったが、タイミングを逃した。', emotion: 'もやもや', context: '会議' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-09', time: '18:15', content: 'F さんが授業中に寝ていた。起こすか放っておくかの判断でフリーズした。', emotion: '焦り', context: '授業' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-10', time: '19:30', content: '保護者連絡の返事が返ってこない。読まれているのかも分からない。', emotion: '不安', context: '保護者対応' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-13', time: '18:05', content: '同僚の先生が「困ったら言って」と声をかけてくれた。言えない自分がいる。', emotion: '無力感' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-14', time: '19:00', content: 'G さんが欠席続き。保護者から事情を聞いたが、踏み込めていない。', emotion: '焦り', context: '保護者対応' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-15', time: '17:45', content: '主任が相談に乗ってくれた。話せただけで少し軽くなった。', emotion: '感謝', context: '会議' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-16', time: '18:50', content: 'F さんの学習面が気になる。補習をどう案内するか決めかねている。', emotion: '混乱', context: '生徒対応' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-17', time: '19:15', content: '週末に振り返る時間が取れそうだ。整理すれば見えるものがあるはず。', emotion: '気づき' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-20', time: '18:25', content: 'E さんが自分から話しかけてくれた。何気ない会話だけど嬉しい。', emotion: '達成感', context: '生徒対応' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-21', time: '19:40', content: 'でも G さんは今日も欠席。自分の手が届いていない。', emotion: '無力感', context: '生徒対応' },
  { userEmail: 'testuser_2@example.com', date: '2026-04-22', time: '18:35', content: '助けを求めるのが苦手だ。でも今年は声に出そうと決めた。', emotion: '気づき' },

  // ── testuser_3 (余裕・楽しんでる、早め退勤傾向) ─────────
  { userEmail: 'testuser_3@example.com', date: '2026-04-01', time: '17:30', content: '新年度始動。今年は授業に新しい試みを入れてみる予定。楽しみ。', emotion: '充実', context: '事務作業' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-02', time: '18:15', content: '職員会議で去年のテンプレを共有したら学年で使ってもらえた。', emotion: '達成感', context: '会議' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-03', time: '17:50', content: '新学期の掲示物を早めに仕上げた。週末はのんびりしよう。', emotion: '充実', context: '事務作業' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-06', time: '17:45', content: '始業式の生徒の顔ぶれを見ながら、今年も楽しそうだと素直に思った。', emotion: '喜び' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-07', time: '17:20', content: '学級開きで自己紹介ゲームをしたら H さんが爆笑していた。掴みは OK。', emotion: '達成感', context: '授業' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-08', time: '18:30', content: '初日の授業、思ったより生徒が乗ってきた。準備した価値があった。', emotion: '充実', context: '授業' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-09', time: '17:55', content: 'I さんが自主的に黒板を拭いていた。感謝を伝えるとはにかんでいた。', emotion: '感謝', context: '生徒対応' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-10', time: '18:10', content: '一週間お疲れ。帰りに同僚とラーメンに行ってよく笑った。', emotion: '充実' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-13', time: '17:40', content: '部活の新入部員が予想以上に多かった。嬉しい悲鳴。', emotion: '喜び', context: '部活動' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-14', time: '17:25', content: 'K さんが去年より明らかに積極的になっていた。成長を感じる。', emotion: '気づき', context: '生徒対応' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-15', time: '18:00', content: '授業に動画を取り入れたら、生徒が目を輝かせた。次も試してみる。', emotion: '充実', context: '授業' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-16', time: '18:20', content: '少し疲れが出てきたけど、生徒の顔を見ると元気が戻る。', emotion: '疲労', context: '生徒対応' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-17', time: '17:35', content: 'H さんが去年の苦手教科を克服しつつある。一緒に喜んだ。', emotion: '達成感', context: '生徒対応' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-20', time: '18:00', content: '部活の試合前で落ち着かない生徒たちを見守るのも楽しい。', emotion: '喜び', context: '部活動' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-21', time: '17:50', content: '職員室で新人の先生の相談に乗った。昔の自分を思い出した。', emotion: '安心' },
  { userEmail: 'testuser_3@example.com', date: '2026-04-22', time: '18:15', content: '今日の締めくくりは J さんの「楽しかった」の一言。最高。', emotion: '喜び', context: '生徒対応' },
];

async function runSeedDemoPosts(): Promise<{
  tenantId: string;
  created: number;
  skipped: number;
  failed: number;
  details: Array<{ user: string; date: string; status: 'created' | 'skipped' | 'failed'; error?: string }>;
}> {
  const client = await connect();
  try {
    const tenantRow = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE slug = $1`,
      ['mito']
    );
    if (tenantRow.rows.length === 0) {
      throw new Error(`demo tenant not found (slug='mito')`);
    }
    const tenantId = tenantRow.rows[0].id;

    const tagRows = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM emotion_tags WHERE tenant_id = $1`,
      [tenantId]
    );
    const tagMap = new Map(tagRows.rows.map((r) => [r.name, r.id]));

    const userRows = await client.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
      [Array.from(new Set(DEMO_POSTS.map((p) => p.userEmail)))]
    );
    const userMap = new Map(userRows.rows.map((r) => [r.email, r.id]));

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const details: Array<{
      user: string;
      date: string;
      status: 'created' | 'skipped' | 'failed';
      error?: string;
    }> = [];

    for (const post of DEMO_POSTS) {
      try {
        const userId = userMap.get(post.userEmail);
        if (!userId) {
          failed++;
          details.push({
            user: post.userEmail,
            date: post.date,
            status: 'failed',
            error: 'user not found',
          });
          continue;
        }

        const isoTime = `${post.date}T${post.time}:00+09:00`;

        // 冪等: 同一 (user, tenant, 日付[JST]) の journal_entries があれば skip
        const existing = await client.query(
          `SELECT id FROM journal_entries
           WHERE user_id = $1 AND tenant_id = $2
             AND (created_at AT TIME ZONE 'Asia/Tokyo')::date = $3::date`,
          [userId, tenantId, post.date]
        );
        if (existing.rows.length > 0) {
          skipped++;
          details.push({ user: post.userEmail, date: post.date, status: 'skipped' });
          continue;
        }

        const emotionTagId = tagMap.get(post.emotion);
        if (!emotionTagId) {
          throw new Error(`emotion tag not found: ${post.emotion}`);
        }
        // post.context は 0016 で廃止された context タグの名残 (DEMO_POSTS データに残留)。
        // emotion タグのみを紐付ける。

        await client.query('BEGIN');
        try {
          const entryRow = await client.query<{ id: string }>(
            `INSERT INTO journal_entries (tenant_id, user_id, content, is_public, created_at, updated_at)
             VALUES ($1, $2, $3, true, $4, $4)
             RETURNING id`,
            [tenantId, userId, post.content, isoTime]
          );
          const entryId = entryRow.rows[0].id;

          await client.query(
            `INSERT INTO journal_entry_tags (tenant_id, entry_id, tag_id) VALUES ($1, $2, $3)`,
            [tenantId, entryId, emotionTagId]
          );

          await client.query('COMMIT');
          created++;
          details.push({ user: post.userEmail, date: post.date, status: 'created' });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
      } catch (err) {
        failed++;
        details.push({
          user: post.userEmail,
          date: post.date,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { tenantId, created, skipped, failed, details };
  } finally {
    await client.end();
  }
}

/**
 * usedAt 二重意味バグ (createOrReissueInvitation の修正前: usedAt を無効化マーカーとして
 * UPDATE していた挙動) で本番に残った orphan accepted 招待行を cleanup する。
 *
 * 判定: (email, tenant_id, role) でグループ化、used_at ASC で並べたとき
 *   - 1 番目の受諾済行 (= 本物受諾、user_tenant_roles を作った row) → keep
 *   - 2 番目以降の受諾済行 → orphan (バグで誤化)
 *   - user_tenant_roles に対応行が無いケースは全件 orphan
 *
 * dryRun=true なら SELECT のみ、false なら DELETE 実行。
 */
async function runCleanupOrphanAcceptedInvitations(
  dryRun: boolean
): Promise<{ dryRun: boolean; orphans: unknown[]; deleted: number }> {
  const client = await connect();
  try {
    const orphansResult = await client.query(`
      WITH ranked AS (
        SELECT
          it.id,
          it.email,
          it.tenant_id,
          it.role,
          it.used_at,
          it.created_at,
          t.slug AS tenant_slug,
          (utr.user_id IS NOT NULL) AS has_role,
          ROW_NUMBER() OVER (
            PARTITION BY it.email, it.tenant_id, it.role
            ORDER BY it.used_at ASC
          ) AS rn
        FROM invitation_tokens it
        LEFT JOIN tenants t ON t.id = it.tenant_id
        LEFT JOIN users u ON u.email = it.email
        LEFT JOIN user_tenant_roles utr
          ON utr.user_id = u.id
          AND utr.tenant_id = it.tenant_id
          AND utr.role = it.role
        WHERE it.used_at IS NOT NULL
      )
      SELECT id, email, role, used_at, created_at, tenant_slug,
        CASE
          WHEN NOT has_role THEN 'no role row'
          WHEN rn > 1 THEN 'duplicate accepted (rn=' || rn || ')'
          ELSE 'real'
        END AS verdict
      FROM ranked
      WHERE NOT has_role OR rn > 1
      ORDER BY tenant_slug, email, used_at
    `);

    const orphans = orphansResult.rows;
    if (dryRun || orphans.length === 0) {
      return { dryRun: true, orphans, deleted: 0 };
    }

    const idsToDelete = (orphans as { id: string }[]).map((o) => o.id);
    const deleteResult = await client.query(
      `DELETE FROM invitation_tokens WHERE id = ANY($1::uuid[])`,
      [idsToDelete]
    );
    return { dryRun: false, orphans, deleted: deleteResult.rowCount ?? 0 };
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
      case 'seed-demo-posts': {
        const result = await runSeedDemoPosts();
        return { statusCode: 200, body: JSON.stringify(result) };
      }
      case 'cleanup-orphan-accepted-invitations': {
        const result = await runCleanupOrphanAcceptedInvitations(event.dryRun ?? true);
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
