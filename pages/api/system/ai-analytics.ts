// system_admin 用: AI 整理機能 (H1 検証 Phase B) の集計 API
// 権限: system_admin のみ。GET のみ。
//
// 設計: post-mvp-backlog.md「system_admin AI 改善 分析画面 (Phase B)」
// 踏み絵 (project_ai_sessions_visibility / feedback_observed_moment_broken):
//   - 出力は aggregate のみ。user_id / tenant_id / input_text / 個別 session は返さない
//   - school_admin 不可視は API 認証層で 403
//   - 期間フィルタは v1 では未実装 (全期間 aggregate のみ、データ量が増えたら追加)
//
// 2026-05-14: 「整理されましたか?」アンケート UI 撤去に伴い、organizeScore /
// inputBurdenScore 集計を画面から削除。過去データは ai_sessions.ai_output_json.survey に
// 残ったまま (削除はしない)、編集理由 (editReason) 集計は残す。
import type { NextApiRequest, NextApiResponse } from 'next';
import { sql, desc, eq } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { aiSessions } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import type {
  AiAnalyticsResponse,
  SessionDetail,
  MorningPlanAnalytics,
} from '@/features/ai-chat/analyticsTypes';

// 最新セッション詳細を取得する件数。chimo 2026-05-14 指示で踏み絵から外し、
// 入力本文 + AI 提案 + 教員確定を system_admin に開示。
const SESSION_DETAIL_LIMIT = 50;

function mapSessionDetail(row: {
  id: string;
  type: string;
  status: 'draft' | 'confirmed' | 'discarded';
  createdAt: Date;
  inputText: string;
  aiOutputJson: unknown;
}): SessionDetail {
  const j = (row.aiOutputJson ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === 'string' ? v : null;

  const extraction = j.extraction as
    | { tasks?: unknown[]; needsConfirmation?: unknown[] }
    | undefined;
  const userConfirmed = j.userConfirmed as unknown[] | undefined;

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    inputText: row.inputText,
    inputTextRedacted: str(j.inputTextRedacted),
    promptVersion: str(j.promptVersion),
    extraction: extraction
      ? {
          tasks: Array.isArray(extraction.tasks)
            ? extraction.tasks.map((t) => {
                const o = (t ?? {}) as Record<string, unknown>;
                return {
                  title: String(o.title ?? ''),
                  categoryId: str(o.category_id),
                  dueDate: str(o.due_date),
                  memo: String(o.memo ?? ''),
                  confidence: String(o.confidence ?? ''),
                };
              })
            : [],
          needsConfirmation: Array.isArray(extraction.needsConfirmation)
            ? extraction.needsConfirmation.map((n) => String(n))
            : [],
        }
      : null,
    userConfirmed: Array.isArray(userConfirmed)
      ? userConfirmed.map((c) => {
          const o = (c ?? {}) as Record<string, unknown>;
          return {
            title: String(o.title ?? ''),
            aiSuggestedTitle: str(o.aiSuggestedTitle),
            titleChanged: Boolean(o.titleChanged),
            aiSuggestedParentName: str(o.aiSuggestedParentName),
            userSelectedParentName: String(o.userSelectedParentName ?? ''),
            categoryChanged: Boolean(o.categoryChanged),
            dueDate: str(o.dueDate),
            aiSuggestedDueDate: str(o.aiSuggestedDueDate),
            dueDateChanged: Boolean(o.dueDateChanged),
            taskCreated: Boolean(o.taskCreated),
          };
        })
      : null,
    confirmedAt: str(j.confirmedAt),
    discardReason: str(j.discardReason),
    discardReasonText: str(j.discardReasonText),
    discardedAt: str(j.discardedAt),
    editReason: str(j.editReason),
    editReasonText: str(j.editReasonText),
  };
}

interface SummaryRow {
  total_sessions: number;
  confirmed_count: number;
  discarded_count: number;
  draft_count: number;
}

interface EditRateRow {
  candidate_count: number;
  title_changed: number | null;
  category_changed: number | null;
  due_date_changed: number | null;
  task_created: number | null;
}

