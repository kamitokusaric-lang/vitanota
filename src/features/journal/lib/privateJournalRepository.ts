// SP-U02-04 Layer 3: Repository 型分離（Private 専用）
// CRUD 全般を扱い、型は JournalEntry（is_public を含む）。
// findTimeline は意図的に存在しない（公開タイムライン取得は PublicTimelineRepository を使う）。
//
// SP-U02-03: 所有者検証は API 層の明示 WHERE 句 + RLS の WITH CHECK で二重防御
// R1 対策: 全メソッドがトランザクションを第一引数で受け取り、withTenantUser 内で呼ばれる前提
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { journalEntries, journalEntryTags, emotionTags } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { JournalEntry, EmotionTag } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface Context {
  userId: string;
  tenantId: string;
}

export interface CreateEntryParams {
  content: string;
  tagIds: string[];
  isPublic: boolean;
}

export interface UpdateEntryParams {
  content?: string;
  tagIds?: string[];
  isPublic?: boolean;
}

export interface PaginationOptions {
  limit: number;
  offset: number;
}

export type EntryWithTags = JournalEntry & {
  tags: Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>;
};

async function attachTags(
  tx: DrizzleDb,
  entries: JournalEntry[]
): Promise<EntryWithTags[]> {
  if (entries.length === 0) return [];

  const entryIds = entries.map((e) => e.id);
  const rows = await tx
    .select({
      entryId: journalEntryTags.entryId,
      tagId: emotionTags.id,
      tagName: emotionTags.name,
      tagCategory: emotionTags.category,
    })
    .from(journalEntryTags)
    .innerJoin(emotionTags, eq(emotionTags.id, journalEntryTags.tagId))
    .where(inArray(journalEntryTags.entryId, entryIds));

  const tagMap = new Map<string, Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>>();
  for (const row of rows) {
    const list = tagMap.get(row.entryId) ?? [];
    list.push({ id: row.tagId, name: row.tagName, category: row.tagCategory });
    tagMap.set(row.entryId, list);
  }

  return entries.map((e) => ({ ...e, tags: tagMap.get(e.id) ?? [] }));
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
      })
      .returning();

    if (params.tagIds.length > 0) {
      await tx.insert(journalEntryTags).values(
        params.tagIds.map((tagId) => ({
          tenantId: ctx.tenantId,
          entryId: entry.id,
          tagId,
        }))
      );
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
    if (params.content !== undefined) updateValues.content = params.content;
    if (params.isPublic !== undefined) updateValues.isPublic = params.isPublic;

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

    // タグ更新: 既存を全 DELETE → 新規を一括 INSERT
    if (params.tagIds !== undefined) {
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
   * エントリ1件取得（所有者のみ・非公開含む）
   * 共有タイムライン経由の読み取りは PublicTimelineRepository を使うこと。
   */
  async findById(
    tx: DrizzleDb,
    id: string,
    ctx: Context
  ): Promise<JournalEntry | null> {
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

    return entry ?? null;
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

    return attachTags(tx, rows);
  }
}

export const privateJournalRepo = new PrivateJournalRepository();
