// 「開発者から」widget のお知らせデータ (静的)
// 新しいお知らせを出すときは、配列に entry を追加するだけで widget に反映される。
// 履歴も上下ナビで遡れるので、過去 entry は削除せずに残す。

export interface Announcement {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  body: string[]; // 行ごと: UI 側で箇条書き表示
}

export const announcements: Announcement[] = [
  {
    id: '2026-05-09-self-task-redline',
    date: '2026-05-09',
    title:
      'タスクを全員分表示した時、自分のタスクカードの左横に赤線がつくように変更しました。',
    body: [],
  },
  {
    id: '2026-05-08-assignee-scroll',
    date: '2026-05-08',
    title: 'たくさんのフィードバックをありがとうございます！',
    body: [
      'タスク担当者を選択する際に、下部が見切れてしまうバグを修正しました。',
      'タスクを追加したのに見えないという声が多かったので、タスクボードの初期表示を今日以降のタスクに変更しました。',
    ],
  },
];

// 新しい順 (date 降順) に整列して返す。先頭が最新。
export function getAnnouncementsSorted(): Announcement[] {
  return [...announcements].sort((a, b) => b.date.localeCompare(a.date));
}
