// GET  /api/grade-meeting?grade=1&from=..&to=.. - 表示中の週の卓上
//        (クラス + その週の会 + 観察/判断/一手 + 前回の一手)
// POST /api/grade-meeting          - 「学年会をはじめる」(同学年・同日なら既存を返す)
//
// 卓上の行は無記名で返す (author_user_id を含めない)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { gradeMeetingService } from '@/features/grade-meeting/lib/gradeMeetingService';
import {
  gradeMeetingQuerySchema,
  startGradeMeetingSchema,
} from '@/features/grade-meeting/schemas/gradeMeeting';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    const parsed = gradeMeetingQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '学年の指定が不正です',
      });
    }
    try {
      const board = await gradeMeetingService.getBoard(
        parsed.data.grade,
        { from: parsed.data.from, to: parsed.data.to },
        ctx,
      );
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(board);
    } catch (err) {
      return mapErrorToResponse(err, res, 'gradeMeeting.board.get');
    }
  }

  if (req.method === 'POST') {
    const parsed = startGradeMeetingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const meeting = await gradeMeetingService.startMeeting(
        {
          grade: parsed.data.grade,
          // 未指定ならサーバ日付ではなくクライアントの当日を使う想定だが、
          // 省略時のフォールバックとして JST の当日を採る。
          heldOn:
            parsed.data.heldOn ??
            new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }),
        },
        ctx,
      );
      return res.status(200).json({ meeting });
    } catch (err) {
      return mapErrorToResponse(err, res, 'gradeMeeting.start');
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
