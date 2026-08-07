// DELETE /api/grade-meeting/notes/[id] - 卓上から1行引っ込める
//
// 観察・状況判断は本人のみ (出した事実は本人が引っ込められる)。
// 「次の一手」はテナント内なら誰でも (差し替えのため)。判定は RLS の DELETE ポリシー。
// 消せなかった場合、他人の行なのか存在しないのかを区別せず 404 を返す
// (「誰が書いたか」を推測できる情報を返さない = 無記名を API でも守る)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { gradeMeetingService } from '@/features/grade-meeting/lib/gradeMeetingService';
import { classNoteIdParamSchema } from '@/features/grade-meeting/schemas/gradeMeeting';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'DELETE') {
    const parsed = classNoteIdParamSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '不正なIDです',
      });
    }
    try {
      const deleted = await gradeMeetingService.deleteNote(parsed.data.id, ctx);
      if (!deleted) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.status(204).end();
    } catch (err) {
      return mapErrorToResponse(err, res, 'gradeMeeting.note.delete');
    }
  }

  res.setHeader('Allow', 'DELETE');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
