// SP-U02-04 Layer 3: Repository 型分離（Public 専用）
// このクラスは public_journal_entries VIEW のみを SELECT し、
// 型ブランド PublicJournalEntry を返却する。
// create/update/delete/findById/findMine は意図的に存在しない。
import { desc, eq, inArray } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { publicJournalEntries, journalEntryTags, emotionTags } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { EmotionTag } from '@/db/schema';
import type { PublicJournalEntry } from '@/shared/types/brand';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TimelineOptions {
  limit: number;
  offset: number;
}

export type PublicEntryWithTags = PublicJournalEntry & {
  tags: Array<Pick<EmotionTag, 'id' | 'name' | 'category'>>;
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
    opts: TimelineOptions
  ): Promise<PublicEntryWithTags[]> {
    const rows = await tx
      .select()
      .from(publicJournalEntries)
      .orderBy(desc(publicJournalEntries.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    const entries = rows as unknown as PublicJournalEntry[];
    if (entries.length === 0) return [];

    // タグを別クエリで取得して付与
    const entryIds = entries.map((e) => e.id);
    const tagRows = await tx
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
    for (const row of tagRows) {
      const list = tagMap.get(row.entryId) ?? [];
      list.push({ id: row.tagId, name: row.tagName, category: row.tagCategory });
      tagMap.set(row.entryId, list);
    }

    return entries.map((e) => ({ ...e, tags: tagMap.get(e.id) ?? [] }));
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
