// Unit-03 統合テスト: 感情傾向 API
// GET /api/private/dashboard/emotion-trend
// 実 DB + Next.js サーバーが必要 — Build & Test フェーズで整備
//
// TODO: Build & Test フェーズで以下のテストケースを実装する
// - 認証なしで 401
// - 有効な period (week/month/quarter) で 200 + 正しい集計結果
// - 不正な period で 400
// - 他教員のデータが含まれないこと（テナント隔離）
// - POST で 405
import { describe, it } from 'vitest';

describe.skip('GET /api/private/dashboard/emotion-trend (integration)', () => {
  it.todo('returns 401 without authentication');
  it.todo('returns 200 with valid period');
  it.todo('returns 400 for invalid period');
  it.todo('returns only own data (tenant isolation)');
  it.todo('returns 405 for non-GET methods');
});
