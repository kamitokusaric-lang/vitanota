// SP-U02-04 Layer 3: Repository 型分離（Private 専用）
// CRUD 全般を扱い、型は JournalEntry（is_public を含む）。
// findTimeline は意図的に存在しない（公開タイムライン取得は PublicTimelineRepository を使う）。
//
// SP-U02-03: 所有者検証は API 層の明示 WHERE 句 + RLS の WITH CHECK で二重防御
// R1 対策: 全メソッドがトランザクションを第一引数で受け取り、withTenantUser 内で呼ばれる前提
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  journalEntries,
  journalEntryTags,
  emotionTags,
  journalEntryKnowledgeTags,
  knowledgeTags,
  journalKnowledgeReactions,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type { JournalEntry, EmotionTag } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface Context {
  userId: string;
  tenantId: string;
}

export type MoodLevel =
  | 'very_positive'
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'very_negative';

export type JournalEntryKind = 'diary' | 'knowledge' | 'tweet';

export interface CreateEntryParams {
  // kind は次ステップで repository INSERT に組み込む。今は受け取るのみ (DB default 'diary')。
  kind?: JournalEntryKind;
  content: string;
  tagIds: string[];
  isPublic: boolean;
  // mood は kind='diary' のみ必須 (Zod superRefine で担保)、それ以外で null/undefined
  mood?: MoodLevel | null;
}

