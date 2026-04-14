// BP-02 Step 4〜7: 招待トークン検証・承諾（ユーザー/ロール作成）
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { getDb } from '@/shared/lib/db';
import { invitationTokens, users, userTenantRoles } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token } = req.query;
  if (typeof token !== 'string') return res.status(400).end();

  // GET: 招待トークン情報取得（認証不要・招待ページで使用）
  if (req.method === 'GET') {
    try {
      const db = await getDb();
      const [invitation] = await db
        .select({
          email: invitationTokens.email,
          role: invitationTokens.role,
          expiresAt: invitationTokens.expiresAt,
          usedAt: invitationTokens.usedAt,
        })
        .from(invitationTokens)
        .where(eq(invitationTokens.token, token))
        .limit(1);

      if (!invitation) {
        return res.status(404).json({ error: 'NOT_FOUND', message: '招待リンクが見つかりません' });
      }

      // BR-INVITE-02: 使用済みチェック
      if (invitation.usedAt) {
        return res.status(410).json({
          error: 'INVITE_USED',
          message: 'この招待リンクは既に使用されています',
        });
      }

      // BR-INVITE-01: 有効期限チェック
      if (new Date(invitation.expiresAt) <= new Date()) {
        return res.status(410).json({
          error: 'INVITE_EXPIRED',
          message: '招待リンクの有効期限が切れています。再度招待を依頼してください。',
        });
      }

      return res.status(200).json({
        invitation: {
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        },
      });
    } catch (err) {
      logger.error({ event: 'invitation.get.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: '処理中にエラーが発生しました' });
    }
  }

  // POST: 招待承諾（認証済みユーザーのみ）
  if (req.method === 'POST') {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(req, res, authOptions);

    if (!session) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '認証が必要です' });
    }

    try {
      const db = await getDb();

      const [invitation] = await db
        .select()
        .from(invitationTokens)
        .where(
          and(
            eq(invitationTokens.token, token),
            isNull(invitationTokens.usedAt),
            gt(invitationTokens.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!invitation) {
        return res.status(410).json({
          error: 'INVITE_INVALID',
          message: '招待リンクが無効または有効期限切れです',
        });
      }

      // メールアドレスの一致確認（セキュリティ: 他人が使用することを防ぐ）
      if (session.user.email !== invitation.email) {
        return res.status(403).json({
          error: 'EMAIL_MISMATCH',
          message: 'この招待リンクはあなた宛てではありません',
        });
      }

      // ユーザーが存在しない場合は作成（初回招待経由サインアップ）
      const [existingUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, invitation.email))
        .limit(1);

      let userId: string;

      if (!existingUser) {
        const [newUser] = await db
          .insert(users)
          .values({
            email: invitation.email,
            name: session.user.name ?? null,
            image: session.user.image ?? null,
          })
          .returning({ id: users.id });
        userId = newUser.id;
      } else {
        userId = existingUser.id;
      }

      // BR-INVITE-05: user_tenant_roles を追加（重複は UNIQUE 制約でブロック）
      await db
        .insert(userTenantRoles)
        .values({
          userId,
          tenantId: invitation.tenantId,
          role: invitation.role,
        })
        .onConflictDoNothing();

      // 招待トークンを使用済みにする
      await db
        .update(invitationTokens)
        .set({ usedAt: new Date() })
        .where(eq(invitationTokens.id, invitation.id));

      logger.info({
        event: 'auth.invite.used',
        userId,
        tenantId: invitation.tenantId,
        role: invitation.role,
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error({ event: 'invitation.accept.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: '処理中にエラーが発生しました' });
    }
  }

  return res.status(405).end();
}
