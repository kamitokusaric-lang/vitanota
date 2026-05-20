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

// chimo 2026-05-20: H3 morning_plan 集計は撤去 (project_h3_reframing_20260520)。
// 旧 MpFunnelRow / MpDoneRow / MpZeroDoneRow / MpOutlookRow / MpBucketsRow /
// MpCapacityRow / MpNextDayRow + buildMorningPlanAnalytics は削除。

function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
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

      // 日別件数 (過去 30 日、JST 日付で GROUP BY)
      // chimo 2026-05-20: H3 morning_plan の集計は撤去 (project_h3_reframing_20260520)。
      // H1 = quick_capture のみ残す。
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
        dailyH1: dailyH1Result.rows as unknown as DailyCountRow[],
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
      dailyCounts: {
        h1: fillDailyCounts(data.dailyH1),
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
