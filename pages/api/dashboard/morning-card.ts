// GET /api/dashboard/morning-card — 朝カード (H3-B 来訪価値仮説) のデータ取得。
//
// 設計: project_h3_morning_arrival_value
//
// フロー: 認証 → JST 時刻判定 (4-11 時のみ表示) → dismiss 判定 →
//         候補 top 3 + 昨日完了数取得 → 状態 + 文言を決定 (ルール + ランダム)
//
// AI 不使用、 ルールベース + 日付シードのランダム文言で温かみを出す
// (個人傾向は使わない、 観測されてる感を作らない、 同じ日は同じ文言)。

import type { NextApiRequest, NextApiResponse } from 'next';
import { and, eq, sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { userOnboardingStates } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import { morningCardOnboardingStateSchema } from '@/schemas/userOnboardingStates';

export interface MorningCardCandidate {
  taskId: string;
  title: string;
  dueDate: string | null;
  status: string; // tasks.status の値 (backlog / todo / in_progress / review / done)
  urgency: 'overdue' | 'today' | 'soon' | 'in_progress' | 'no_due_date' | 'other';
  urgencyLabel: string; // 「期限切れ」「今日まで」「今週中」 等の柔らかい表示用
}

export interface MorningCardResponse {
  shouldShow: boolean;
  statusMessage: string; // 「うれしさ」 寄りの 1 文 (ルール + 日付シードランダム)
  reasonMessage: string | null; // なぜこの候補が選ばれたか、 候補 0 件なら null
  yesterdayDoneMessage: string | null;
  candidates: MorningCardCandidate[];
  meta: {
    yesterdayDoneCount: number;
    overdueCount: number;
    todayDueCount: number;
    noDueDateCount: number;
  };
}

const MORNING_START_HOUR = 4;
const MORNING_END_HOUR = 11;

// 朝カードは 4-11 時 JST のみ表示 (= 朝の来訪体験設計)。
// 動作確認時に true に切り替えるが、 commit / push 前は false に戻すこと。
const TEMP_SKIP_TIME_GATE = false;

function getJstNow(): { hour: number; dateStr: string } {
  const now = new Date();
  const jstStr = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
  const jstDate = new Date(jstStr);
  const yyyy = jstDate.getFullYear();
  const mm = String(jstDate.getMonth() + 1).padStart(2, '0');
  const dd = String(jstDate.getDate()).padStart(2, '0');
  return { hour: jstDate.getHours(), dateStr: `${yyyy}-${mm}-${dd}` };
}

// ── 状態判定 + 文言テーブル ─────────────────────────
// 同じ状態で複数文言、 日付 + userId シードでランダム選択 (= 一日中同じ文言、 翌朝に変わる)
// 文言原則 (feedback_design_vocab / feedback_ai_output_guards):
//   - 急かさない、 評価しない、 感情代弁しない
//   - 「整える / しまう / 残す」 系の柔らかい語彙
//   - 件数は事実、 ただし「気になる」 程度に柔らかく置き換え

type StatusKind = 'overdue' | 'today_due' | 'no_due_only' | 'all_clear';

interface StatusMessages {
  overdue: (n: number) => string[];
  today_due: (n: number) => string[];
  no_due_only: () => string[];
  all_clear: () => string[];
}

// 「うれしさ」 寄りの文言 ('動きやすそう' '見ておくと楽になりそう' 系)。
// TaskBoard ステータス (未着手 / 今週やる / 進行中 / 確認・調整中 / 完了) と
// 一貫した世界観で、 「今日見る = 進行中に動かす」 の入口として機能する。
// 候補件数 (= n) を引数に取って 1 文を返す。 各状況で 3 バリエーション、 日付シードでランダム選択。
const STATUS_MESSAGES: StatusMessages = {
  overdue: (n) => [
    `今朝は、 先に見ておくと動きやすそうなものが ${n} つあります`,
    `まず確認しておくと、 今日が楽になりそうなものが ${n} つあります`,
    `先に目を通しておきたいものが ${n} つあります`,
  ],
  today_due: (n) => [
    `今朝は、 まずこの ${n} つから見ておくと動きやすそうです`,
    `今日は ${n} つ、 順番に見ていけそうです`,
    `先に確認しておきたいものが ${n} つあります`,
  ],
  no_due_only: () => [
    '今朝は急ぎはなさそうです。 期限のないものから 1 つだけ手をつけてみるのもいいかもしれません',
    '今朝はゆっくり始められそうです',
    '今日は気持ちに余裕がある朝です',
  ],
  all_clear: () => [
    '今朝は急ぎも、 持ち越しもありません。 気持ちのいい朝です',
    'ここから始められます。 気持ちのいい朝ですね',
    '今朝は空いています',
  ],
};

// 候補選定理由 (1 行)。 候補があるときだけ表示、 状況別に文言を変える。
const REASON_MESSAGES: Record<StatusKind, string[]> = {
  overdue: [
    '期限が近いものから選びました',
    '先に確認しておくと楽になりそうなものを選びました',
  ],
  today_due: [
    '今日が期限のものから選びました',
    '今日まず開きたいものを選びました',
  ],
  no_due_only: [
    '期限のないものから、 進めやすそうなものを選びました',
    '気が向いたら手をつけられそうなものを選びました',
  ],
  all_clear: [], // 候補なしのときは reason も出さない
};

function urgencyLabel(
  urgency: MorningCardCandidate['urgency'],
  dueDateStr: string | null,
  todayStr: string,
): string {
  if (urgency === 'overdue') return '期限切れ';
  if (urgency === 'today') return '今日まで';
  if (urgency === 'soon') {
    // 3 日以内 → 「明日まで」 「N 日後まで」 「今週中」
    if (!dueDateStr) return '近日';
    const today = new Date(todayStr + 'T00:00:00');
    const due = new Date(dueDateStr + 'T00:00:00');
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return '明日まで';
    if (diffDays <= 3) return `${diffDays} 日後まで`;
    return '今週中';
  }
  if (urgency === 'in_progress') return '進めかけ';
  if (urgency === 'no_due_date') return '期限なし';
  return '';
}

// 「おはようございます」 隣に inline で添える 1 文 (chimo 2026-05-20):
//   - 昨日完了 > 0: 「昨日は N 件のタスクを完了にしました」
//   - 昨日完了 = 0: 「今日もよろしくお願いします」 (= 常にバッジを出す、 chimo 指示)
function buildGreetingTail(yesterdayDoneCount: number): string {
  if (yesterdayDoneCount > 0) {
    return `昨日は ${yesterdayDoneCount} 件のタスクを完了にしました`;
  }
  return '今日もよろしくお願いします';
}

function pickByDailySeed(arr: string[], seed: string): string {
  // 簡易 hash (Mulberry32 風): 日付 + userId 文字列 → 数値 → index
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % arr.length;
  return arr[idx]!;
}

function determineStatusKind(counts: {
  overdue: number;
  todayDue: number;
  noDueDate: number;
}): StatusKind {
  if (counts.overdue > 0) return 'overdue';
  if (counts.todayDue > 0) return 'today_due';
  if (counts.noDueDate > 0) return 'no_due_only';
  return 'all_clear';
}

function buildStatusMessage(
  kind: StatusKind,
  counts: { overdue: number; todayDue: number; noDueDate: number },
  seed: string,
): string {
  if (kind === 'overdue') return pickByDailySeed(STATUS_MESSAGES.overdue(counts.overdue), seed);
  if (kind === 'today_due')
    return pickByDailySeed(STATUS_MESSAGES.today_due(counts.todayDue), seed);
  if (kind === 'no_due_only') return pickByDailySeed(STATUS_MESSAGES.no_due_only(), seed);
  return pickByDailySeed(STATUS_MESSAGES.all_clear(), seed);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  const { hour, dateStr: todayStr } = getJstNow();
  const inMorningWindow =
    TEMP_SKIP_TIME_GATE ||
    (hour >= MORNING_START_HOUR && hour < MORNING_END_HOUR + 1);

  const emptyResponse: MorningCardResponse = {
    shouldShow: false,
    statusMessage: '',
    reasonMessage: null,
    yesterdayDoneMessage: null,
    candidates: [],
    meta: { yesterdayDoneCount: 0, overdueCount: 0, todayDueCount: 0, noDueDateCount: 0 },
  };

  if (!inMorningWindow) {
    return res.status(200).json(emptyResponse);
  }

  const role = pickDbRole(ctx);

  try {
    const result = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      // 1. dismiss 状態
      const dismissRows = await tx
        .select({ state: userOnboardingStates.state })
        .from(userOnboardingStates)
        .where(
          and(
            eq(userOnboardingStates.userId, ctx.userId),
            eq(userOnboardingStates.tenantId, ctx.tenantId),
            eq(userOnboardingStates.context, 'morning_card'),
          ),
        )
        .limit(1);

      let dismissedToday = false;
      if (dismissRows[0]?.state) {
        const parsed = morningCardOnboardingStateSchema.safeParse(dismissRows[0].state);
        if (parsed.success && parsed.data.dismissedDate === todayStr) {
          dismissedToday = true;
        }
      }
      if (dismissedToday) return emptyResponse;

      // 2. 集計 SQL
      const aggregate = await tx.execute<{
        yesterday_done: number;
        overdue: number;
        today_due: number;
        no_due_date: number;
      }>(sql`
        WITH self_tasks AS (
          SELECT t.*
          FROM tasks t
          JOIN task_assignees ta ON ta.task_id = t.id AND ta.tenant_id = t.tenant_id
          WHERE ta.user_id = ${ctx.userId}::uuid
            AND t.tenant_id = ${ctx.tenantId}::uuid
        )
        SELECT
          COUNT(*) FILTER (
            WHERE status = 'done'
              AND (completed_at AT TIME ZONE 'Asia/Tokyo')::date = (${todayStr}::date - 1)
          )::int AS yesterday_done,
          COUNT(*) FILTER (
            WHERE status <> 'done' AND due_date IS NOT NULL AND due_date < ${todayStr}::date
          )::int AS overdue,
          COUNT(*) FILTER (
            WHERE status <> 'done' AND due_date IS NOT NULL AND due_date = ${todayStr}::date
          )::int AS today_due,
          COUNT(*) FILTER (
            WHERE status <> 'done' AND due_date IS NULL
          )::int AS no_due_date
        FROM self_tasks
      `);

      const agg = aggregate.rows[0] ?? {
        yesterday_done: 0,
        overdue: 0,
        today_due: 0,
        no_due_date: 0,
      };

      // 3. 候補 (chimo 2026-05-20 指示):
      //    - 期限切れ + 今日期限 (urgency_rank 1, 2) は **全件** 表示 (LIMIT なし)
      //    - それらが 0 件のときだけ、 補完で urgency_rank >= 3 (近日/進行中/期限なし) を top 3
      // タスク総数を多くても見せる方が「教員の今日の状況」 を正直に映す。
      const mainCandidateRows = await tx.execute<{
        id: string;
        title: string;
        due_date: string | null;
        status: string;
        urgency_rank: number;
      }>(sql`
        SELECT
          t.id,
          t.title,
          to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
          t.status::text,
          CASE
            WHEN t.due_date < ${todayStr}::date THEN 1
            WHEN t.due_date = ${todayStr}::date THEN 2
            ELSE 99
          END AS urgency_rank
        FROM tasks t
        JOIN task_assignees ta ON ta.task_id = t.id AND ta.tenant_id = t.tenant_id
        WHERE ta.user_id = ${ctx.userId}::uuid
          AND t.tenant_id = ${ctx.tenantId}::uuid
          AND t.status <> 'done'
          AND t.due_date IS NOT NULL
          AND t.due_date <= ${todayStr}::date
        ORDER BY urgency_rank ASC, t.due_date ASC, t.created_at DESC
      `);

      // 主候補 (期限切れ + 今日期限) が 0 件のときだけ、 補完を取得
      const supplementaryRows =
        mainCandidateRows.rows.length > 0
          ? { rows: [] as typeof mainCandidateRows.rows }
          : await tx.execute<{
              id: string;
              title: string;
              due_date: string | null;
              status: string;
              urgency_rank: number;
            }>(sql`
              SELECT
                t.id,
                t.title,
                to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
                t.status::text,
                CASE
                  WHEN t.due_date IS NOT NULL AND t.due_date <= ${todayStr}::date + 3 THEN 3
                  WHEN t.status = 'in_progress' THEN 4
                  WHEN t.due_date IS NULL THEN 5
                  ELSE 6
                END AS urgency_rank
              FROM tasks t
              JOIN task_assignees ta ON ta.task_id = t.id AND ta.tenant_id = t.tenant_id
              WHERE ta.user_id = ${ctx.userId}::uuid
                AND t.tenant_id = ${ctx.tenantId}::uuid
                AND t.status <> 'done'
              ORDER BY urgency_rank ASC, t.due_date ASC NULLS LAST, t.created_at DESC
              LIMIT 3
            `);

      const candidateRows = {
        rows: [...mainCandidateRows.rows, ...supplementaryRows.rows],
      };

      const candidates: MorningCardCandidate[] = candidateRows.rows.map((r) => {
        const urgency: MorningCardCandidate['urgency'] =
          r.urgency_rank === 1
            ? 'overdue'
            : r.urgency_rank === 2
              ? 'today'
              : r.urgency_rank === 3
                ? 'soon'
                : r.urgency_rank === 4
                  ? 'in_progress'
                  : r.urgency_rank === 5
                    ? 'no_due_date'
                    : 'other';
        return {
          taskId: r.id,
          title: r.title,
          dueDate: r.due_date,
          status: r.status,
          urgency,
          urgencyLabel: urgencyLabel(urgency, r.due_date, todayStr),
        };
      });

      // 4. 状態判定 + 文言生成 (日付 + userId シードでランダム)
      const counts = {
        overdue: agg.overdue,
        todayDue: agg.today_due,
        noDueDate: agg.no_due_date,
      };
      const kind = determineStatusKind(counts);
      const seed = `${todayStr}|${ctx.userId}`;

      // candidates が 0 件のときは「うれしさ」 寄りでも候補数を出さない、
      // candidates 件数を文言の {n} に渡す (= statusMessage は候補数主役)
      const candidateCount = candidates.length;
      let statusMessage: string;
      if (candidateCount > 0) {
        // 候補があるときは「先に見ておくと始めやすそうなものが N つあります」 系
        if (kind === 'overdue')
          statusMessage = pickByDailySeed(STATUS_MESSAGES.overdue(candidateCount), seed);
        else if (kind === 'today_due')
          statusMessage = pickByDailySeed(STATUS_MESSAGES.today_due(candidateCount), seed);
        else if (kind === 'no_due_only')
          statusMessage = pickByDailySeed(STATUS_MESSAGES.no_due_only(), seed);
        else statusMessage = pickByDailySeed(STATUS_MESSAGES.all_clear(), seed);
      } else {
        // 候補 0 件 = タスクなし、 all_clear 文言のみ
        statusMessage = pickByDailySeed(STATUS_MESSAGES.all_clear(), seed);
      }

      const reasonMessages = REASON_MESSAGES[kind];
      const reasonMessage =
        candidateCount > 0 && reasonMessages.length > 0
          ? pickByDailySeed(reasonMessages, seed)
          : null;

      const yesterdayDoneMessage = buildGreetingTail(agg.yesterday_done);

      return {
        shouldShow: true,
        statusMessage,
        reasonMessage,
        yesterdayDoneMessage,
        candidates,
        meta: {
          yesterdayDoneCount: agg.yesterday_done,
          overdueCount: agg.overdue,
          todayDueCount: agg.today_due,
          noDueDateCount: agg.no_due_date,
        },
      } satisfies MorningCardResponse;
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error({ event: 'dashboard.morning_card.fetch_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
