// Bedrock Claude Haiku 4.5 を呼び出すサービス。
// MOCK_BEDROCK=true の場合、固定 fixture を返してローカル/CI 開発を可能にする
// (chimo 2026-05-11 合意のハイブリッド開発スタイル: 日常開発は mock、プロンプト調整は AWS Console Playground)。

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  ExtractionResultSchema,
  MorningPlanResultSchema,
  type ExtractionResult,
  type MorningPlanResult,
  type MorningPlanEvent,
} from './schemas';
import type { ZodSchema } from 'zod';

const REGION = process.env.AWS_REGION_OVERRIDE ?? process.env.AWS_REGION ?? 'ap-northeast-1';
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-haiku-4-5-20251001-v1:0';
const MAX_TOKENS = Number(process.env.BEDROCK_MAX_TOKENS ?? '800');
const USE_MOCK = (process.env.MOCK_BEDROCK ?? 'false').toLowerCase() === 'true';

const client = USE_MOCK ? null : new BedrockRuntimeClient({ region: REGION });

// 汎用呼び出し: prompt + user message を Bedrock に投げて schema で検証して返す。
async function invokeBedrock<T>(args: {
  systemPrompt: string;
  userMessage: string;
  schema: ZodSchema<T>;
  maxTokens?: number;
}): Promise<T> {
  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: args.maxTokens ?? MAX_TOKENS,
    system: args.systemPrompt,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: args.userMessage }],
      },
    ],
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const command = new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });
      const response = await client!.send(command);
      const payload = JSON.parse(new TextDecoder().decode(response.body));
      const text: string = payload?.content?.[0]?.text ?? '';
      return parsePayload(text, args.schema);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function parsePayload<T>(text: string, schema: ZodSchema<T>): T {
  // AI が markdown code fence で囲んでも剥がす保険
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const json = JSON.parse(stripped);
  return schema.parse(json);
}

export async function invokeExtraction(args: {
  systemPrompt: string;
  userMessage: string;
}): Promise<{ result: ExtractionResult; modelId: string }> {
  if (USE_MOCK) {
    return { result: mockExtraction(args.userMessage), modelId: MODEL_ID };
  }
  const result = await invokeBedrock({
    systemPrompt: args.systemPrompt,
    userMessage: args.userMessage,
    schema: ExtractionResultSchema,
  });
  return { result, modelId: MODEL_ID };
}

export async function invokeMorningPlan(args: {
  systemPrompt: string;
  userMessage: string;
  event: MorningPlanEvent;
}): Promise<{ result: MorningPlanResult; modelId: string }> {
  if (USE_MOCK) {
    return { result: mockMorningPlan(args.event), modelId: MODEL_ID };
  }
  const result = await invokeBedrock({
    systemPrompt: args.systemPrompt,
    userMessage: args.userMessage,
    schema: MorningPlanResultSchema,
    maxTokens: 1500,
  });
  return { result, modelId: MODEL_ID };
}

// MOCK_BEDROCK=true 用の fixture。実 AI 呼び出しなしで UX 動線を確認できる。
// 入力に「進路」「テスト」「保護者」等のキーワードがあれば該当カテゴリを返す。
function mockExtraction(userMessage: string): ExtractionResult {
  const t = userMessage;
  const tasks: ExtractionResult['tasks'] = [];

  if (/進路|受験|推薦/.test(t)) {
    tasks.push({
      title: '進路に関する確認をする',
      category_id: 'learning_career',
      due_date: null,
      memo: '',
      confidence: 'medium',
    });
  }
  if (/テスト|採点|成績|プリント/.test(t)) {
    tasks.push({
      title: '小テストを採点する',
      category_id: 'learning_academic_improvement',
      due_date: null,
      memo: '',
      confidence: 'high',
    });
  }
  if (/保護者|連絡|返信/.test(t)) {
    tasks.push({
      title: '保護者へ返信する',
      category_id: 'nurture_student_guidance',
      due_date: null,
      memo: '',
      confidence: 'medium',
    });
  }
  if (/職員会議|校務分掌|学校評価/.test(t)) {
    tasks.push({
      title: '職員会議資料を確認する',
      category_id: 'school_affairs',
      due_date: null,
      memo: '',
      confidence: 'high',
    });
  }
  if (tasks.length === 0) {
    tasks.push({
      title: '内容を整理する',
      category_id: null,
      due_date: null,
      memo: '入力からタスクを特定できなかったため、教員側でカテゴリを選択してください',
      confidence: 'low',
    });
  }

  return {
    tasks,
    needsConfirmation: [],
  };
}

// MOCK_BEDROCK=true 用の morning_plan fixture。
// chimo 2026-05-14: 今日期限・期限切れは件数に関わらず全部 today に入れる。
// それ以外を capacity で振り分け (先生に判断してもらう)。
function mockMorningPlan(event: MorningPlanEvent): MorningPlanResult {
  const capacity = event.capacity;
  const tasks = event.tasks;
  const todayIso = event.today;

  const additionalByCapacity: Record<
    typeof capacity,
    { extraToday: number; optional: number }
  > = {
    low: { extraToday: 0, optional: 2 },
    normal: { extraToday: 2, optional: 3 },
    high: { extraToday: 3, optional: 3 },
  };
  const additional = additionalByCapacity[capacity];

  // 1. 今日期限・期限切れ = 必ず today に入れる
  const forcedToday = tasks.filter(
    (t) => t.due_date != null && t.due_date <= todayIso,
  );
  const others = tasks.filter(
    (t) => !(t.due_date != null && t.due_date <= todayIso),
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
      t.due_date != null && t.due_date < todayIso
        ? `期限が ${t.due_date} で過ぎています、今日まず見るとよさそうです`
        : `期限が今日 (${t.due_date}) なので、今日まず見るとよさそうです`,
    suggested_action:
      t.status === 'in_progress' ? '続きから少し進める' : '内容を確認する',
    confidence: 0.8,
  }));

  const extraTodayItems = scored.slice(0, additional.extraToday).map((s) => ({
    task_id: s.task.id,
    reason: '優先度が高そうなので、今日まず見るとよさそうです',
    suggested_action:
      s.task.status === 'in_progress' ? '続きから少し進める' : '内容を確認する',
    confidence: 0.5,
  }));

  const optional = scored
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
    optional,
    not_shown_task_ids: notShown,
    notes: [],
  };
}
