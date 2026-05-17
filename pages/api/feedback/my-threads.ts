// F3: 教員 → 自分のフィードバック thread 一覧取得
// 自分が投稿した feedback_submissions と、それぞれに紐づく feedback_replies を返す。
// クエリ ?summary=1 のときは { unreadAny: boolean } のみ返す (FAB dot 用)。
//
// 踏み絵防御:
//   - 自分の submission のみ可視 (feedback_replies は RLS でも担保、API 層でも user_id 一致を強制)
//   - replier_user_id はレスポンスに含めない (UI 一律「運営より」表記)
//   - school_admin も自分の submission に対する returns は読める (0039 own-row パターン)
import type { NextApiRequest, NextApiResponse } from 'next';
import { eq, desc, asc, and, inArray, sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { feedbackSubmissions, feedbackTopics, feedbackReplies } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const summaryOnly = req.query.summary === '1';

  try {
    const result = await withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (db) => {
      if (summaryOnly) {
        // 未読のうち最新返信を 1 件取得 (Modal タイトル直下に「開発者からの返信が届きました」+ 本文 を出すため)
        const latestUnreadRows = await db
          .select({
            body: feedbackReplies.body,
            topicTitle: feedbackTopics.title,
            createdAt: feedbackReplies.createdAt,
          })
          .from(feedbackReplies)
          .innerJoin(
            feedbackSubmissions,
            eq(feedbackSubmissions.id, feedbackReplies.submissionId),
          )
          .innerJoin(
            feedbackTopics,
            eq(feedbackTopics.id, feedbackSubmissions.topicId),
          )
          .where(
            and(
              eq(feedbackSubmissions.userId, ctx.userId),
              eq(feedbackSubmissions.tenantId, ctx.tenantId),
              sql`(${feedbackSubmissions.lastReadBySubmitterAt} IS NULL
                   OR ${feedbackReplies.createdAt} > ${feedbackSubmissions.lastReadBySubmitterAt})`,
            ),
          )
          .orderBy(desc(feedbackReplies.createdAt))
          .limit(1);
        const latest = latestUnreadRows[0] ?? null;
        return {
          unreadAny: latest !== null,
          latestUnreadReply: latest
            ? {
                body: latest.body,
                topicTitle: latest.topicTitle,
                createdAt: latest.createdAt,
              }
            : null,
        };
      }

      const submissions = await db
        .select({
          submissionId: feedbackSubmissions.id,
          content: feedbackSubmissions.content,
          createdAt: feedbackSubmissions.createdAt,
          lastReadAt: feedbackSubmissions.lastReadBySubmitterAt,
          topicTitle: feedbackTopics.title,
        })
        .from(feedbackSubmissions)
        .innerJoin(feedbackTopics, eq(feedbackTopics.id, feedbackSubmissions.topicId))
        .where(
          and(
            eq(feedbackSubmissions.userId, ctx.userId),
            eq(feedbackSubmissions.tenantId, ctx.tenantId),
          ),
        )
        .orderBy(desc(feedbackSubmissions.createdAt));

      if (submissions.length === 0) {
        return { threads: [] };
      }

      const submissionIds = submissions.map((s) => s.submissionId);
      const replies = await db
        .select({
          id: feedbackReplies.id,
          submissionId: feedbackReplies.submissionId,
          body: feedbackReplies.body,
          createdAt: feedbackReplies.createdAt,
        })
        .from(feedbackReplies)
        .where(
          and(
            eq(feedbackReplies.tenantId, ctx.tenantId),
            inArray(feedbackReplies.submissionId, submissionIds),
          ),
        )
        .orderBy(asc(feedbackReplies.createdAt));

      const repliesBySubmission = new Map<string, typeof replies>();
      for (const r of replies) {
        const arr = repliesBySubmission.get(r.submissionId) ?? [];
        arr.push(r);
        repliesBySubmission.set(r.submissionId, arr);
      }

      const threads = submissions.map((s) => {
        const rs = repliesBySubmission.get(s.submissionId) ?? [];
        const latestReplyAt = rs.length > 0 ? rs[rs.length - 1].createdAt : null;
        const lastReadAt = s.lastReadAt;
        const hasUnread =
          rs.length > 0 && (lastReadAt === null || (latestReplyAt !== null && latestReplyAt > lastReadAt));
        return {
          submissionId: s.submissionId,
          topicTitle: s.topicTitle,
          content: s.content,
          createdAt: s.createdAt,
          replyCount: rs.length,
          latestReplyAt,
          hasUnread,
          replies: rs.map((r) => ({ id: r.id, body: r.body, createdAt: r.createdAt })),
        };
      });

      return { threads };
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error({ event: 'feedback.my_threads.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
