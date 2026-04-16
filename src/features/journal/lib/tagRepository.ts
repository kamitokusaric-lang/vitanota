// Unit-02 TagRepository
// タグの CRUD・システムデフォルトタグのシード・テナント内タグ一覧取得
// is_emotion フラグで感情タグ・業務タグを統合管理
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { tags, journalEntryTags } from '@/db/schema';
import type * as schema from '@/db/schema';
import type { Tag } from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface Context {
  userId: string;
  tenantId: string;
}

export interface CreateTagParams {
  name: string;
  isEmotion: boolean;
}

// NFR-U02-03: テナント作成時にシードするシステムデフォルトタグ
export const SYSTEM_DEFAULT_TAGS = [
  { name: 'うれしい', isEmotion: true, sortOrder: 1 },
  { name: 'つかれた', isEmotion: true, sortOrder: 2 },
  { name: 'やってみた', isEmotion: true, sortOrder: 3 },
  { name: '行き詰まり', isEmotion: true, sortOrder: 4 },
  { name: '相談したい', isEmotion: true, sortOrder: 5 },
  { name: '授業準備', isEmotion: false, sortOrder: 6 },
  { name: '保護者対応', isEmotion: false, sortOrder: 7 },
  { name: '行事準備', isEmotion: false, sortOrder: 8 },
] as const;

export class TagRepository {
  /**
   * テナント作成時のシステムデフォルトタグシード
   * Unit-01 の tenants 作成ハンドラ内で withTenantUser 経由で呼ばれる前提。
   */
  async seedSystemDefaults(tx: DrizzleDb, tenantId: string): Promise<Tag[]> {
    const inserted = await tx
      .insert(tags)
      .values(
        SYSTEM_DEFAULT_TAGS.map((t) => ({
          tenantId,
          name: t.name,
          isEmotion: t.isEmotion,
          isSystemDefault: true,
          sortOrder: t.sortOrder,
          createdBy: null,
        }))
      )
      .returning();
    return inserted;
  }

  /**
   * タグ作成
   * 同一テナント内で同名タグは UNIQUE 制約で拒否される（DB エラー）。
   */
  async create(
    tx: DrizzleDb,
    params: CreateTagParams,
    ctx: Context
  ): Promise<Tag> {
    const [tag] = await tx
      .insert(tags)
      .values({
        tenantId: ctx.tenantId,
        name: params.name,
        isEmotion: params.isEmotion,
        isSystemDefault: false,
        sortOrder: 0,
        createdBy: ctx.userId,
      })
      .returning();
    return tag;
  }

  /**
   * タグ削除（school_admin のみ・システムデフォルトは削除不可）
   * 削除時の影響を知るため affectedEntries 数を返す。
   * journal_entry_tags は複合 FK の CASCADE で自動削除される。
   */
  async delete(
    tx: DrizzleDb,
    id: string,
    ctx: Context
  ): Promise<{ deleted: boolean; affectedEntries: number }> {
    // 削除前に紐づき数を取得（監査ログ用）
    const affected = await tx
      .select({ entryId: journalEntryTags.entryId })
      .from(journalEntryTags)
      .where(eq(journalEntryTags.tagId, id));

    const result = await tx
      .delete(tags)
      .where(
        and(
          eq(tags.id, id),
          eq(tags.tenantId, ctx.tenantId),
          eq(tags.isSystemDefault, false)
        )
      )
      .returning({ id: tags.id });

    return {
      deleted: result.length > 0,
      affectedEntries: affected.length,
    };
  }

  /**
   * テナント内の全タグ取得
   * NFR-U02-01: 20件上限はクライアント側で制御、本メソッドは全件返す
   */
  async findAllByTenant(tx: DrizzleDb, ctx: Context): Promise<Tag[]> {
    const rows = await tx
      .select()
      .from(tags)
      .where(eq(tags.tenantId, ctx.tenantId))
      .orderBy(asc(tags.sortOrder), asc(tags.name));
    return rows;
  }

  /**
   * ID 指定で複数のタグが同じテナントに属することを検証（エントリ作成時に使用）
   * 渡された tagIds のうち、ctx.tenantId に属するものの ID を返す
   */
  async findValidTagIds(
    tx: DrizzleDb,
    tagIds: string[],
    ctx: Context
  ): Promise<string[]> {
    if (tagIds.length === 0) return [];
    const rows = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.tenantId, ctx.tenantId),
          inArray(tags.id, tagIds)
        )
      );
    return rows.map((r) => r.id);
  }
}

export const tagRepo = new TagRepository();