interface PromptVersionRow {
  prompt_version: string;
  total: number;
  confirmed: number;
  discarded: number;
}

interface CategoryEditRow {
  parent_name: string;
  candidate_count: number;
  category_changed: number | null;
}

interface ReasonRow {
  reason: string;
  count: number;
}

interface SubMetricsRow {
  candidates_per_input_avg: string | null;
  candidates_per_input_count: number;
  time_to_confirm_seconds_avg: string | null;
  time_to_confirm_count: number;
}

interface ReuseRow {
  unique_users: number;
  reused_users: number;
}

interface GuardrailRow {
  privacy_concern_discard_count: number;
  total_discarded: number;
}

interface FreeCommentRow {
  reason: string | null;
  text: string;
  at: string | null;
}

interface DailyCountRow {
  date: string;
  count: number;
}

// 過去 30 日分の JST 日付を生成し、 SQL の集計結果と merge して 0 件埋めする
function fillDailyCounts(
  rows: DailyCountRow[],
  days = 30,
): Array<{ date: string; count: number }> {
  const map = new Map(rows.map((r) => [r.date, r.count]));
  const out: Array<{ date: string; count: number }> = [];
  // 今日 (JST) から (days-1) 日前まで遡る
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayJst = new Date(
    Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate()),
  );
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayJst.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}

// ── H3 morning_plan 集計 row types ─────────────────────────
interface MpFunnelRow {
  total: number;
  capacity_selected: number;
  generated: number;
  started: number;
  edit_started: number;
  closed_without_start: number;
}
interface MpDoneRow {
  total_items: number;
  done_items: number;
  today_done: number;
  today_total: number;
  optional_done: number;
  optional_total: number;
}
interface MpZeroDoneRow {
  started_sessions: number;
  zero_done_sessions: number;
}
interface MpOutlookRow {
  held: number;
  somewhat: number;
  difficult: number;
  feedback_count: number;
}
interface MpBucketsRow {
  ai_today: number;
  ai_optional: number;
  retained: number;
  today_to_optional: number;
  optional_to_today: number;
  excluded_count: number;
  user_added_count: number;
  total: number;
}
interface MpCapacityRow {
  capacity: 'low' | 'normal' | 'high';
  session_count: number;
  started: number;
  edit_started: number;
}
interface MpNextDayRow {
  unique_users: number;
  consecutive_users: number;
}

function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

