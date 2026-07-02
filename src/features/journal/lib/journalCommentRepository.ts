// 職員室ノートのコメント Repository
// task_comments の Repository と同型 (join users で著者名付与、時系列 asc)。
import { and, asc, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { journalComments, users } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { JournalComment } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export type JournalCommentWithUser = JournalComment & {
  userName: string | null;
};

export interface JournalCommentContext {
  userId: string;
  tenantId: string;
}

export class JournalCommentRepository {
  async findByEntry(
    tx: DrizzleDb,
    entryId: string,
    ctx: JournalCommentContext,
  ): Promise<JournalCommentWithUser[]> {
    const rows = await tx
      .select({
        id: journalComments.id,
        tenantId: journalComments.tenantId,
        journalEntryId: journalComments.journalEntryId,
        userId: journalComments.userId,
        body: journalComments.body,
        createdAt: journalComments.createdAt,
        updatedAt: journalComments.updatedAt,
        userName: users.name,
      })
      .from(journalComments)
      .leftJoin(users, eq(users.id, journalComments.userId))
      .where(
        and(
          eq(journalComments.journalEntryId, entryId),
          eq(journalComments.tenantId, ctx.tenantId),
        ),
      )
      .orderBy(asc(journalComments.createdAt));
    return rows;
  }

  async create(
    tx: DrizzleDb,
    params: { entryId: string; body: string },
    ctx: JournalCommentContext,
  ): Promise<JournalComment> {
    const [row] = await tx
      .insert(journalComments)
      .values({
        tenantId: ctx.tenantId,
        journalEntryId: params.entryId,
        userId: ctx.userId,
        body: params.body,
      })
      .returning();
    return row;
  }

  async delete(
    tx: DrizzleDb,
    commentId: string,
    ctx: JournalCommentContext,
  ): Promise<boolean> {
    // RLS (自分 or school_admin) が削除可否を強制。ここは tenant フィルタのみ。
    const result = await tx
      .delete(journalComments)
      .where(
        and(
          eq(journalComments.id, commentId),
          eq(journalComments.tenantId, ctx.tenantId),
        ),
      )
      .returning({ id: journalComments.id });
    return result.length > 0;
  }
}

export const journalCommentRepo = new JournalCommentRepository();
