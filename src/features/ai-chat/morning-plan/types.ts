// morning_plan (H3) frontend で共有する型

export type Capacity = 'low' | 'normal' | 'high';
export type Bucket = 'today' | 'optional';
export type OutlookScore = 'held' | 'somewhat' | 'difficult';

export interface PlanItemView {
  taskId: string;
  title: string;
  dueDate: string | null;
  categoryName: string | null;
  description: string;
  status: string;
  assigneeNames: string[];
  reason: string;
  suggestedAction: string;
  bucket: Bucket;
  doneAt: string | null;
}

export interface DoneItemView {
  taskId: string;
  title: string;
  doneAt: string;
  bucket: Bucket;
}

export interface TodayPlanResponse {
  sessionId: string | null;
  plan: {
    summary: string;
    today: PlanItemView[];
    optional: PlanItemView[];
    doneItems: DoneItemView[];
    notes: string[];
    feedbackSubmitted: boolean;
  } | null;
  // 今日プランがない時にカードの「N 件あります」表示用 (自分が assignee で未完了)
  incompleteAssigneeTaskCount: number;
  // 過去に morning_plan を一度でも始めたことがあるか (初回利用判定、NEW バッジ表示用)
  hasEverUsedMorningPlan: boolean;
}

export interface GeneratedPlanItem {
  task_id: string;
  reason: string;
  suggested_action: string;
  confidence: number;
  title: string;
  dueDate: string | null;
  categoryName: string | null;
  description: string;
  status: string;
  assigneeNames: string[];
}

export interface NotShownCandidate {
  taskId: string;
  title: string;
  dueDate: string | null;
  categoryName: string | null;
}

export interface MorningPlanGenerateResponse {
  sessionId: string | null;
  plan: {
    summary: string;
    today: GeneratedPlanItem[];
    optional: GeneratedPlanItem[];
    notShown: NotShownCandidate[];
    notes: string[];
  };
  empty?: boolean;
}

export const CAPACITY_LABEL: Record<Capacity, string> = {
  low: '少なめ',
  normal: 'ふつう',
  high: '少しある',
};
