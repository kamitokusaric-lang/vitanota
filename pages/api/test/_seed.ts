// Step 16b: E2E テスト用シード API
// 必ず E2E_TEST_MODE=true の環境のみ動作（本番では 404 を返す）
//
// 提供エンドポイント:
//   POST /api/test/_seed { action: 'reset' }                    全テーブル TRUNCATE
//   POST /api/test/_seed { action: 'tenant', name }              テナント作成
//   POST /api/test/_seed { action: 'user', tenantId, role, email, name }  ユーザー作成
//   POST /api/test/_seed { action: 'entry', tenantId, userId, content, isPublic }  エントリ作成
//   POST /api/test/_seed { action: 'tag', tenantId, userId, name, isEmotion }  タグ作成
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { getDb } from '@/shared/lib/db';
import {
  tenants,
  users,
  userTenantRoles,
  journalEntries,
  tags,
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
    isEmotion: z.boolean(),
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

  const db = await getDb();

  try {
    switch (parsed.data.action) {
      case 'reset': {
        await db.execute(sql`
          TRUNCATE TABLE
            journal_entry_tags,
            journal_entries,
            tags,
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
        const [t] = await db
          .insert(tenants)
          .values({ name: parsed.data.name, slug: parsed.data.slug, status: 'active' })
          .returning();
        return res.status(201).json({ tenant: t });
      }
      case 'user': {
        const [u] = await db
          .insert(users)
          .values({ email: parsed.data.email, name: parsed.data.name })
          .returning();
        await db.insert(userTenantRoles).values({
          userId: u.id,
          tenantId: parsed.data.tenantId,
          role: parsed.data.role,
        });
        return res.status(201).json({ user: u });
      }
      case 'entry': {
        await db.execute(
          sql`SELECT set_config('app.tenant_id', ${parsed.data.tenantId}, true)`
        );
        await db.execute(
          sql`SELECT set_config('app.user_id', ${parsed.data.userId}, true)`
        );
        const [e] = await db
          .insert(journalEntries)
          .values({
            tenantId: parsed.data.tenantId,
            userId: parsed.data.userId,
            content: parsed.data.content,
            isPublic: parsed.data.isPublic,
          })
          .returning();
        return res.status(201).json({ entry: e });
      }
      case 'tag': {
        await db.execute(
          sql`SELECT set_config('app.tenant_id', ${parsed.data.tenantId}, true)`
        );
        await db.execute(
          sql`SELECT set_config('app.user_id', ${parsed.data.userId}, true)`
        );
        const [t] = await db
          .insert(tags)
          .values({
            tenantId: parsed.data.tenantId,
            name: parsed.data.name,
            isEmotion: parsed.data.isEmotion,
            isSystemDefault: false,
            sortOrder: 0,
            createdBy: parsed.data.userId,
          })
          .returning();
        return res.status(201).json({ tag: t });
      }
      case 'createSession': {
        // Step 16b: E2E 用に database セッション戦略の sessions 行を直接 INSERT
        // 通常の auth フロー (Google OAuth) を経由せずに認証済み状態を作る
        const sessionToken = randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + parsed.data.expiresInSec * 1000);
        const [s] = await db
          .insert(sessions)
          .values({
            sessionToken,
            userId: parsed.data.userId,
            activeTenantId: parsed.data.tenantId ?? null,
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
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
