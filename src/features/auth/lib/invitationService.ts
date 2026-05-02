// 招待トークン発行ロジック (個別 API / system_admin bulk API 両方から呼ぶ)
// BR-INVITE-04: 同じ tenant × email に未使用トークンがあれば古いものを無効化して新規発行
import crypto from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/shared/lib/db';
import { invitationTokens } from '@/db/schema';
import { logger } from '@/shared/lib/logger';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InvitationStatus = 'accepted' | 'pending' | 'expired';

export interface CreateOrReissueInvitationInput {
  tenantId: string;
  email: string;
  role: 'teacher' | 'school_admin';
  invitedBy: string;
}

export interface InvitationRecord {
  id: string;
  token: string;
  expiresAt: Date;
}

// 招待状態を usedAt + expiresAt と現在時刻から判定する pure 関数
export function calculateInvitationStatus(
  usedAt: Date | null,
  expiresAt: Date,
  now: Date
): InvitationStatus {
  if (usedAt) return 'accepted';
  if (expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}

// 一括招待リクエストの Zod スキーマ
export const bulkInvitationSchema = z.object({
  tenantId: z.string().uuid(),
  emails: z
    .array(z.string())
    .min(1, 'メールアドレスを 1 件以上指定してください')
    .max(100, '一度に招待できるのは 100 件までです'),
  role: z.enum(['teacher', 'school_admin']),
});

export async function createOrReissueInvitation(
  input: CreateOrReissueInvitationInput
): Promise<InvitationRecord> {
  const { tenantId, email, role, invitedBy } = input;
  const db = await getDb();

  // 既存の未受諾トークンを物理削除する。
  // usedAt は「受諾日時」専用で、無効化マーカーとして使うと calculateInvitationStatus が
  // accepted と誤判定する (二重意味バグ)。受諾済 (usedAt IS NOT NULL) 行は招待履歴として残す。
  // 招待発行履歴は構造化ログ (auth.invite.created) で別途追える。
  await db
    .delete(invitationTokens)
    .where(
      and(
        eq(invitationTokens.tenantId, tenantId),
        eq(invitationTokens.email, email),
        isNull(invitationTokens.usedAt)
      )
    );

  const token = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const [invitation] = await db
    .insert(invitationTokens)
    .values({ tenantId, email, role, token, invitedBy, expiresAt })
    .returning({
      id: invitationTokens.id,
      token: invitationTokens.token,
      expiresAt: invitationTokens.expiresAt,
    });

  logger.info({ event: 'auth.invite.created', tenantId, role, invitedBy });

  return invitation;
}
