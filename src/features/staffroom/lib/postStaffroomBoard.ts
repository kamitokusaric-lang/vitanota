// 職員室ボードへの起票 POST (クライアント)。
// 起票入口は右サイドの「今日の出来事を書く」(TodayCaptureBox) に一本化 (chimo 2026-06-12)。
// keep/concern/thanks/help は journal_entries(kind=board) として保存され /staffroom に出る。
import type { StaffroomBoardKind } from '../types';

export async function postStaffroomBoard(params: {
  boardKind: StaffroomBoardKind;
  content: string;
  isPublic: boolean;
}): Promise<Response> {
  return fetch('/api/staffroom/board', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}
