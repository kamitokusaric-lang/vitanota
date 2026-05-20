/**
 * ローカル開発用: 朝カード (H3-B 来訪価値仮説) 動作テスト用シード script
 *
 * - 対象: 名前 'ローカル教員' の teacher 1 名のみ (chimo 2026-05-20 指示)
 * - 既存タスクは消さない (memory: seed_safety / 言われたことだけをやる)
 * - tenant ID はハードコードせず、 name から逆引きする (memory: seed_safety)
 * - title prefix '[朝カードテスト]' で識別できる
 *
 * 投入分布 (20 件、 朝カード API の 4 バケット + 昨日完了 + 進行中 を網羅):
 *   - 期限切れ未完了        : 5 件 (1〜7 日前)  → overdue, urgency_rank=1
 *   - 今日が期限の未完了    : 3 件             → today_due, urgency_rank=2
 *   - 3 日以内の未完了      : 3 件 (明日〜3 日後) → soon, urgency_rank=3
 *   - 進行中 (期限なし)     : 2 件             → in_progress, urgency_rank=4
 *   - 期限なし未完了        : 4 件             → no_due_date, urgency_rank=5
 *   - 昨日完了             : 3 件 (status='done', completed_at=昨日 JST)
 *
 * 実行: pnpm tsx scripts/local/seed-morning-card.ts
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://vitanota:vitanota_local@localhost:5432/vitanota_dev';

const TARGET_USER_NAME = 'ローカル教員';
const TITLE_PREFIX = '[朝カードテスト]';

type Status = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

interface UserRow {
  userId: string;
  tenantId: string;
  email: string;
}

interface CategoryRow {
  id: string;
  name: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

interface SeedSpec {
  label: string;
  dueOffsetDays: number | null;
  status: Status;
  completedOffsetDays?: number | null;
}

const TITLE_BANK = [
  '校外学習しおり差し戻し対応',
  '保護者からの欠席連絡まとめ',
  '学年だより 5 月号 校正',
  '指導案 国語第 3 単元',
  '提出物未提出者リスト確認',
  '個別面談 日程調整',
  '体育祭 用具点検',
  '会計 4 月分処理',
  '職員会議資料 印刷依頼',
  '研修参加申込フォーム提出',
  '学級掲示 5 月版 作成',
  '学級通信 第 6 号 下書き',
  '生徒指導記録 整理',
  '行事写真 整理 / 共有',
  'プリント刷り直し依頼',
  '欠席対応の電話折返し',
  '理科準備室 整理',
  '備品発注 リスト確認',
  '保健室との情報共有メモ',
  '修学旅行 班分け 確認',
];

const SEED_SPECS: SeedSpec[] = [
  // 期限切れ未完了 5 件 (1〜7 日前、 status 分布で「完了にする」 ボタンと「今日の予定に入れる」 を両方見せる)
  { label: '期限切れ 7d 前 backlog', dueOffsetDays: -7, status: 'backlog' },
  { label: '期限切れ 5d 前 todo', dueOffsetDays: -5, status: 'todo' },
  { label: '期限切れ 3d 前 todo', dueOffsetDays: -3, status: 'todo' },
  { label: '期限切れ 2d 前 in_progress', dueOffsetDays: -2, status: 'in_progress' },
  { label: '期限切れ 1d 前 review', dueOffsetDays: -1, status: 'review' },
  // 今日が期限 3 件
  { label: '今日 backlog', dueOffsetDays: 0, status: 'backlog' },
  { label: '今日 todo', dueOffsetDays: 0, status: 'todo' },
  { label: '今日 todo (2)', dueOffsetDays: 0, status: 'todo' },
  // 3 日以内 (soon) 3 件
  { label: '明日 todo', dueOffsetDays: 1, status: 'todo' },
  { label: '2 日後 backlog', dueOffsetDays: 2, status: 'backlog' },
  { label: '3 日後 todo', dueOffsetDays: 3, status: 'todo' },
  // 進行中 (期限なし) 2 件
  { label: '進行中 (期限なし)', dueOffsetDays: null, status: 'in_progress' },
  { label: '進行中 (期限なし) 2', dueOffsetDays: null, status: 'in_progress' },
  // 期限なし未完了 4 件
  { label: '期限なし backlog', dueOffsetDays: null, status: 'backlog' },
  { label: '期限なし todo', dueOffsetDays: null, status: 'todo' },
  { label: '期限なし backlog 2', dueOffsetDays: null, status: 'backlog' },
  { label: '期限なし review', dueOffsetDays: null, status: 'review' },
  // 昨日完了 3 件 (status=done, completed_at = 昨日 JST 12:00)
  { label: '昨日完了 (1)', dueOffsetDays: -1, status: 'done', completedOffsetDays: -1 },
  { label: '昨日完了 (2)', dueOffsetDays: -1, status: 'done', completedOffsetDays: -1 },
  { label: '昨日完了 (3)', dueOffsetDays: -2, status: 'done', completedOffsetDays: -1 },
];

async function main() {
  if (SEED_SPECS.length !== 20) {
    throw new Error(`SEED_SPECS length must be 20, got ${SEED_SPECS.length}`);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`✓ connected to ${DATABASE_URL.replace(/:[^@/]+@/, ':****@')}`);

  try {
    // 1. 対象ユーザー (name で逆引き、 tenant ID はハードコードしない)
    const userRes = await client.query<UserRow>(
      `SELECT utr.user_id AS "userId",
              utr.tenant_id AS "tenantId",
              u.email
       FROM user_tenant_roles utr
       JOIN users u ON u.id = utr.user_id
       WHERE u.name = $1 AND utr.role = 'teacher'
       LIMIT 2`,
      [TARGET_USER_NAME],
    );
    if (userRes.rows.length === 0) {
      console.error(`✗ teacher '${TARGET_USER_NAME}' not found. run seed.sh first.`);
      process.exit(1);
    }
    if (userRes.rows.length > 1) {
      console.error(`✗ multiple teachers named '${TARGET_USER_NAME}' found, aborting for safety.`);
      process.exit(1);
    }
    const user = userRes.rows[0]!;
    console.log(`✓ target user: ${user.email} (tenant ${user.tenantId})`);

    // 2. tenant の category 取得
    const catRes = await client.query<CategoryRow>(
      `SELECT id, name FROM task_categories WHERE tenant_id = $1 ORDER BY sort_order`,
      [user.tenantId],
    );
    if (catRes.rows.length === 0) {
      console.error(`✗ no task_categories in tenant ${user.tenantId}.`);
      process.exit(1);
    }
    console.log(`✓ categories: ${catRes.rows.length}`);

    // 3. 投入
    const today = new Date();
    let inserted = 0;

    for (let i = 0; i < SEED_SPECS.length; i++) {
      const spec = SEED_SPECS[i]!;
      const dueYmd =
        spec.dueOffsetDays === null ? null : toYmd(addDays(today, spec.dueOffsetDays));
      const completedAt =
        spec.completedOffsetDays === undefined || spec.completedOffsetDays === null
          ? null
          : new Date(
              addDays(today, spec.completedOffsetDays).getFullYear(),
              addDays(today, spec.completedOffsetDays).getMonth(),
              addDays(today, spec.completedOffsetDays).getDate(),
              12,
              0,
              0,
            ).toISOString();

      const baseTitle = TITLE_BANK[i % TITLE_BANK.length]!;
      const title = `${TITLE_PREFIX} ${baseTitle}`;
      const description = `seed (朝カード動作テスト): ${spec.label}${
        dueYmd ? ` / due=${dueYmd}` : ' / 期限なし'
      } / status=${spec.status}`;
      const cat = pick(catRes.rows);
      const taskId = randomUUID();

      await client.query('BEGIN');
      try {
        await client.query(
          `INSERT INTO tasks (id, tenant_id, category_id, created_by, title, description, due_date, status, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9::timestamptz)`,
          [
            taskId,
            user.tenantId,
            cat.id,
            user.userId,
            title,
            description,
            dueYmd,
            spec.status,
            completedAt,
          ],
        );
        await client.query(
          `INSERT INTO task_assignees (task_id, user_id, tenant_id) VALUES ($1, $2, $3)`,
          [taskId, user.userId, user.tenantId],
        );
        await client.query('COMMIT');
        inserted++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log(`\n✅ inserted ${inserted} tasks for ${user.email}`);
    console.log(`   prefix: "${TITLE_PREFIX}"`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('seed-morning-card failed:', err);
  process.exit(1);
});
