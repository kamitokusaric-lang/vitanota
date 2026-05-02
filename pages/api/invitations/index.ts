// BP-02 Step 1〜3: 招待トークン発行 (個別)
// 権限: system_admin（任意テナント）/ school_admin（自テナントのみ）
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { createOrReissueInvitation } from '@/features/auth/lib/invitationService';
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

  if (isSchoolAdmin && !isSystemAdmin && session.user.tenantId !== tenantId) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: '他のテナントへの招待権限がありません',
    });
  }

  try {
    const invitation = await createOrReissueInvitation({
      tenantId,
      email,
      role,
      invitedBy: session.user.userId,
    });

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
