// /api/staffroom/student-support — 生徒サポート (A→B seam)
//   GET → 朝バトンで印が付いた生徒を クラス(学年)別に 名前 + 印件数 + 今週の一言 で返す。
//   名前を出す = baton 画面と同じ可視範囲 (相互関心層)。数値化・ランキングはしない。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireAuth } from '@/features/journal/lib/apiHelpers';
import { staffroomService } from '@/features/staffroom/lib/staffroomService';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const querySchema = z.object({ from: ymd, to: ymd });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (req.method === 'GET') {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: '期間が不正です' });
    }
    const support = await staffroomService.getStudentSupport(ctx, parsed.data);
    return res.status(200).json(support);
  }

  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