export interface UpdateEntryParams {
  kind?: JournalEntryKind;
  content?: string;
  tagIds?: string[];
  isPublic?: boolean;
  mood?: MoodLevel | null;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

// H9 検証 (2026-05-27): リアクションを 3 種化 (knowledge / appreciation / endorsement)。
// 1 ユーザー × 1 投稿 × 1 reaction_type で 1 行、 3 種別とも独立 toggle 可能。
export const REACTION_TYPES = [
  'knowledge',
  'appreciation',
  'endorsement',
] as const;
export type JournalReactionType = (typeof REACTION_TYPES)[number];

export interface ReactionState {
  count: number;
  mine: boolean;
}

export type Reactions = Record<JournalReactionType, ReactionState>;

function emptyReactions(): Reactions {
  return {
    knowledge:    { count: 0, mine: false },
    appreciation: { count: 0, mine: false },
    endorsement:  { count: 0, mine: false },
  };
}

export type EntryWithTags = JournalEntry & {
  tags: Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>;
  knowledgeTags: Array<{ id: string; name: string }>;
  reactions: Reactions;
};

// reaction の count + 自分の有無 を 3 種類分まとめて merge
// public/private 両方で使うため export
export async function attachReactions<T extends { id: string }>(
  tx: DrizzleDb,
  entries: T[],
  ctx: Context,
): Promise<Array<T & { reactions: Reactions }>> {
  if (entries.length === 0) return [];
  const entryIds = entries.map((e) => e.id);

  // entry × type 別の count (1 query で GROUP BY)
  const countRows = await tx
    .select({
      entryId: journalKnowledgeReactions.journalEntryId,
      type: journalKnowledgeReactions.reactionType,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(journalKnowledgeReactions)
    .where(inArray(journalKnowledgeReactions.journalEntryId, entryIds))
    .groupBy(
      journalKnowledgeReactions.journalEntryId,
      journalKnowledgeReactions.reactionType,
    );

  const countMap = new Map<string, Partial<Record<JournalReactionType, number>>>();
  for (const row of countRows) {
    const map = countMap.get(row.entryId) ?? {};
    map[row.type as JournalReactionType] = row.count;
    countMap.set(row.entryId, map);
  }

  // 自分が ON にしてる (entry, type) ペア
  const myRows = await tx
    .select({
      entryId: journalKnowledgeReactions.journalEntryId,
      type: journalKnowledgeReactions.reactionType,
    })
    .from(journalKnowledgeReactions)
    .where(
      and(
        eq(journalKnowledgeReactions.userId, ctx.userId),
        inArray(journalKnowledgeReactions.journalEntryId, entryIds),
      ),
    );
  const mySet = new Set<string>();
  for (const row of myRows) mySet.add(`${row.entryId}:${row.type}`);

  return entries.map((e) => {
    const reactions = emptyReactions();
    const counts = countMap.get(e.id) ?? {};
    for (const type of REACTION_TYPES) {
      reactions[type] = {
        count: counts[type] ?? 0,
        mine: mySet.has(`${e.id}:${type}`),
      };
    }
    return { ...e, reactions };
  });
}

async function attachTags(
  tx: DrizzleDb,
  entries: JournalEntry[],
  ctx: Context,
): Promise<EntryWithTags[]> {
  if (entries.length === 0) return [];

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

  const withTags = entries.map((e) => ({
    ...e,
    tags: emotionMap.get(e.id) ?? [],
    knowledgeTags: knowledgeMap.get(e.id) ?? [],
  }));

  return attachReactions(tx, withTags, ctx);
}

export class PrivateJournalRepository {
  /**
   * エントリ作成
   * tagIds は journal_entry_tags に一括 INSERT される。
   * SP-U02-04 Layer 8: 複合 FK によりクロステナントのタグ指定は DB レベルで拒否される。
   */
  async create(
    tx: DrizzleDb,
    params: CreateEntryParams,
    ctx: Context
  ): Promise<JournalEntry> {
    const [entry] = await tx
      .insert(journalEntries)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        content: params.content,
        isPublic: params.isPublic,
        mood: params.mood,
        kind: params.kind ?? 'diary',
      })
      .returning();

    if (params.tagIds.length > 0) {
      // kind 別に振り分け:
      //   tweet     → emotion_tags (既存 journal_entry_tags)
      //   knowledge → knowledge_tags (journal_entry_knowledge_tags)
      //   diary     → Zod superRefine でガード済 (この分岐に到達しない)
      if (params.kind === 'knowledge') {
        await tx.insert(journalEntryKnowledgeTags).values(
          params.tagIds.map((tagId) => ({
            tenantId: ctx.tenantId,
            journalEntryId: entry.id,
            knowledgeTagId: tagId,
          })),
        );
      } else {
        // kind=tweet または未指定 (default 'diary' だが Zod でタグ禁止)
        await tx.insert(journalEntryTags).values(
          params.tagIds.map((tagId) => ({
            tenantId: ctx.tenantId,
            entryId: entry.id,
            tagId,
          }))
        );
      }
    }

    return entry;
  }

  /**
   * エントリ更新
   * SP-U02-03: API 層の明示 WHERE + RLS の二重防御
   * 他人のエントリを指定した場合、WHERE で0行マッチ → null 返却
   */
  async update(
    tx: DrizzleDb,
    id: string,
    params: UpdateEntryParams,
    ctx: Context
  ): Promise<JournalEntry | null> {
    const updateValues: Partial<JournalEntry> = {
      updatedAt: new Date(),
    };
    if (params.content !== undefined) {
      updateValues.content = params.content;
    }
    if (params.isPublic !== undefined) updateValues.isPublic = params.isPublic;
    if (params.mood !== undefined) updateValues.mood = params.mood;

    const [entry] = await tx
      .update(journalEntries)
      .set(updateValues)
      .where(
        and(
          eq(journalEntries.id, id),
          eq(journalEntries.userId, ctx.userId),
          eq(journalEntries.tenantId, ctx.tenantId)
        )
      )
      .returning();

    if (!entry) return null;

    // タグ更新: kind 別に既存を全 DELETE → 新規を一括 INSERT
    //   knowledge → journal_entry_knowledge_tags
    //   tweet     → journal_entry_tags (emotion_tags)
    //   diary     → tagIds 空 (Zod でガード済) なので分岐不要
    if (params.tagIds !== undefined) {
      if (params.kind === 'knowledge') {
        await tx
          .delete(journalEntryKnowledgeTags)
          .where(eq(journalEntryKnowledgeTags.journalEntryId, id));

        if (params.tagIds.length > 0) {
          await tx.insert(journalEntryKnowledgeTags).values(
            params.tagIds.map((tagId) => ({
              tenantId: ctx.tenantId,
              journalEntryId: id,
              knowledgeTagId: tagId,
            })),
          );
        }
      } else {
        // tweet (or kind 未指定 = diary フォールバック)
        await tx
          .delete(journalEntryTags)
          .where(eq(journalEntryTags.entryId, id));

        if (params.tagIds.length > 0) {
          await tx.insert(journalEntryTags).values(
            params.tagIds.map((tagId) => ({
              tenantId: ctx.tenantId,
              entryId: id,
              tagId,
            }))
          );
        }
      }
    }

    return entry;
  }

  /**
   * エントリ削除
   * SP-U02-03: API 層の明示 WHERE + RLS の二重防御
   * journal_entry_tags は CASCADE で自動削除される。
   */
  async delete(tx: DrizzleDb, id: string, ctx: Context): Promise<boolean> {
    const result = await tx
      .delete(journalEntries)
      .where(
        and(
          eq(journalEntries.id, id),
          eq(journalEntries.userId, ctx.userId),
          eq(journalEntries.tenantId, ctx.tenantId)
        )
      )
      .returning({ id: journalEntries.id });

    return result.length > 0;
  }

  /**
   * エントリ1件取得（所有者のみ・非公開含む、tags 付き）
   * 共有タイムライン経由の読み取りは PublicTimelineRepository を使うこと。
   */
  async findById(
    tx: DrizzleDb,
    id: string,
    ctx: Context
  ): Promise<EntryWithTags | null> {
    const [entry] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.id, id),
          eq(journalEntries.userId, ctx.userId),
          eq(journalEntries.tenantId, ctx.tenantId)
        )
      )
      .limit(1);

    if (!entry) return null;
    const [withTags] = await attachTags(tx, [entry], ctx);
    return withTags;
  }

  /**
   * マイ記録（自分の全エントリ、公開・非公開両方）
   * RLS owner_all ポリシーでフィルタされる。
   */
  async findMine(
    tx: DrizzleDb,
    opts: PaginationOptions,
    ctx: Context
  ): Promise<EntryWithTags[]> {
    const rows = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.userId, ctx.userId),
          eq(journalEntries.tenantId, ctx.tenantId)
        )
      )
      .orderBy(desc(journalEntries.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    return attachTags(tx, rows, ctx);
  }
}

export const privateJournalRepo = new PrivateJournalRepository();
