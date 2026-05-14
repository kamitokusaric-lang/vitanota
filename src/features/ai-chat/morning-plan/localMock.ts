// AppRunner (Next.js) 側で動かす morning_plan の inline mock。
// AI_CHAT_LOCAL_MOCK=true の時に Lambda invoke せず本ファイルで応答する。
// 本番では Lambda 経由 (scripts/ai-chat-extract/) で実 Bedrock を叩く。

import type { Capacity } from './types';

interface MockTaskInput {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  description: string;
}

interface MockPlanItem {
  task_id: string;
  reason: string;
  suggested_action: string;
  confidence: number;
}

export interface MockMorningPlanResult {
  summary: string;
  today: MockPlanItem[];
  optional: MockPlanItem[];
  not_shown_task_ids: string[];
  notes: string[];
}

// chimo 2026-05-14: 「今日期限・期限切れ」は件数に関わらず全部 today に入れる。
// それ以外のタスクを capacity で振り分け (AI が絞らず先生に判断してもらう)。
const ADDITIONAL_BY_CAPACITY: Record<
  Capacity,
  { extraToday: number; optional: number }
> = {
  low: { extraToday: 0, optional: 2 },
  normal: { extraToday: 2, optional: 3 },
  high: { extraToday: 3, optional: 3 },
};

export function mockMorningPlan(
  capacity: Capacity,
  today: string,
  tasks: MockTaskInput[],
): MockMorningPlanResult {
  const additional = ADDITIONAL_BY_CAPACITY[capacity];

  // 1. 今日期限・期限切れ = 必ず today に入れる
  const forcedToday = tasks.filter(
    (t) => t.due_date != null && t.due_date <= today,
  );
  const others = tasks.filter(
    (t) => !(t.due_date != null && t.due_date <= today),
  );

  // 2. それ以外を score でソート
  const scored = others.map((t) => {
    let score = 0;
    if (t.due_date) score += 5;
    if (t.status === 'in_progress') score += 3;
    if (/今日|確認|連絡|提出|相談|締切|至急/.test(t.title + t.description))
      score += 2;
    return { task: t, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const forcedTodayItems = forcedToday.map((t) => ({
    task_id: t.id,
    reason:
      t.due_date != null && t.due_date < today
        ? `期限が ${t.due_date} で過ぎています、今日まず見るとよさそうです`
        : `期限が今日 (${t.due_date}) なので、今日まず見るとよさそうです`,
    suggested_action:
      t.status === 'in_progress' ? '続きから少し進める' : '内容を確認する',
    confidence: 0.8,
  }));

  const extraTodayItems = scored
    .slice(0, additional.extraToday)
    .map((s) => ({
      task_id: s.task.id,
      reason: '優先度が高そうなので、今日まず見るとよさそうです',
      suggested_action:
        s.task.status === 'in_progress' ? '続きから少し進める' : '内容を確認する',
      confidence: 0.5,
    }));

  const optionalItems = scored
    .slice(additional.extraToday, additional.extraToday + additional.optional)
    .map((s) => ({
      task_id: s.task.id,
      reason: '今日できなくても大丈夫ですが、余裕があれば少し進められそうです',
      suggested_action: '確認だけ先にする',
      confidence: 0.4,
    }));

  const notShown = scored
    .slice(additional.extraToday + additional.optional)
    .map((s) => s.task.id);

  const summary =
    forcedToday.length > 0
      ? `今日期限・期限切れが ${forcedToday.length} 件あります。先生の判断で進めてください。`
      : capacity === 'low'
        ? '今日は少なめに絞ってあります'
        : capacity === 'high'
          ? '今日の見通し案を出しました'
          : '今日まず見るとよさそうな案です';

  return {
    summary,
    today: [...forcedTodayItems, ...extraTodayItems],
    optional: optionalItems,
    not_shown_task_ids: notShown,
    notes: [],
  };
}
