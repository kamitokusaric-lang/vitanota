// GET /api/me/profile - 自分のプロフィール (nickname)
// PATCH /api/me/profile - nickname を更新
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import {
  profileService,
  NicknameConflictError,
} from '@/features/profile/lib/profileService';
import { updateProfileSchema } from '@/features/profile/schemas/profile';
import { logger } from '@/shared/lib/logger';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    try {
      const profile = await profileService.getMyProfile(ctx);
      return res.status(200).json({ profile });
    } catch (err) {
      logger.error({ event: 'me.profile.get.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  if (req.method === 'PATCH') {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const profile = await profileService.updateNickname(
        parsed.data.nickname,
        ctx,
      );
      return res.status(200).json({ profile });
    } catch (err) {
      if (err instanceof NicknameConflictError) {
        return res.status(409).json({
          error: 'NICKNAME_CONFLICT',
          message: 'このニックネームは既に使われています',
        });
      }
      logger.error({ event: 'me.profile.update.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
