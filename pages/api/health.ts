// RP-02: App Runner ヘルスチェックエンドポイント
// DB 接続チェックは行わない（重い処理を避け、ヘルスチェック間隔内に応答する）
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
