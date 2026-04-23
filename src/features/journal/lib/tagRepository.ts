// EmotionTagRepository
// 感情タグ (emotion_tags) の CRUD・システムデフォルトタグのシード・テナント内タグ一覧取得
// category enum (positive/negative/neutral) で分類
// context タグは task_categories に役割を移譲済み (0016)
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { emotionTags, journalEntryTags } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { EmotionTag } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface Context {
  userId: string;
  tenantId: string;
}

export interface CreateTagParams {
  name: string;
  category: 'positive' | 'negative' | 'neutral';
}

// NFR-U02-03: テナント作成時にシードするシステムデフォルト感情タグ (15 件)
export const SYSTEM_DEFAULT_TAGS = [
  // positive
  { name: '喜び', category: 'positive' as const, sortOrder: 1 },
  { name: '達成感', category: 'positive' as const, sortOrder: 2 },
  { name: '充実', category: 'positive' as const, sortOrder: 3 },
  { name: '安心', category: 'positive' as const, sortOrder: 4 },
  { name: '感謝', category: 'positive' as const, sortOrder: 5 },
  // negative
  { name: '不安', category: 'negative' as const, sortOrder: 6 },
  { name: 'ストレス', category: 'negative' as const, sortOrder: 7 },
  { name: '疲労', category: 'negative' as const, sortOrder: 8 },
  { name: '焦り', category: 'negative' as const, sortOrder: 9 },
  { name: '不満', category: 'negative' as const, sortOrder: 10 },
  // neutral
  { name: '忙しい', category: 'neutral' as const, sortOrder: 11 },
  { name: '混乱', category: 'neutral' as const, sortOrder: 12 },
  { name: '気づき', category: 'neutral' as const, sortOrder: 13 },
  { name: '無力感', category: 'neutral' as const, sortOrder: 14 },
  { name: 'もやもや', category: 'neutral' as const, sortOrder: 15 },
] as const;

export class TagRepository {
  async seedSystemDefaults(tx: DrizzleDb, tenantId: string): Promise<EmotionTag[]> {
    const inserted = await tx
      .insert(emotionTags)
      .values(
        SYSTEM_DEFAULT_TAGS.map((t) => ({
          tenantId,
          name: t.name,
          category: t.category,
          isSystemDefault: true,
          sortOrder: t.sortOrder,
          createdBy: null,
        }))
      )
      .returning();
    return inserted;
  }

  async create(
    tx: DrizzleDb,
    params: CreateTagParams,
    ctx: Context
  ): Promise<EmotionTag> {
    const [tag] = await tx
      .insert(emotionTags)
      .values({
        tenantId: ctx.tenantId,
        name: params.name,
        category: params.category,
        isSystemDefault: false,
        sortOrder: 0,
        createdBy: ctx.userId,
      })
      .returning();
    return tag;
  }

  async delete(
    tx: DrizzleDb,
    id: string,
    ctx: Context
  ): Promise<{ deleted: boolean; affectedEntries: number }> {
    const affected = await tx
      .select({ entryId: journalEntryTags.entryId })
      .from(journalEntryTags)
      .where(eq(journalEntryTags.tagId, id));

    const result = await tx
      .delete(emotionTags)
      .where(
        and(
          eq(emotionTags.id, id),
          eq(emotionTags.tenantId, ctx.tenantId),
          eq(emotionTags.isSystemDefault, false)
        )
      )
      .returning({ id: emotionTags.id });

    return {
      deleted: result.length > 0,
      affectedEntries: affected.length,
    };
  }

  async findAllByTenant(tx: DrizzleDb, ctx: Context): Promise<EmotionTag[]> {
    const rows = await tx
      .select()
      .from(emotionTags)
      .where(eq(emotionTags.tenantId, ctx.tenantId))
      .orderBy(asc(emotionTags.sortOrder), asc(emotionTags.name));
    return rows;
  }

  async findValidTagIds(
    tx: DrizzleDb,
    tagIds: string[],
    ctx: Context
  ): Promise<string[]> {
    if (tagIds.length === 0) return [];
    const rows = await tx
      .select({ id: emotionTags.id })
      .from(emotionTags)
      .where(
        and(
          eq(emotionTags.tenantId, ctx.tenantId),
          inArray(emotionTags.id, tagIds)
        )
      );
    return rows.map((r) => r.id);
  }
}

export const tagRepo = new TagRepository();
