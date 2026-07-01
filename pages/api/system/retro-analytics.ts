// system_admin 用: ふりかえり → AIリコメンドの集計 API。
// 権限: system_admin のみ。GET のみ。
//
// 踏み絵 (project_ai_sessions_visibility / feedback_observed_moment_broken):
//   - 出力は aggregate のみ。user_id / tenant_id / input / reason / 個別行は返さない
//   - school_admin 不可視は認証層で 403
import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from 'drizzle-orm';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { withSystemAdmin } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
import type {
  RetroAnalyticsResponse,
  RetroCategoryBreakdown,
} from '@/features/system/retroAnalyticsTypes';

const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type SummaryRow = {
  computed_total: number;
  surfaced: number;
  published: number;
  dismissed: number;
  proposed: number;
  body_changed: number;
  category_changed: number;
};

type CategoryRow = {
  category: string;
  surfaced: number;
  published: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'start (YYYY-MM-DD) / end (YYYY-MM-DD) は必須です',
    });
  }
  const { start, end } = parsed.data;

  try {
    const data = await withSystemAdmin(session.user.userId, async (tx) => {
      const period = sql`
        (created_at AT TIME ZONE 'Asia/Tokyo')::date >= ${start}::date
        AND (created_at AT TIME ZONE 'Asia/Tokyo')::date <= ${end}::date
      `;
      const surfaced = sql`output_json->>'surface' = 'true'`;
      // 提示された主提案区分 (tweet のみ提案は 'tweet'、主提案なしは 'none')。
      const derivedCategory = sql`
        coalesce(
          output_json->'primary'->>'category',
          CASE WHEN output_json->'tweet' IS NOT NULL THEN 'tweet' ELSE 'none' END
        )`;

      const summaryRes = await tx.execute<SummaryRow>(sql`
        SELECT
          count(*)::int AS computed_total,
          count(*) FILTER (WHERE ${surfaced})::int AS surfaced,
          count(*) FILTER (WHERE ${surfaced} AND status = 'published')::int AS published,
          count(*) FILTER (WHERE ${surfaced} AND status = 'dismissed')::int AS dismissed,
          count(*) FILTER (WHERE ${surfaced} AND status = 'proposed')::int AS proposed,
          count(*) FILTER (WHERE status = 'published' AND body_changed = true)::int AS body_changed,
          count(*) FILTER (
            WHERE status = 'published' AND final_category IS NOT NULL
              AND final_category <> ${derivedCategory}
          )::int AS category_changed
        FROM journal_recommendations
        WHERE ${period}
      `);

      const categoryRes = await tx.execute<CategoryRow>(sql`
        SELECT
          ${derivedCategory} AS category,
          count(*) FILTER (WHERE ${surfaced})::int AS surfaced,
          count(*) FILTER (WHERE ${surfaced} AND status = 'published')::int AS published
        FROM journal_recommendations
        WHERE ${period} AND ${surfaced}
        GROUP BY 1
      `);

      return {
        summary: summaryRes.rows[0],
        categories: categoryRes.rows,
      };
    });

    const s = data.summary;
    const byCategory: RetroCategoryBreakdown[] = (data.categories ?? [])
      .map((r) => ({
        category: r.category as RetroCategoryBreakdown['category'],
        surfaced: Number(r.surfaced),
        published: Number(r.published),
      }))
      .sort((a, b) => b.surfaced - a.surfaced);

    const response: RetroAnalyticsResponse = {
      computedTotal: Number(s?.computed_total ?? 0),
      surfaced: Number(s?.surfaced ?? 0),
      published: Number(s?.published ?? 0),
      dismissed: Number(s?.dismissed ?? 0),
      proposed: Number(s?.proposed ?? 0),
      bodyChanged: Number(s?.body_changed ?? 0),
      categoryChanged: Number(s?.category_changed ?? 0),
      byCategory,
    };
    return res.status(200).json(response);
  } catch (err) {
    logger.error({ event: 'admin.retro_analytics.error', err });
    return res
      .status(500)
      .json({ error: 'INTERNAL_ERROR', message: '処理中にエラーが発生しました' });
  }
}
