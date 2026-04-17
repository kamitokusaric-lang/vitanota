// Unit-02 TagService
// タグの作成・削除・一覧取得。school_admin 権限チェックを管理。
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole } from './apiHelpers';
import { LogEvents, logEvent, logWarnEvent } from '@/shared/lib/log-events';
import { tagRepo, type CreateTagParams } from './tagRepository';
import { ForbiddenError, SystemTagDeleteError, TagNotFoundError } from './errors';
import type { Tag } from '@/db/schema';

export interface ServiceContext {
  userId: string;
  tenantId: string;
  roles: string[]; // teacher・school_admin・system_admin
}

export class TagService {
  /**
   * タグ作成（school_admin / system_admin のみ）
   * Unit-03: 教員のカスタムタグ作成を廃止
   */
  async createTag(params: CreateTagParams, ctx: ServiceContext): Promise<Tag> {
    if (!ctx.roles.includes('school_admin') && !ctx.roles.includes('system_admin')) {
      logWarnEvent(LogEvents.TagForbidden, {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        action: 'create',
        roles: ctx.roles,
      });
      throw new ForbiddenError('タグの作成は管理者のみ可能です');
    }

    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const tag = await tagRepo.create(tx, params, ctx);

      logEvent(LogEvents.TagCreated, {
        tagId: tag.id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        name: tag.name,
        type: tag.type,
        category: tag.category,
      });

      return tag;
    });
  }

  /**
   * タグ削除（school_admin のみ）
   * システムデフォルトタグは削除不可
   */
  async deleteTag(id: string, ctx: ServiceContext): Promise<{ affectedEntries: number }> {
    // 権限チェック: school_admin のみ
    if (!ctx.roles.includes('school_admin')) {
      logWarnEvent(LogEvents.TagForbidden, {
        tagId: id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        action: 'delete',
        roles: ctx.roles,
      });
      throw new ForbiddenError('タグの削除は管理者のみ可能です');
    }

    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const result = await tagRepo.delete(tx, id, ctx);

      if (!result.deleted) {
        // システムデフォルト or 存在しない
        // Repository 側でシステムデフォルトは削除対象から除外される
        // 区別するためには追加 SELECT が必要だが、本フェーズでは統一エラー
        throw new TagNotFoundError('タグが見つからないか、削除できないタグです');
      }

      logEvent(LogEvents.TagDeleted, {
        tagId: id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        affectedEntries: result.affectedEntries,
      });

      return { affectedEntries: result.affectedEntries };
    });
  }

  /**
   * テナント内のタグ一覧取得
   */
  async listTenantTags(ctx: ServiceContext): Promise<Tag[]> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const tags = await tagRepo.findAllByTenant(tx, ctx);

      logEvent(LogEvents.TagListRead, {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        count: tags.length,
      });

      return tags;
    });
  }
}

export const tagService = new TagService();

// Re-export for error handling convenience
export { ForbiddenError, SystemTagDeleteError, TagNotFoundError };
