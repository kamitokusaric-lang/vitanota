// POST /api/baton-relay/students/bulk - 選んだ生徒をまとめて操作する
//
//   delete  … 誤登録の取り消し。**その子の印象・コメントも cascade で消える**
//   archive … 在籍終了 (転校・卒業)。left_at が入る
//   move    … 別のクラスへ移す
//
// 1トランザクションで処理するので、途中で失敗しても半端に消えたり動いたりしない。
// 他テナントの行は RLS が弾くので affected に数えられない。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { batonRelayService } from '@/features/baton-relay/lib/batonRelayService';
import { bulkStudentsSchema } from '@/features/baton-relay/schemas/batonRelay';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const parsed = bulkStudentsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message ?? '入力が不正です',
    });
  }

  try {
    const { action, studentIds, toClassId } = parsed.data;
    const affected = await batonRelayService.bulkStudents(
      ctx,
      action === 'move'
        ? { action, studentIds, toClassId: toClassId! }
        : { action, studentIds },
    );
    return res.status(200).json({ affected });
  } catch (err) {
    logger.error({ event: 'baton_relay.students.bulk.error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
