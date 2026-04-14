// BP-02 Step 1〜3: 招待トークン発行
// 権限: system_admin（任意テナント）/ school_admin（自テナントのみ）
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { getDb } from '@/shared/lib/db';
import { invitationTokens } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

const createInvitationSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  role: z.enum(['teacher', 'school_admin']),
  tenantId: z.string().uuid(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '認証が必要です' });
  }

  // BR-INVITE-03: 招待権限チェック
  const isSystemAdmin = session.user.roles.includes('system_admin');
  const isSchoolAdmin = session.user.roles.includes('school_admin');

  if (!isSystemAdmin && !isSchoolAdmin) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '招待権限がありません' });
  }

  const parsed = createInvitationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const { email, role, tenantId } = parsed.data;

  // school_admin は自テナントのみ招待可能
  if (isSchoolAdmin && !isSystemAdmin && session.user.tenantId !== tenantId) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: '他のテナントへの招待権限がありません',
    });
  }

  try {
    const db = await getDb();

    // BR-INVITE-04: 重複招待の場合は既存の未使用トークンを無効化
    await db
      .update(invitationTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(invitationTokens.tenantId, tenantId),
          eq(invitationTokens.email, email),
          isNull(invitationTokens.usedAt)
        )
      );

    // 新しいトークンを発行（UUID を base64url エンコード）
    const token = crypto.randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7日後

    const [invitation] = await db
      .insert(invitationTokens)
      .values({
        tenantId,
        email,
        role,
        token,
        invitedBy: session.user.userId,
        expiresAt,
      })
      .returning({ id: invitationTokens.id, token: invitationTokens.token, expiresAt: invitationTokens.expiresAt });

    logger.info({
      event: 'auth.invite.created',
      tenantId,
      role,
      invitedBy: session.user.userId,
    });

    // MVP: 実際のメール送信は対象外。招待 URL をレスポンスで返す（管理者が手動共有）
    const inviteUrl = `${process.env.NEXTAUTH_URL}/auth/invite?token=${invitation.token}`;

    return res.status(201).json({
      invitation: {
        id: invitation.id,
        expiresAt: invitation.expiresAt,
        inviteUrl,
      },
    });
  } catch (err) {
    logger.error({ event: 'invitation.create.error', err });
    return res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  }
}
