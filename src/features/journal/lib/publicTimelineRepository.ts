// SP-U02-04 Layer 3: Repository 型分離（Public 専用）
// このクラスは public_journal_entries VIEW のみを SELECT し、
// 型ブランド PublicJournalEntry を返却する。
// create/update/delete/findById/findMine は意図的に存在しない。
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  publicJournalEntries,
  journalEntryTags,
  emotionTags,
  journalEntryKnowledgeTags,
  knowledgeTags,
  users,
  userTenantProfiles,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type { EmotionTag } from '@/db/schema';
import type { PublicJournalEntry } from '@/shared/types/brand';
import {
  attachReactions,
  attachComments,
  type Reactions,
  type TimelineComment,
} from './privateJournalRepository';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TimelineOptions {
  limit: number;
  offset: number;
}

export type PublicEntryWithTags = PublicJournalEntry & {
  authorName: string | null;
  authorNickname: string | null;
  tags: Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>;
  knowledgeTags: Array<{ id: string; name: string }>;
  reactions: Reactions;
  // 職員室ノートのコメント (吹き出し)。時系列 asc。
  comments: TimelineComment[];
  // 投稿者が system_admin ロールを持つ場合 true (兼任アカウントによる「AI 風」投稿の判定)。
  // 現時点判定。chimo の system_admin 兼 school_admin アカウントが書いた投稿はここで true になる。
  isAiPost: boolean;
};

export interface TimelineResult {
  entries: PublicEntryWithTags[];
  total: number;
}

export class PublicTimelineRepository {
  /**
   * 共有タイムラインの取得（is_public=true のみ）
   * RLS の public_read ポリシーで tenant_id フィルタが強制される。
   * VIEW 定義により is_public 列は返却されない。
   */
  async findTimeline(
    tx: DrizzleDb,
    opts: TimelineOptions,
    ctx: { tenantId: string; userId: string },
  ): Promise<PublicEntryWithTags[]> {
    const rows = await tx
      .select({
        id: publicJournalEntries.id,
        tenantId: publicJournalEntries.tenantId,
        userId: publicJournalEntries.userId,
        content: publicJournalEntries.content,
        mood: publicJournalEntries.mood,
        kind: publicJournalEntries.kind,
        createdAt: publicJournalEntries.createdAt,
        updatedAt: publicJournalEntries.updatedAt,
        authorName: users.name,
        authorNickname: userTenantProfiles.nickname,
      })
      .from(publicJournalEntries)
      .leftJoin(users, eq(users.id, publicJournalEntries.userId))
      .leftJoin(
        userTenantProfiles,
        and(
          eq(userTenantProfiles.userId, publicJournalEntries.userId),
          eq(userTenantProfiles.tenantId, publicJournalEntries.tenantId),
        ),
      )
      .orderBy(desc(publicJournalEntries.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const entries = rows as unknown as Array<
      PublicJournalEntry & { authorName: string | null; authorNickname: string | null }
    >;
    if (entries.length === 0) return [];

    // タグを別クエリで取得して付与 (emotion_tags + knowledge_tags 両方)
    const entryIds = entries.map((e) => e.id);

    // emotion_tags (kind=tweet 用)
    const emotionRows = await tx
      .select({
        entryId: journalEntryTags.entryId,
        tagId: emotionTags.id,
        tagName: emotionTags.name,
        tagCategory: emotionTags.category,
      })
      .from(journalEntryTags)
      .innerJoin(emotionTags, eq(emotionTags.id, journalEntryTags.tagId))
      .where(inArray(journalEntryTags.entryId, entryIds));

    const emotionMap = new Map<
      string,
      Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>
    >();
    for (const row of emotionRows) {
      const list = emotionMap.get(row.entryId) ?? [];
      list.push({ id: row.tagId, name: row.tagName, category: row.tagCategory });
      emotionMap.set(row.entryId, list);
    }

    // knowledge_tags (kind=knowledge 用)
    const knowledgeRows = await tx
      .select({
        entryId: journalEntryKnowledgeTags.journalEntryId,
        tagId: knowledgeTags.id,
        tagName: knowledgeTags.name,
      })
      .from(journalEntryKnowledgeTags)
      .innerJoin(
        knowledgeTags,
        eq(knowledgeTags.id, journalEntryKnowledgeTags.knowledgeTagId),
      )
      .where(inArray(journalEntryKnowledgeTags.journalEntryId, entryIds));

    const knowledgeMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of knowledgeRows) {
      const list = knowledgeMap.get(row.entryId) ?? [];
      list.push({ id: row.tagId, name: row.tagName });
      knowledgeMap.set(row.entryId, list);
    }

    // isAiPost は handler 側で別 transaction (withSystemAdmin) で enrich する。
    // user_tenant_roles の teacher / school_admin RLS は tenant_id=NULL の system_admin row を
    // 見られないため、 teacher 権限の本 trx ではここで判定しても常に false になる。
    const withTags = entries.map((e) => ({
      ...e,
      tags: emotionMap.get(e.id) ?? [],
      knowledgeTags: knowledgeMap.get(e.id) ?? [],
      isAiPost: false as boolean,
    }));

    const withReactions = await attachReactions(tx, withTags, ctx);
    return attachComments(tx, withReactions);
  }

  /**
   * 共有タイムラインの件数取得（ページネーション用）
   * RLS フィルタが適用される。
   */
  async countTimeline(tx: DrizzleDb): Promise<number> {
    const result = await tx.select().from(publicJournalEntries);
    return result.length;
  }
}

export const publicTimelineRepo = new PublicTimelineRepository();
