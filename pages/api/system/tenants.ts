// BP-03 テナント作成・BP-04 テナント停止/再開
// 権限: system_admin のみ
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { getDb, withSystemAdmin, withTenantUser } from '@/shared/lib/db';
import { tenants } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import { tagRepo } from '@/features/journal/lib/tagRepository';

const createTenantSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'スラグは英小文字・数字・ハイフンのみ使用できます'),
});

const updateTenantSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'suspended']),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  // BR-ROLE-04: system_admin のみアクセス可能
  if (!session || !session.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  try {
    if (req.method === 'GET') {
      const db = await getDb();
      const allTenants = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          status: tenants.status,
          createdAt: tenants.createdAt,
        })
        .from(tenants)
        .orderBy(tenants.createdAt);

      return res.status(200).json({ tenants: allTenants });
    }

    if (req.method === 'POST') {
      // BR-TENANT-01・BR-TENANT-02: テナント作成バリデーション
      const parsed = createTenantSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? '入力が不正です',
        });
      }

      const { name, slug } = parsed.data;
      const db = await getDb();

      // BR-TENANT-02: スラグ重複チェック
      const [existing] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);

      if (existing) {
        return res.status(409).json({
          error: 'SLUG_CONFLICT',
          message: 'このスラグは既に使用されています',
        });
      }

      // NFR-U02-03: テナント作成と同一トランザクション内でデフォルトタグをシード
      // これにより「テナントは作成されたがタグ 0 件」という中間状態を防ぐ
      // system_admin 権限でテナント作成 → タグシードを一括実行
      const { newTenant, seededTags } = await withSystemAdmin(session.user.userId, async (tx) => {
        const [created] = await tx
          .insert(tenants)
          .values({ name, slug })
          .returning();

        // タグシードは新テナントのスコープで実行
        // system_admin は全テーブルアクセス可能なのでここで tenant_id を設定
        await tx.execute(
          sql`SELECT set_config('app.tenant_id', ${created.id}, true)`
        );

        const tags = await tagRepo.seedSystemDefaults(
          tx as unknown as Parameters<typeof tagRepo.seedSystemDefaults>[0],
          created.id
        );

        return { newTenant: created, seededTags: tags };
      });

      logger.info({
        event: 'tenant.created',
        tenantId: newTenant.id,
        requestedBy: session.user.userId,
        seededTagCount: seededTags.length,
      });

      return res.status(201).json({
        tenant: newTenant,
        seededTagCount: seededTags.length,
      });
    }

    if (req.method === 'PATCH') {
      // BP-04: テナント停止/再開
      const parsed = updateTenantSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: '入力が不正です',
        });
      }

      const { id, status } = parsed.data;
      const db = await getDb();

      const [updated] = await db
        .update(tenants)
        .set({ status, updatedAt: new Date() })
        .where(eq(tenants.id, id))
        .returning({ id: tenants.id, status: tenants.status });

      if (!updated) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'テナントが見つかりません' });
      }

      const event = status === 'suspended' ? 'tenant.suspended' : 'tenant.reactivated';
      logger.info({ event, tenantId: id, requestedBy: session.user.userId });

      return res.status(200).json({ tenant: updated });
    }

    return res.status(405).end();
  } catch (err) {
    // BR-SEC-04: エラー詳細は露出しない
    logger.error({ event: 'system.tenants.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