function buildMorningPlanAnalytics(data: {
  mpFunnel: MpFunnelRow | undefined;
  mpDone: MpDoneRow | undefined;
  mpZeroDone: MpZeroDoneRow | undefined;
  mpOutlook: MpOutlookRow | undefined;
  mpBuckets: MpBucketsRow | undefined;
  mpCapacity: MpCapacityRow[];
  mpNextDay: MpNextDayRow | undefined;
}): MorningPlanAnalytics {
  const f = data.mpFunnel ?? {
    total: 0,
    capacity_selected: 0,
    generated: 0,
    started: 0,
    edit_started: 0,
    closed_without_start: 0,
  };
  const d = data.mpDone ?? {
    total_items: 0,
    done_items: 0,
    today_done: 0,
    today_total: 0,
    optional_done: 0,
    optional_total: 0,
  };
  const z = data.mpZeroDone ?? { started_sessions: 0, zero_done_sessions: 0 };
  const o = data.mpOutlook ?? {
    held: 0,
    somewhat: 0,
    difficult: 0,
    feedback_count: 0,
  };
  const b = data.mpBuckets ?? {
    ai_today: 0,
    ai_optional: 0,
    retained: 0,
    today_to_optional: 0,
    optional_to_today: 0,
    excluded_count: 0,
    user_added_count: 0,
    total: 0,
  };
  const n = data.mpNextDay ?? { unique_users: 0, consecutive_users: 0 };

  return {
    funnel: {
      totalSessions: f.total,
      capacitySelectedCount: f.capacity_selected,
      generatedCount: f.generated,
      startedCount: f.started,
      editStartedCount: f.edit_started,
      closedWithoutStartCount: f.closed_without_start,
      capacitySelectedRate: rate(f.capacity_selected, f.total),
      generatedRate: rate(f.generated, f.capacity_selected),
      startedRate: rate(f.started, f.generated),
      editStartedRate: rate(f.edit_started, f.generated),
      closedAfterGenerationRate: rate(f.closed_without_start, f.generated),
    },
    done: {
      totalItemsInStartedSessions: d.total_items,
      doneCount: d.done_items,
      doneRate: rate(d.done_items, d.total_items),
      todayBucketDoneCount: d.today_done,
      todayBucketTotal: d.today_total,
      todayBucketDoneRate: rate(d.today_done, d.today_total),
      optionalBucketDoneCount: d.optional_done,
      optionalBucketTotal: d.optional_total,
      optionalBucketDoneRate: rate(d.optional_done, d.optional_total),
      startedSessions: z.started_sessions,
      zeroDoneSessions: z.zero_done_sessions,
      zeroDoneSessionRate: rate(z.zero_done_sessions, z.started_sessions),
    },
    outlook: {
      feedbackCount: o.feedback_count,
      heldCount: o.held,
      somewhatCount: o.somewhat,
      difficultCount: o.difficult,
      outlookHeldRate: rate(o.held + o.somewhat, o.feedback_count),
    },
    buckets: {
      aiTodayCount: b.ai_today,
      aiOptionalCount: b.ai_optional,
      retainedCount: b.retained,
      totalItems: b.total,
      bucketChangeRate: rate(b.total - b.retained, b.total),
      todayToOptional: b.today_to_optional,
      optionalToToday: b.optional_to_today,
      excludedCount: b.excluded_count,
      excludedRate: rate(b.excluded_count, b.total),
      userAddedCount: b.user_added_count,
      userAddedRate: rate(b.user_added_count, b.total),
    },
    capacityCross: (['low', 'normal', 'high'] as const).map((c) => {
      const row = data.mpCapacity.find((r) => r.capacity === c);
      if (!row) {
        return {
          capacity: c,
          sessionCount: 0,
          startedRate: null,
          editRate: null,
        };
      }
      return {
        capacity: c,
        sessionCount: row.session_count,
        startedRate: rate(row.started, row.session_count),
        editRate: rate(row.edit_started, row.session_count),
      };
    }),
    nextDayReturn: {
      uniqueUsers: n.unique_users,
      consecutiveUsers: n.consecutive_users,
      nextDayReturnRate: rate(n.consecutive_users, n.unique_users),
    },
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res
      .status(403)
      .json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  try {
    const data = await withSystemAdmin(session.user.userId, async (tx) => {
      const summaryResult = await tx.execute(sql`
        SELECT
          COUNT(*)::int                                                          AS total_sessions,
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'confirmed')::int        AS confirmed_count,
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'discarded')::int        AS discarded_count,
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'draft')::int            AS draft_count
        FROM ${aiSessions}
      `);

      const editRateResult = await tx.execute(sql`
        SELECT
          COUNT(*)::int                                                              AS candidate_count,
          SUM(CASE WHEN (c->>'titleChanged')::boolean    THEN 1 ELSE 0 END)::int     AS title_changed,
          SUM(CASE WHEN (c->>'categoryChanged')::boolean THEN 1 ELSE 0 END)::int     AS category_changed,
          SUM(CASE WHEN (c->>'dueDateChanged')::boolean  THEN 1 ELSE 0 END)::int     AS due_date_changed,
          SUM(CASE WHEN (c->>'taskCreated')::boolean     THEN 1 ELSE 0 END)::int     AS task_created
        FROM ${aiSessions},
             jsonb_array_elements(COALESCE(ai_output_json->'userConfirmed', '[]'::jsonb)) AS c
        WHERE ${aiSessions.status} = 'confirmed'
      `);

      const promptVersionResult = await tx.execute(sql`
        SELECT
          COALESCE(ai_output_json->>'promptVersion', '(none)')          AS prompt_version,
          COUNT(*)::int                                                  AS total,
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'confirmed')::int AS confirmed,
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'discarded')::int AS discarded
        FROM ${aiSessions}
        GROUP BY 1
        ORDER BY total DESC
      `);

      const categoryEditResult = await tx.execute(sql`
        SELECT
          c->>'userSelectedParentName' AS parent_name,
          COUNT(*)::int                                                              AS candidate_count,
          SUM(CASE WHEN (c->>'categoryChanged')::boolean THEN 1 ELSE 0 END)::int     AS category_changed
        FROM ${aiSessions},
             jsonb_array_elements(COALESCE(ai_output_json->'userConfirmed', '[]'::jsonb)) AS c
        WHERE ${aiSessions.status} = 'confirmed'
          AND c->>'userSelectedParentName' IS NOT NULL
        GROUP BY 1
        ORDER BY candidate_count DESC
      `);

      const discardReasonResult = await tx.execute(sql`
        SELECT
          COALESCE(ai_output_json->>'discardReason', '(unspecified)') AS reason,
          COUNT(*)::int                                                AS count
        FROM ${aiSessions}
        WHERE ${aiSessions.status} = 'discarded'
        GROUP BY 1
        ORDER BY count DESC
      `);

      const editReasonResult = await tx.execute(sql`
        SELECT
          ai_output_json->>'editReason' AS reason,
          COUNT(*)::int                  AS count
        FROM ${aiSessions}
        WHERE ai_output_json->>'editReason' IS NOT NULL
        GROUP BY 1
        ORDER BY count DESC
      `);

      // 副指標: 1 入力あたり候補生成数 + 確定までの時間
      const subMetricsResult = await tx.execute(sql`
        SELECT
          AVG(jsonb_array_length(ai_output_json->'extraction'->'tasks'))::numeric AS candidates_per_input_avg,
          COUNT(*) FILTER (WHERE jsonb_typeof(ai_output_json->'extraction'->'tasks') = 'array')::int AS candidates_per_input_count,
          AVG(EXTRACT(EPOCH FROM ((ai_output_json->>'confirmedAt')::timestamptz - created_at)))::numeric AS time_to_confirm_seconds_avg,
          COUNT(*) FILTER (WHERE ai_output_json->>'confirmedAt' IS NOT NULL)::int AS time_to_confirm_count
        FROM ${aiSessions}
      `);

      // 副指標: 再利用率 (ユニーク user 数 / 2 回以上使った user 数)
      const reuseResult = await tx.execute(sql`
        SELECT
          COUNT(*)::int                                  AS unique_users,
          COUNT(*) FILTER (WHERE per_user_count >= 2)::int AS reused_users
        FROM (
          SELECT user_id, COUNT(*) AS per_user_count
          FROM ${aiSessions}
          GROUP BY user_id
        ) AS u
      `);

      // ガードレール: privacy_concern 破棄
      const guardrailResult = await tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE ai_output_json->>'discardReason' = 'privacy_concern')::int  AS privacy_concern_discard_count,
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'discarded')::int                     AS total_discarded
        FROM ${aiSessions}
      `);

      // 定性: 破棄時の自由コメント (新しい順 50 件、PII 注意)
      const discardCommentResult = await tx.execute(sql`
        SELECT
          ai_output_json->>'discardReason'     AS reason,
          ai_output_json->>'discardReasonText' AS text,
          ai_output_json->>'discardedAt'       AS at
        FROM ${aiSessions}
        WHERE ${aiSessions.status} = 'discarded'
          AND ai_output_json->>'discardReasonText' IS NOT NULL
          AND ai_output_json->>'discardReasonText' <> ''
        ORDER BY at DESC NULLS LAST
        LIMIT 50
      `);

      // 定性: 編集時の自由コメント (新しい順 50 件、PII 注意)
      const editCommentResult = await tx.execute(sql`
        SELECT
          ai_output_json->>'editReason'     AS reason,
          ai_output_json->>'editReasonText' AS text,
          ai_output_json->>'editReasonAt'   AS at
        FROM ${aiSessions}
        WHERE ai_output_json->>'editReasonText' IS NOT NULL
          AND ai_output_json->>'editReasonText' <> ''
        ORDER BY at DESC NULLS LAST
        LIMIT 50
      `);

      // セッション詳細 (最新 N 件、入力本文 + AI 提案 + 教員確定)
      // H1 (quick_capture) のみ対象。 morning_plan は SessionCard の構造に合わないため
      // 別途必要になったら H3 タブ用の詳細ビューを追加する。
      const sessionRows = await tx
        .select({
          id: aiSessions.id,
          type: aiSessions.type,
          status: aiSessions.status,
          createdAt: aiSessions.createdAt,
          inputText: aiSessions.inputText,
          aiOutputJson: aiSessions.aiOutputJson,
        })
        .from(aiSessions)
        .where(eq(aiSessions.type, 'quick_capture'))
        .orderBy(desc(aiSessions.createdAt))
        .limit(SESSION_DETAIL_LIMIT);

      // ── H3 morning_plan 集計 ──────────────────────────────────
      const mpFunnelResult = await tx.execute(sql`
        SELECT
          COUNT(*)::int                                                                         AS total,
          COUNT(*) FILTER (WHERE ai_output_json->>'capacitySelectedAt' IS NOT NULL)::int        AS capacity_selected,
          COUNT(*) FILTER (WHERE ai_output_json->>'generatedAt' IS NOT NULL)::int               AS generated,
          COUNT(*) FILTER (WHERE ai_output_json->>'startedAt' IS NOT NULL)::int                 AS started,
          COUNT(*) FILTER (WHERE ai_output_json->>'editStartedAt' IS NOT NULL)::int             AS edit_started,
          COUNT(*) FILTER (
            WHERE ai_output_json->>'closedAt' IS NOT NULL
              AND ai_output_json->>'startedAt' IS NULL
              AND ai_output_json->>'generatedAt' IS NOT NULL
          )::int AS closed_without_start
        FROM ${aiSessions}
        WHERE type = 'morning_plan'
      `);

      // Done 集計は excluded を分母から除外 (active items のみ)
      const mpDoneResult = await tx.execute(sql`
        SELECT
          COUNT(*)::int                                                                  AS total_items,
          COUNT(*) FILTER (WHERE done_at IS NOT NULL)::int                                AS done_items,
          COUNT(*) FILTER (WHERE done_at IS NOT NULL AND COALESCE(final_bucket, ai_bucket) = 'today')::int    AS today_done,
          COUNT(*) FILTER (WHERE COALESCE(final_bucket, ai_bucket) = 'today')::int                            AS today_total,
          COUNT(*) FILTER (WHERE done_at IS NOT NULL AND COALESCE(final_bucket, ai_bucket) = 'optional')::int AS optional_done,
          COUNT(*) FILTER (WHERE COALESCE(final_bucket, ai_bucket) = 'optional')::int                         AS optional_total
        FROM today_plan_items tpi
        WHERE EXISTS (
          SELECT 1 FROM ai_sessions s
          WHERE s.id = tpi.session_id AND s.ai_output_json->>'startedAt' IS NOT NULL
        )
          AND (tpi.final_bucket IS NULL OR tpi.final_bucket <> 'excluded')
      `);

      const mpZeroDoneResult = await tx.execute(sql`
        SELECT
          COUNT(*)::int AS started_sessions,
          COUNT(*) FILTER (
            WHERE NOT EXISTS (
              SELECT 1 FROM today_plan_items tpi
              WHERE tpi.session_id = s.id AND tpi.done_at IS NOT NULL
            )
          )::int AS zero_done_sessions
        FROM ${aiSessions} s
        WHERE s.type = 'morning_plan'
          AND s.ai_output_json->>'startedAt' IS NOT NULL
      `);

      const mpOutlookResult = await tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE ai_output_json->'feedback'->>'outlookScore' = 'held')::int       AS held,
          COUNT(*) FILTER (WHERE ai_output_json->'feedback'->>'outlookScore' = 'somewhat')::int   AS somewhat,
          COUNT(*) FILTER (WHERE ai_output_json->'feedback'->>'outlookScore' = 'difficult')::int  AS difficult,
          COUNT(*) FILTER (WHERE ai_output_json->'feedback'->>'outlookScore' IS NOT NULL)::int    AS feedback_count
        FROM ${aiSessions}
        WHERE type = 'morning_plan'
      `);

      const mpBucketsResult = await tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE ai_bucket = 'today')::int                                  AS ai_today,
          COUNT(*) FILTER (WHERE ai_bucket = 'optional')::int                               AS ai_optional,
          COUNT(*) FILTER (WHERE ai_bucket IS NOT NULL AND (final_bucket IS NULL OR final_bucket = ai_bucket))::int AS retained,
          COUNT(*) FILTER (WHERE ai_bucket = 'today' AND final_bucket = 'optional')::int    AS today_to_optional,
          COUNT(*) FILTER (WHERE ai_bucket = 'optional' AND final_bucket = 'today')::int    AS optional_to_today,
          COUNT(*) FILTER (WHERE final_bucket = 'excluded')::int                            AS excluded_count,
          COUNT(*) FILTER (WHERE ai_bucket IS NULL)::int                                    AS user_added_count,
          COUNT(*)::int                                                                     AS total
        FROM today_plan_items
      `);

      const mpCapacityResult = await tx.execute(sql`
        SELECT
          ai_output_json->>'capacity'                                                       AS capacity,
          COUNT(*)::int                                                                     AS session_count,
          COUNT(*) FILTER (WHERE ai_output_json->>'startedAt' IS NOT NULL)::int             AS started,
          COUNT(*) FILTER (WHERE ai_output_json->>'editStartedAt' IS NOT NULL)::int         AS edit_started
        FROM ${aiSessions}
        WHERE type = 'morning_plan'
          AND ai_output_json->>'capacity' IN ('low','normal','high')
        GROUP BY 1
      `);

      // 翌日再訪: 過去 14 日間で、同じ user が翌日も morning_plan を始めた割合
      const mpNextDayResult = await tx.execute(sql`
        WITH user_dates AS (
          SELECT DISTINCT
            user_id,
            (created_at AT TIME ZONE 'Asia/Tokyo')::date AS plan_date
          FROM ${aiSessions}
          WHERE type = 'morning_plan'
            AND ai_output_json->>'startedAt' IS NOT NULL
            AND created_at >= NOW() - INTERVAL '14 days'
        )
        SELECT
          COUNT(DISTINCT user_id)::int AS unique_users,
          (
            SELECT COUNT(DISTINCT u1.user_id)::int
            FROM user_dates u1
            WHERE EXISTS (
              SELECT 1 FROM user_dates u2
              WHERE u2.user_id = u1.user_id AND u2.plan_date = u1.plan_date + 1
            )
          ) AS consecutive_users
        FROM user_dates
      `);

      // 日別件数 (過去 30 日、JST 日付で GROUP BY)
      // H1 = quick_capture, H3 = morning_plan の利用数推移を見る
      const dailyH1Result = await tx.execute(sql`
        SELECT
          (created_at AT TIME ZONE 'Asia/Tokyo')::date::text AS date,
          COUNT(*)::int                                      AS count
        FROM ${aiSessions}
        WHERE type = 'quick_capture'
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        ORDER BY 1
      `);
      const dailyH3Result = await tx.execute(sql`
        SELECT
          (created_at AT TIME ZONE 'Asia/Tokyo')::date::text AS date,
          COUNT(*)::int                                      AS count
        FROM ${aiSessions}
        WHERE type = 'morning_plan'
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        ORDER BY 1
      `);

      return {
        summary: (summaryResult.rows[0] as unknown as SummaryRow) ?? null,
        editRate: (editRateResult.rows[0] as unknown as EditRateRow) ?? null,
        promptVersions: promptVersionResult.rows as unknown as PromptVersionRow[],
        categoryEdit: categoryEditResult.rows as unknown as CategoryEditRow[],
        discardReasons: discardReasonResult.rows as unknown as ReasonRow[],
        editReasons: editReasonResult.rows as unknown as ReasonRow[],
        subMetrics: (subMetricsResult.rows[0] as unknown as SubMetricsRow) ?? null,
        reuse: (reuseResult.rows[0] as unknown as ReuseRow) ?? null,
        guardrail: (guardrailResult.rows[0] as unknown as GuardrailRow) ?? null,
        discardComments: discardCommentResult.rows as unknown as FreeCommentRow[],
        editComments: editCommentResult.rows as unknown as FreeCommentRow[],
        sessionRows,
        mpFunnel: mpFunnelResult.rows[0] as unknown as MpFunnelRow,
        mpDone: mpDoneResult.rows[0] as unknown as MpDoneRow,
        mpZeroDone: mpZeroDoneResult.rows[0] as unknown as MpZeroDoneRow,
        mpOutlook: mpOutlookResult.rows[0] as unknown as MpOutlookRow,
        mpBuckets: mpBucketsResult.rows[0] as unknown as MpBucketsRow,
        mpCapacity: mpCapacityResult.rows as unknown as MpCapacityRow[],
        mpNextDay: mpNextDayResult.rows[0] as unknown as MpNextDayRow,
        dailyH1: dailyH1Result.rows as unknown as DailyCountRow[],
        dailyH3: dailyH3Result.rows as unknown as DailyCountRow[],
      };
    });

    const response: AiAnalyticsResponse = {
      summary: {
        totalSessions: data.summary?.total_sessions ?? 0,
        confirmedCount: data.summary?.confirmed_count ?? 0,
        discardedCount: data.summary?.discarded_count ?? 0,
        draftCount: data.summary?.draft_count ?? 0,
      },
      editRate: {
        candidateCount: data.editRate?.candidate_count ?? 0,
        titleChanged: data.editRate?.title_changed ?? 0,
        categoryChanged: data.editRate?.category_changed ?? 0,
        dueDateChanged: data.editRate?.due_date_changed ?? 0,
        taskCreated: data.editRate?.task_created ?? 0,
      },
      promptVersions: data.promptVersions.map((r) => ({
        promptVersion: r.prompt_version,
        total: r.total,
        confirmed: r.confirmed,
        discarded: r.discarded,
      })),
      categoryEdit: data.categoryEdit.map((r) => ({
        parentName: r.parent_name,
        candidateCount: r.candidate_count,
        categoryChanged: r.category_changed ?? 0,
      })),
      discardReasons: data.discardReasons.map((r) => ({
        reason: r.reason,
        count: r.count,
      })),
      editReasons: data.editReasons.map((r) => ({
        reason: r.reason,
        count: r.count,
      })),
      subMetrics: {
        candidatesPerInputAvg:
          data.subMetrics?.candidates_per_input_avg == null
            ? null
            : Number(data.subMetrics.candidates_per_input_avg),
        candidatesPerInputCount: data.subMetrics?.candidates_per_input_count ?? 0,
        timeToConfirmSecondsAvg:
          data.subMetrics?.time_to_confirm_seconds_avg == null
            ? null
            : Number(data.subMetrics.time_to_confirm_seconds_avg),
        timeToConfirmCount: data.subMetrics?.time_to_confirm_count ?? 0,
        uniqueUsers: data.reuse?.unique_users ?? 0,
        reusedUsers: data.reuse?.reused_users ?? 0,
      },
      guardrails: {
        privacyConcernDiscardCount:
          data.guardrail?.privacy_concern_discard_count ?? 0,
        privacyConcernDiscardRate:
          !data.guardrail || data.guardrail.total_discarded === 0
            ? null
            : data.guardrail.privacy_concern_discard_count /
              data.guardrail.total_discarded,
      },
      freeComments: {
        discard: data.discardComments.map((r) => ({
          reason: r.reason,
          text: r.text,
          at: r.at,
        })),
        edit: data.editComments.map((r) => ({
          reason: r.reason,
          text: r.text,
          at: r.at,
        })),
      },
      sessions: data.sessionRows.map(mapSessionDetail),
      morningPlan: buildMorningPlanAnalytics(data),
      dailyCounts: {
        h1: fillDailyCounts(data.dailyH1),
        h3: fillDailyCounts(data.dailyH3),
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    logger.error({
      event: 'admin.ai_analytics.fetch_failed',
      error: String(err),
    });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
