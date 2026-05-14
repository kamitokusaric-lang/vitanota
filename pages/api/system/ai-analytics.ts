// system_admin 用: AI 整理機能 (H1 検証 Phase B) の集計 API
// 権限: system_admin のみ。GET のみ。
//
// 設計: post-mvp-backlog.md「system_admin AI 改善 分析画面 (Phase B)」
// 踏み絵 (project_ai_sessions_visibility / feedback_observed_moment_broken):
//   - 出力は aggregate のみ。user_id / tenant_id / input_text / 個別 session は返さない
//   - school_admin 不可視は API 認証層で 403
//   - 期間フィルタは v1 では未実装 (全期間 aggregate のみ、データ量が増えたら追加)
import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { aiSessions } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import type { AiAnalyticsResponse } from '@/features/ai-chat/analyticsTypes';

interface SummaryRow {
  total_sessions: number;
  confirmed_count: number;
  discarded_count: number;
  draft_count: number;
  organize_score_avg: string | null;
  survey_count: number;
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
  organize_score_avg: string | null;
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
  input_burden_score_avg: string | null;
  input_burden_score_count: number;
  privacy_concern_discard_count: number;
  total_discarded: number;
}

interface FreeCommentRow {
  reason: string | null;
  text: string;
  at: string | null;
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
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'draft')::int            AS draft_count,
          AVG((ai_output_json->'survey'->>'organizeScore')::int)                 AS organize_score_avg,
          COUNT(*) FILTER (WHERE ai_output_json->'survey'->>'organizeScore' IS NOT NULL)::int AS survey_count
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
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'discarded')::int AS discarded,
          AVG((ai_output_json->'survey'->>'organizeScore')::int)         AS organize_score_avg
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

      // ガードレール: 入力負担スコア + privacy_concern 破棄
      const guardrailResult = await tx.execute(sql`
        SELECT
          AVG((ai_output_json->'survey'->>'inputBurdenScore')::int)::numeric                          AS input_burden_score_avg,
          COUNT(*) FILTER (WHERE ai_output_json->'survey'->>'inputBurdenScore' IS NOT NULL)::int      AS input_burden_score_count,
          COUNT(*) FILTER (WHERE ai_output_json->>'discardReason' = 'privacy_concern')::int           AS privacy_concern_discard_count,
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'discarded')::int                              AS total_discarded
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
      };
    });

    const response: AiAnalyticsResponse = {
      summary: {
        totalSessions: data.summary?.total_sessions ?? 0,
        confirmedCount: data.summary?.confirmed_count ?? 0,
        discardedCount: data.summary?.discarded_count ?? 0,
        draftCount: data.summary?.draft_count ?? 0,
        organizeScoreAvg:
          data.summary?.organize_score_avg == null
            ? null
            : Number(data.summary.organize_score_avg),
        surveyCount: data.summary?.survey_count ?? 0,
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
        organizeScoreAvg:
          r.organize_score_avg == null ? null : Number(r.organize_score_avg),
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
        inputBurdenScoreAvg:
          data.guardrail?.input_burden_score_avg == null
            ? null
            : Number(data.guardrail.input_burden_score_avg),
        inputBurdenScoreCount: data.guardrail?.input_burden_score_count ?? 0,
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
