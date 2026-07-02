// 職員室ノートのコメント Service
// RLS で権限担保。Service は「親エントリが tenant 内に存在し公開されているか」を確認する。
// (非公開 note へのコメントは踏み絵回避のため API 層で拒否する)
import { and, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import { journalEntries } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { JournalComment } from '@/db/schema';
import { JournalNotFoundError, ForbiddenError } from './errors';
import {
  journalCommentRepo,
  type JournalCommentWithUser,
} from './journalCommentRepository';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// 親エントリの存在 + 公開状態を確認 (RLS でも守られるが明示チェック)。
// 見えない/存在しない → 404、非公開 (自分の私的 note) → 403。
async function assertCommentable(
  tx: DrizzleDb,
  entryId: string,
  ctx: AuthContext,
): Promise<void> {
  const [entry] = await tx
    .select({ id: journalEntries.id, isPublic: journalEntries.isPublic })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.id, entryId),
        eq(journalEntries.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);
  if (!entry) throw new JournalNotFoundError();
  if (!entry.isPublic) {
    throw new ForbiddenError('非公開の投稿にはコメントできません');
  }
}

export class JournalCommentService {
  async listComments(
    entryId: string,
    ctx: AuthContext,
  ): Promise<JournalCommentWithUser[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      await assertCommentable(tx, entryId, ctx);
      return journalCommentRepo.findByEntry(tx, entryId, ctx);
    });
  }

  async createComment(
    entryId: string,
    body: string,
    ctx: AuthContext,
  ): Promise<JournalComment> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      await assertCommentable(tx, entryId, ctx);
      return journalCommentRepo.create(tx, { entryId, body }, ctx);
    });
  }

  async deleteComment(commentId: string, ctx: AuthContext): Promise<void> {
    await withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const deleted = await journalCommentRepo.delete(tx, commentId, ctx);
      if (!deleted) throw new JournalNotFoundError();
    });
  }
}

export const journalCommentService = new JournalCommentService();
