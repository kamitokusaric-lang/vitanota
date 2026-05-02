// 機能 A: system_admin 招待管理 API (一覧 GET / 一括 POST)
// 権限: system_admin のみ (system/tenants.ts と同じく独自 session check)
//   - 共通の requireAuth (apiHelpers) は tenantId 不在で 403 を返すため使えない
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { getDb } from '@/shared/lib/db';
import { invitationTokens, sessions, users } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import {
  bulkInvitationSchema,
  calculateInvitationStatus,
  createOrReissueInvitation,
} from '@/features/auth/lib/invitationService';

function buildInviteUrl(token: string): string {
  const base = process.env.NEXTAUTH_URL ?? '';
  return `${base}/auth/invite?token=${token}`;
}

const listQuerySchema = z.object({
  tenantId: z.string().uuid('tenantId は UUID で指定してください'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.roles.includes('system_admin')) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
  }

  if (req.method === 'GET') {
    return handleList(req, res);
  }
  if (req.method === 'POST') {
    return handleBulkCreate(req, res, session.user.userId);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).end();
}

async function handleList(req: NextApiRequest, res: NextApiResponse) {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { tenantId } = parsed.data;

  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: invitationTokens.id,
        email: invitationTokens.email,
        role: invitationTokens.role,
        token: invitationTokens.token,
        invitedAt: invitationTokens.createdAt,
        expiresAt: invitationTokens.expiresAt,
        usedAt: invitationTokens.usedAt,
        // accepted 行の運用判定用に「最終アクセス日時」を sub-query で同梱する。
        // users.email は UNIQUE 制約あり (schema.ts:107) のため sub-query は 1 行確定。
        // sessions が無い (まだログインしてない / session 全 expire 済 etc.) なら NULL。
        lastAccessedAt: sql<Date | null>`(
          SELECT MAX(${sessions.lastAccessedAt})
          FROM ${sessions}
          INNER JOIN ${users} ON ${users.id} = ${sessions.userId}
          WHERE ${users.email} = ${invitationTokens.email}
        )`,
      })
      .from(invitationTokens)
      .where(eq(invitationTokens.tenantId, tenantId))
      .orderBy(desc(invitationTokens.createdAt));

    const now = new Date();
    const invitations = rows.map((r) => {
      const status = calculateInvitationStatus(r.usedAt, r.expiresAt, now);
      return {
        id: r.id,
        email: r.email,
        role: r.role,
        invitedAt: r.invitedAt,
        expiresAt: r.expiresAt,
        usedAt: r.usedAt,
        status,
        inviteUrl: status === 'pending' ? buildInviteUrl(r.token) : null,
        lastAccessedAt: status === 'accepted' ? r.lastAccessedAt : null,
      };
    });

    return res.status(200).json({ invitations });
  } catch (err) {
    logger.error({ event: 'system.invitations.list.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}

async function handleBulkCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  invitedBy: string
) {
  const parsed = bulkInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { tenantId, emails, role } = parsed.data;

  const results = await Promise.all(
    emails.map(async (email) => {
      const trimmed = email.trim();
      const emailValidation = z.string().email().safeParse(trimmed);
      if (!emailValidation.success) {
        return { email: trimmed, status: 'failed' as const, error: 'INVALID_EMAIL' };
      }
      try {
        const invitation = await createOrReissueInvitation({
          tenantId,
          email: trimmed,
          role,
          invitedBy,
        });
        return {
          email: trimmed,
          status: 'created' as const,
          invitation: {
            id: invitation.id,
            expiresAt: invitation.expiresAt,
            inviteUrl: buildInviteUrl(invitation.token),
          },
        };
      } catch (err) {
        logger.error({ event: 'system.invitations.bulk.item.error', err, email: trimmed });
        return { email: trimmed, status: 'failed' as const, error: 'INTERNAL_ERROR' };
      }
    })
  );

  const created = results.filter((r) => r.status === 'created').length;
  const failed = results.length - created;

  logger.info({
    event: 'system.invitations.bulk.created',
    tenantId,
    role,
    invitedBy,
    requested: emails.length,
    created,
    failed,
  });

  return res.status(200).json({ results });
}
