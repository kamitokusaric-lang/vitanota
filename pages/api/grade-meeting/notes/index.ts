// POST /api/grade-meeting/notes - 卓上に1行置く
//
//   observe / orient : 何行でも積む (複数の視点を畳まないのが設計の核)
//   action           : 1回×1クラスで1行なので upsert
//
// レスポンスは無記名 (author_user_id を含めない)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { gradeMeetingService } from '@/features/grade-meeting/lib/gradeMeetingService';
import { addClassNoteSchema } from '@/features/grade-meeting/schemas/gradeMeeting';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'POST') {
    const parsed = addClassNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const note = await gradeMeetingService.addNote(parsed.data, ctx);
      return res.status(200).json({ note });
    } catch (err) {
      return mapErrorToResponse(err, res, 'gradeMeeting.note.add');
    }
  }

  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
