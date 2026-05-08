// 「開発者から」セクションのお知らせデータ (静的)
// 新しいお知らせを出すときは、配列に entry を追加するだけで dashboard 上部に反映される
// (公開日が最新のものを 1 件だけ表示する)

export interface Announcement {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  body: string[]; // 行ごと: UI 側で箇条書き表示
}

export const announcements: Announcement[] = [
  {
    id: '2026-05-08-assignee-scroll',
    date: '2026-05-08',
    title: 'たくさんのフィードバックをありがとうございます！',
    body: [
      'タスク担当者を選択する際に、下部が見切れてしまうバグを修正しました。',
      'タスク追加したのに表示されないぞと思った場合は、期間を広げて確認してみてください。',
    ],
  },
];

export function getLatestAnnouncement(): Announcement | null {
  if (announcements.length === 0) return null;
  return [...announcements].sort((a, b) => b.date.localeCompare(a.date))[0];
}
