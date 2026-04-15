// SP-U02-04 Layer 3: Repository 型分離（Public 専用）
// このクラスは public_journal_entries VIEW のみを SELECT し、
// 型ブランド PublicJournalEntry を返却する。
// create/update/delete/findById/findMine は意図的に存在しない。
import { desc, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { publicJournalEntries } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { PublicJournalEntry } from '@/shared/types/brand';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TimelineOptions {
  limit: number;
  offset: number;
}

export interface TimelineResult {
  entries: PublicJournalEntry[];
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
  ): Promise<PublicJournalEntry[]> {
    const rows = await tx
      .select()
      .from(publicJournalEntries)
      .orderBy(desc(publicJournalEntries.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
    // VIEW 経由で is_public 列が存在しない
    // 型アサーションで PublicJournalEntry ブランドを付与
    return rows as unknown as PublicJournalEntry[];
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
