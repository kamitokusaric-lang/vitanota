// Step 16b: E2E テスト用シード API
// 必ず E2E_TEST_MODE=true の環境のみ動作（本番では 404 を返す）
//
// 提供エンドポイント:
//   POST /api/test/_seed { action: 'reset' }                    全テーブル TRUNCATE
//   POST /api/test/_seed { action: 'tenant', name }              テナント作成
//   POST /api/test/_seed { action: 'user', tenantId, role, email, name }  ユーザー作成
//   POST /api/test/_seed { action: 'entry', tenantId, userId, content, isPublic }  エントリ作成
//   POST /api/test/_seed { action: 'tag', tenantId, userId, name, type, category }  タグ作成
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { getDb, withSystemAdmin } from '@/shared/lib/db';
import {
  tenants,
  users,
  userTenantRoles,
  journalEntries,
  emotionTags,
  sessions,
} from '@/db/schema';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reset') }),
  z.object({
    action: z.literal('tenant'),
    name: z.string(),
    slug: z.string(),
  }),
  z.object({
    action: z.literal('user'),
    tenantId: z.string().uuid(),
    role: z.enum(['teacher', 'school_admin', 'system_admin']),
    email: z.string().email(),
    name: z.string(),
  }),
  z.object({
    action: z.literal('entry'),
    tenantId: z.string().uuid(),
    userId: z.string().uuid(),
    content: z.string(),
    isPublic: z.boolean(),
  }),
  z.object({
    action: z.literal('tag'),
    tenantId: z.string().uuid(),
    userId: z.string().uuid(),
    name: z.string(),
    category: z.enum(['positive', 'negative', 'neutral']),
  }),
  z.object({
    action: z.literal('createSession'),
    userId: z.string().uuid(),
    tenantId: z.string().uuid().nullable().optional(),
    expiresInSec: z.number().int().positive().default(28800),
  }),
]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // ★ 本番保護: E2E_TEST_MODE=true 以外では 404 を返す
  if (process.env.E2E_TEST_MODE !== 'true') {
    return res.status(404).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '不正な入力',
    });
  }

  // E2E テスト用シード: 全操作を system_admin ロールで実行
  // seed API 自体が E2E_TEST_MODE=true でのみ有効なため、権限昇格のリスクはない
  const SEED_ADMIN_ID = '00000000-0000-0000-0000-000000000000';

  try {
    switch (parsed.data.action) {
      case 'reset': {
        const db = await getDb();
        await db.execute(sql`
          TRUNCATE TABLE
            journal_entry_tags,
            journal_entries,
            emotion_tags,
            tasks,
            task_categories,
            sessions,
            verification_tokens,
            accounts,
            user_tenant_roles,
            invitation_tokens,
            users,
            tenants
          RESTART IDENTITY CASCADE
        `);
        return res.status(200).json({ ok: true });
      }
      case 'tenant': {
        const { name, slug } = parsed.data;
        const t = await withSystemAdmin(SEED_ADMIN_ID, async (tx) => {
          const [created] = await tx
            .insert(tenants)
            .values({ name, slug, status: 'active' })
            .returning();
          return created;
        });
        return res.status(201).json({ tenant: t });
      }
      case 'user': {
        const { email, name, tenantId, role } = parsed.data;
        const u = await withSystemAdmin(SEED_ADMIN_ID, async (tx) => {
          const [created] = await tx
            .insert(users)
            .values({ email, name })
            .returning();
          await tx.insert(userTenantRoles).values({
            userId: created.id,
            tenantId,
            role,
          });
          return created;
        });
        return res.status(201).json({ user: u });
      }
      case 'entry': {
        const { tenantId, userId, content, isPublic } = parsed.data;
        const e = await withSystemAdmin(SEED_ADMIN_ID, async (tx) => {
          const [created] = await tx
            .insert(journalEntries)
            .values({ tenantId, userId, content, isPublic })
            .returning();
          return created;
        });
        return res.status(201).json({ entry: e });
      }
      case 'tag': {
        const { tenantId, userId, name, category } = parsed.data;
        const t = await withSystemAdmin(SEED_ADMIN_ID, async (tx) => {
          const [created] = await tx
            .insert(emotionTags)
            .values({
              tenantId,
              name,
              category,
              isSystemDefault: false,
              sortOrder: 0,
              createdBy: userId,
            })
            .returning();
          return created;
        });
        return res.status(201).json({ tag: t });
      }
      case 'createSession': {
        const { userId, expiresInSec } = parsed.data;
        const cssTenantId = parsed.data.tenantId ?? null;
        const sessionToken = randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + expiresInSec * 1000);
        const db = await getDb();
        const [s] = await db
          .insert(sessions)
          .values({
            sessionToken,
            userId,
            activeTenantId: cssTenantId,
            expires,
          })
          .returning();
        return res.status(201).json({
          sessionToken: s.sessionToken,
          expires: s.expires,
        });
      }
    }
  } catch (err) {
    console.error('[seed] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
