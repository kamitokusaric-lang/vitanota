// Unit-02 JournalEntryService
// ビジネスロジック層：複数 Repository を跨ぐ操作を集約し、
// トランザクション境界（withTenantUser）と監査ログを管理する。
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole } from './apiHelpers';
import { LogEvents, logEvent, logWarnEvent } from '@/shared/lib/log-events';
import {
  privateJournalRepo,
  type CreateEntryParams,
  type UpdateEntryParams,
  type Context,
} from './privateJournalRepository';
import { tagRepo } from './tagRepository';
import {
  JournalNotFoundError,
  InvalidTagReferenceError,
} from './errors';
import type { JournalEntry } from '@/db/schema';

export interface ServiceContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

export class JournalEntryService {
  /**
   * エントリ作成
   * 1. tagIds がすべてテナントに属することを検証
   * 2. journal_entries に INSERT
   * 3. journal_entry_tags に一括 INSERT
   * 4. 監査ログ出力
   */
  async createEntry(
    params: CreateEntryParams,
    ctx: ServiceContext
  ): Promise<JournalEntry> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      // タグ検証（クロステナント防止・アプリ層チェック）
      // SP-U02-04 Layer 8 の複合 FK でも同じエラーになるが、より明示的なエラーを返す
      if (params.tagIds.length > 0) {
        const validIds = await tagRepo.findValidTagIds(tx, params.tagIds, ctx);
        const invalidIds = params.tagIds.filter((id) => !validIds.includes(id));
        if (invalidIds.length > 0) {
          logWarnEvent(
            LogEvents.JournalEntryCreateInvalidTags,
            {
              userId: ctx.userId,
              tenantId: ctx.tenantId,
              invalidTagIds: invalidIds,
            },
            'Invalid tag references'
          );
          throw new InvalidTagReferenceError(invalidIds);
        }
      }

      const entry = await privateJournalRepo.create(tx, params, ctx);

      logEvent(LogEvents.JournalEntryCreated, {
        entryId: entry.id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        isPublic: entry.isPublic,
        tagCount: params.tagIds.length,
      });

      return entry;
    });
  }

  /**
   * エントリ更新
   * 1. 所有者検証は Repository の WHERE 句 + RLS WITH CHECK で二重化
   * 2. タグ更新がある場合はタグ検証
   * 3. 監査ログ出力
   */
  async updateEntry(
    id: string,
    params: UpdateEntryParams,
    ctx: ServiceContext
  ): Promise<JournalEntry> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      // タグ更新時の検証
      if (params.tagIds !== undefined && params.tagIds.length > 0) {
        const validIds = await tagRepo.findValidTagIds(tx, params.tagIds, ctx);
        const invalidIds = params.tagIds.filter((id) => !validIds.includes(id));
        if (invalidIds.length > 0) {
          throw new InvalidTagReferenceError(invalidIds);
        }
      }

      const entry = await privateJournalRepo.update(tx, id, params, ctx);
      if (!entry) {
        // 所有者以外 or 存在しない → 404（情報隠蔽のため両者を区別しない）
        logEvent(LogEvents.JournalEntryUpdateNotFound, {
          entryId: id,
          userId: ctx.userId,
          tenantId: ctx.tenantId,
        });
        throw new JournalNotFoundError();
      }

      logEvent(LogEvents.JournalEntryUpdated, {
        entryId: entry.id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      });

      return entry;
    });
  }

  /**
   * エントリ削除
   * 所有者検証は二重化、journal_entry_tags は複合 FK の CASCADE で自動削除
   */
  async deleteEntry(id: string, ctx: ServiceContext): Promise<void> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const deleted = await privateJournalRepo.delete(tx, id, ctx);
      if (!deleted) {
        throw new JournalNotFoundError();
      }

      logEvent(LogEvents.JournalEntryDeleted, {
        entryId: id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
      });
    });
  }

  /**
   * 自分のエントリ1件取得
   */
  async getEntryById(
    id: string,
    ctx: ServiceContext
  ): Promise<JournalEntry> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const entry = await privateJournalRepo.findById(tx, id, ctx);
      if (!entry) {
        throw new JournalNotFoundError();
      }

      logEvent(LogEvents.JournalEntryRead, {
        entryId: id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        isPublic: entry.isPublic,
        accessType: 'owner',
      });

      return entry;
    });
  }

  /**
   * マイ記録取得（自分の全エントリ）
   */
  async listMine(
    ctx: ServiceContext,
    opts: { limit: number; offset: number }
  ): Promise<JournalEntry[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const entries = await privateJournalRepo.findMine(tx, opts, ctx);

      logEvent(LogEvents.JournalEntryListRead, {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        endpoint: 'mine',
        count: entries.length,
      });

      return entries;
    });
  }
}

export const journalEntryService = new JournalEntryService();
