/**
 * ローカル開発用: タスクボードのテストデータを大量投入する script
 *
 * - 既存タスクは消さない (memory: DELETE 含めない / tenant ID ハードコードしない)
 * - 全 tenant × 全 user (role='teacher' or 'school_admin') を対象
 * - 各 user × tenant に「過去 8 週 + 今週 + 未来 4 週」= 13 週分、1 週 5 件 → 65 件
 * - due_date は月〜金からランダム
 * - 過去 (今週より前) のタスクは 80% done / 20% 未完了 (持ち越しの可視化用)
 * - 今週/未来のタスクは backlog / todo / in_progress / review からランダム
 * - assignee は自分 1 名のみ
 * - category は同 tenant の task_categories からランダム
 *
 * 実行: pnpm tsx scripts/local/seed-tasks.ts
 * 事前: docker compose up -d && ./scripts/local/migrate.sh && (必要なら ./scripts/local/seed.sh)
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://vitanota:vitanota_local@localhost:5432/vitanota_dev';

const PAST_WEEKS = 8;
const FUTURE_WEEKS = 4;
const TASKS_PER_WEEK = 5;

type Status = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

interface UserRow {
  userId: string;
  tenantId: string;
  email: string;
  role: 'teacher' | 'school_admin';
}

interface CategoryRow {
  id: string;
  tenantId: string;
  name: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getMondayOfWeek(base: Date): Date {
  const day = base.getDay();
  const diff = (day + 6) % 7;
  const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  monday.setDate(monday.getDate() - diff);
  return monday;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const TASK_TITLE_TEMPLATES = [
  '授業準備',
  '保護者対応',
  '学年会議',
  '指導案作成',
  '提出物確認',
  '生徒面談',
  '行事準備',
  '会計処理',
  '会議資料',
  '研修参加',
  '掲示物作成',
  '学級通信',
];

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log(`✓ connected to ${DATABASE_URL.replace(/:[^@/]+@/, ':****@')}`);

  try {
    // 1. 対象ユーザー取得
    const userRes = await client.query<UserRow>(
      `SELECT utr.user_id AS "userId",
              utr.tenant_id AS "tenantId",
              u.email,
              utr.role
       FROM user_tenant_roles utr
       JOIN users u ON u.id = utr.user_id
       WHERE utr.role IN ('teacher', 'school_admin')
       ORDER BY utr.tenant_id, u.email`,
    );
    console.log(`✓ target users: ${userRes.rows.length}`);
    if (userRes.rows.length === 0) {
      console.error('✗ no teacher / school_admin users found. run seed.sh first.');
      process.exit(1);
    }

    // 2. tenant ごとの category 取得
    const catRes = await client.query<CategoryRow>(
      `SELECT id, tenant_id AS "tenantId", name FROM task_categories ORDER BY tenant_id, sort_order`,
    );
    const categoriesByTenant = new Map<string, CategoryRow[]>();
    for (const c of catRes.rows) {
      const arr = categoriesByTenant.get(c.tenantId) ?? [];
      arr.push(c);
      categoriesByTenant.set(c.tenantId, arr);
    }
    console.log(`✓ categories: ${catRes.rows.length} across ${categoriesByTenant.size} tenant(s)`);

    // 3. タスク生成
    const today = new Date();
    const thisMonday = getMondayOfWeek(today);
    let inserted = 0;

    for (const u of userRes.rows) {
      const cats = categoriesByTenant.get(u.tenantId) ?? [];
      if (cats.length === 0) {
        console.warn(`  skip ${u.email}: no categories in tenant ${u.tenantId}`);
        continue;
      }

      // -PAST_WEEKS 〜 +FUTURE_WEEKS の週ごとに 5 件
      for (let w = -PAST_WEEKS; w <= FUTURE_WEEKS; w++) {
        const weekMonday = new Date(thisMonday);
        weekMonday.setDate(thisMonday.getDate() + w * 7);

        for (let i = 0; i < TASKS_PER_WEEK; i++) {
          // 月〜金からランダム (0=月, 4=金)
          const dayOffset = Math.floor(Math.random() * 5);
          const due = new Date(weekMonday);
          due.setDate(weekMonday.getDate() + dayOffset);
          const dueYmd = toYmd(due);

          // status 分布
          let status: Status;
          if (w < 0) {
            status = Math.random() < 0.8 ? 'done' : pick(['backlog', 'todo', 'in_progress', 'review']);
          } else {
            status = pick(['backlog', 'todo', 'in_progress', 'review']);
          }
          const completedAt = status === 'done' ? due.toISOString() : null;

          const cat = pick(cats);
          const baseTitle = pick(TASK_TITLE_TEMPLATES);
          const title = `${baseTitle} W${w >= 0 ? '+' + w : w}-${i + 1}`;
          const description = `seed: ${u.email} / ${cat.name} / ${dueYmd}`;
          const taskId = randomUUID();

          await client.query('BEGIN');
          try {
            await client.query(
              `INSERT INTO tasks (id, tenant_id, category_id, created_by, title, description, due_date, status, completed_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9::timestamptz)`,
              [taskId, u.tenantId, cat.id, u.userId, title, description, dueYmd, status, completedAt],
            );
            await client.query(
              `INSERT INTO task_assignees (task_id, user_id, tenant_id) VALUES ($1, $2, $3)`,
              [taskId, u.userId, u.tenantId],
            );
            await client.query('COMMIT');
            inserted++;
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          }
        }
      }
      console.log(`  ✓ ${u.email}: 65 tasks`);
    }

    console.log(`\n✅ inserted ${inserted} tasks (${userRes.rows.length} users × 13 weeks × 5)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('seed-tasks failed:', err);
  process.exit(1);
});
