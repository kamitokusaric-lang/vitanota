// カレンダー機能 (Unit-06) のクライアント発火 利用計測 helper (chimo 2026-05-30)。
// /api/ai-chat/events に silent fire-and-forget で POST する。
// userId / tenantId は server 側 requireAuth から付与されるため client は送らない。
// version も server 側で定数付与。 失敗は握り潰す (= 計測で UX を絶対に止めない)。
//
// 踏み絵 (feedback_observed_moment_broken): 集計は本人 + system_admin のみ可視
// (calendar_events の RLS)。 教員に観測感を出さない。

type CalendarEventBody =
  | { event: 'calendar_view_switched'; view: 'board' | 'calendar' }
  | {
      event: 'calendar_task_moved';
      taskId: string;
      fromDate: string | null;
      toDate: string;
    }
  | {
      event: 'calendar_task_pushed_to_next_week';
      taskId: string;
      fromDate: string | null;
      toDate: string;
    }
  | { event: 'calendar_task_created_from_plus'; date: string; taskId: string }
  | { event: 'calendar_day_detail_opened'; date: string };

export function fireCalendarEvent(body: CalendarEventBody): void {
  void fetch('/api/ai-chat/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}
