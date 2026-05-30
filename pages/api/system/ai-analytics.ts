// system_admin 用: AI 整理機能 (H1 検証 Phase B) の集計 API
// 権限: system_admin のみ。GET のみ。
//
// 踏み絵 (project_ai_sessions_visibility / feedback_observed_moment_broken):
//   - 出力は aggregate のみ。user_id / tenant_id / input_text / 個別 session は返さない
//   - school_admin 不可視は API 認証層で 403
//
// 2026-05-30 (chimo): AI 改善ページをアクセス分布ページに統合。期間フィルタ (start/end、
//   JST 日付) に対応。表示しなくなった集計 (promptVersions / categoryEdit / 破棄理由 /
//   編集理由 / 自由コメント / セッション詳細 / 日別件数) は撤去。個別セッション詳細は
//   データエクスポート (ai-session-export) に分離。
import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { aiSessions } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import type { AiAnalyticsResponse } from '@/features/ai-chat/analyticsTypes';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  // 期間フィルタ (start / end は JST 日付、 inclusive)。 未指定なら全期間。
  const startStr = req.query.start;
  const endStr = req.query.end;
  let periodCond = sql``;
  if (typeof startStr === 'string' && typeof endStr === 'string') {
    if (!DATE_RE.test(startStr) || !DATE_RE.test(endStr)) {
      return res
        .status(400)
        .json({ error: 'INVALID_QUERY', message: 'start / end は YYYY-MM-DD' });
    }
    const startUtc = new Date(`${startStr}T00:00:00+09:00`);
    const endUtcInclusive = new Date(`${endStr}T00:00:00+09:00`);
    if (Number.isNaN(startUtc.getTime()) || Number.isNaN(endUtcInclusive.getTime())) {
      return res
        .status(400)
        .json({ error: 'INVALID_QUERY', message: '日付の解釈に失敗' });
    }
    const endUtcExclusive = new Date(endUtcInclusive.getTime() + ONE_DAY_MS);
    periodCond = sql`AND ${aiSessions.createdAt} >= ${startUtc} AND ${aiSessions.createdAt} < ${endUtcExclusive}`;
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
        WHERE TRUE ${periodCond}
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
        WHERE ${aiSessions.status} = 'confirmed' ${periodCond}
      `);

      // 副指標: 1 入力あたり候補生成数 + 確定までの時間
      const subMetricsResult = await tx.execute(sql`
        SELECT
          AVG(jsonb_array_length(ai_output_json->'extraction'->'tasks'))::numeric AS candidates_per_input_avg,
          COUNT(*) FILTER (WHERE jsonb_typeof(ai_output_json->'extraction'->'tasks') = 'array')::int AS candidates_per_input_count,
          AVG(EXTRACT(EPOCH FROM ((ai_output_json->>'confirmedAt')::timestamptz - created_at)))::numeric AS time_to_confirm_seconds_avg,
          COUNT(*) FILTER (WHERE ai_output_json->>'confirmedAt' IS NOT NULL)::int AS time_to_confirm_count
        FROM ${aiSessions}
        WHERE TRUE ${periodCond}
      `);

      // 副指標: 再利用率 (ユニーク user 数 / 2 回以上使った user 数)
      const reuseResult = await tx.execute(sql`
        SELECT
          COUNT(*)::int                                  AS unique_users,
          COUNT(*) FILTER (WHERE per_user_count >= 2)::int AS reused_users
        FROM (
          SELECT user_id, COUNT(*) AS per_user_count
          FROM ${aiSessions}
          WHERE TRUE ${periodCond}
          GROUP BY user_id
        ) AS u
      `);

      // ガードレール: privacy_concern 破棄
      const guardrailResult = await tx.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE ai_output_json->>'discardReason' = 'privacy_concern')::int  AS privacy_concern_discard_count,
          COUNT(*) FILTER (WHERE ${aiSessions.status} = 'discarded')::int                     AS total_discarded
        FROM ${aiSessions}
        WHERE TRUE ${periodCond}
      `);

      return {
        summary: (summaryResult.rows[0] as unknown as SummaryRow) ?? null,
        editRate: (editRateResult.rows[0] as unknown as EditRateRow) ?? null,
        subMetrics: (subMetricsResult.rows[0] as unknown as SubMetricsRow) ?? null,
        reuse: (reuseResult.rows[0] as unknown as ReuseRow) ?? null,
        guardrail: (guardrailResult.rows[0] as unknown as GuardrailRow) ?? null,
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
