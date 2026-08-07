// GET /api/workshop - 研修の箱の中身 (箱メタ + 自分のチェックイン + みんなのチェックイン)。
// 振り返り一覧は S3 で追加する。
// 観測者原則: 研修が有効でないテナントには 404 (機能の存在を悟らせない)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import { isWorkshopEnabledForTenant } from '@/features/workshop/featureFlag';
import { workshopService } from '@/features/workshop/lib/workshopService';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  // 研修無効テナントには存在を悟らせない (404)。
  if (!isWorkshopEnabledForTenant(ctx.tenantId)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  if (req.method === 'GET') {
    try {
      const board = await workshopService.getBoard(ctx);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(board);
    } catch (err) {
      return mapErrorToResponse(err, res, 'workshop.board.get');
    }
  }

  res.setHeader('Allow', 'GET');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}
