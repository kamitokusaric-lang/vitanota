// /api/staffroom/board — 職員室ボード投稿の一覧 / 作成 (H7-B staffroom)
//   GET  ?boardType=&classId=&limit=&offset=  → 全教員可視の board 一覧
//   POST { boardType, kptLabel?, content, studentId?, classId? } → 投稿 (is_public=false 固定)
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { staffroomService } from '@/features/staffroom/lib/staffroomService';
import {
  createBoardSchema,
  listBoardQuerySchema,
} from '@/features/staffroom/schemas/staffroom';
import { logger } from '@/shared/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // board は個票 (児童に紐づく機微) を含むためキャッシュさせない
  res.setHeader('Cache-Control', 'private, no-store');

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    const parsed = listBoardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: '検索条件が不正です' });
    }
    const boards = await staffroomService.listBoards(ctx, parsed.data);
    return res.status(200).json({ boards });
  }

  if (req.method === 'POST') {
    const parsed = createBoardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? '入力が不正です',
      });
    }
    try {
      const created = await staffroomService.createBoard(ctx, parsed.data);
      return res.status(201).json({ board: created });
    } catch (err) {
      logger.error({ event: 'staffroom.board.create.error', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
