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

const MAX_BY_CAPACITY: Record<Capacity, { today: number; optional: number }> = {
  low: { today: 2, optional: 2 },
  normal: { today: 3, optional: 3 },
  high: { today: 3, optional: 3 },
};

export function mockMorningPlan(
  capacity: Capacity,
  today: string,
  tasks: MockTaskInput[],
): MockMorningPlanResult {
  const max = MAX_BY_CAPACITY[capacity];

  const scored = tasks.map((t) => {
    let score = 0;
    if (t.due_date && t.due_date <= today) score += 10;
    else if (t.due_date) score += 5;
    if (t.status === 'in_progress') score += 3;
    if (/今日|確認|連絡|提出|相談|締切|至急/.test(t.title + t.description)) score += 2;
    return { task: t, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const todayItems = scored.slice(0, max.today).map((s) => ({
    task_id: s.task.id,
    reason: s.task.due_date
      ? `期限が ${s.task.due_date} なので、今日まず見るとよさそうです`
      : '優先度が高そうなので、今日まず見るとよさそうです',
    suggested_action:
      s.task.status === 'in_progress' ? '続きから少し進める' : '内容を確認する',
    confidence: 0.6,
  }));

  const optionalItems = scored
    .slice(max.today, max.today + max.optional)
    .map((s) => ({
      task_id: s.task.id,
      reason: '今日できなくても大丈夫ですが、余裕があれば少し進められそうです',
      suggested_action: '確認だけ先にする',
      confidence: 0.5,
    }));

  const notShown = scored
    .slice(max.today + max.optional)
    .map((s) => s.task.id);

  const summary =
    capacity === 'low'
      ? '今日は少なめに絞ってあります'
      : capacity === 'high'
        ? '今日の見通し案を出しました'
        : '今日まず見るとよさそうな案です';

  return {
    summary,
    today: todayItems,
    optional: optionalItems,
    not_shown_task_ids: notShown,
    notes: [],
  };
}
