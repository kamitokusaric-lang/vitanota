// Unit-02 TagService
// タグの作成・削除・一覧取得。school_admin 権限チェックを管理。
import { withTenantUser } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
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
   * タグ作成（teacher 以上のロールで可能）
   */
  async createTag(params: CreateTagParams, ctx: ServiceContext): Promise<Tag> {
    return withTenantUser(ctx.tenantId, ctx.userId, async (tx) => {
      const tag = await tagRepo.create(tx, params, ctx);

      logger.info({
        event: 'tag_created',
        tagId: tag.id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        name: tag.name,
        isEmotion: tag.isEmotion,
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
      logger.warn({
        event: 'tag_delete_forbidden',
        tagId: id,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        roles: ctx.roles,
      });
      throw new ForbiddenError('タグの削除は管理者のみ可能です');
    }

    return withTenantUser(ctx.tenantId, ctx.userId, async (tx) => {
      const result = await tagRepo.delete(tx, id, ctx);

      if (!result.deleted) {
        // システムデフォルト or 存在しない
        // Repository 側でシステムデフォルトは削除対象から除外される
        // 区別するためには追加 SELECT が必要だが、本フェーズでは統一エラー
        throw new TagNotFoundError('タグが見つからないか、削除できないタグです');
      }

      logger.info({
        event: 'tag_deleted',
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
    return withTenantUser(ctx.tenantId, ctx.userId, async (tx) => {
      const tags = await tagRepo.findAllByTenant(tx, ctx);

      logger.info({
        event: 'tag_list_read',
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
