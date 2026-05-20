// AI チャット系 Lambda (Bedrock Claude Haiku 4.5)。
//
// task_extraction: チャット入力 → タスク候補抽出
//
// 呼び出し: Next.js API (/api/ai-chat/extract) から InvokeFunction。
//
// chimo 2026-05-20: H3 morning_plan 機能を撤去 (project_h3_reframing_20260520)。
// 旧 handleMorningPlan / buildMorningPlanSystemPrompt / buildMorningPlanUserMessage は削除。
//
// 観測者原則 (feedback_observed_moment_broken.md):
//   - input_text の中身は構造化ログに流さない (個人情報混入前提)
//   - 構造化ログには event 名 + 入力長 + 候補数 + type のみ

import { invokeExtraction } from './bedrockInvoker';
import {
  AiChatEventSchema,
  ExtractEventSchema,
  type ExtractionResult,
} from './schemas';
import {
  AI_CATEGORY_DEFINITIONS,
  AI_CATEGORY_PROMPT_RULES,
} from '../../src/features/ai-chat/categoryDefinitions';
import { maskPii } from '../../src/features/ai-chat/piiMask';

function buildSystemPrompt(): string {
  const categoriesBlock = JSON.stringify(
    AI_CATEGORY_DEFINITIONS.map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description,
      examples: c.examples,
      keywords: c.keywords,
    })),
    null,
    2,
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  return [
    'あなたは中学校教員の入力文からタスク候補を抽出し、既存カテゴリに分類するアシスタントです。',
    `今日の日付は ${todayIso} (YYYY-MM-DD)。期限の解決はこの日付を基準にする。`,
    '',
    '# 厳守ルール',
    '- 入力文から「やること」だけを抽出する。',
    '- 個人名・生徒名・保護者名は具体的に書かず、タスク名で抽象化する。',
    '  例: 「Aさんが元気なさそう」→「気になる生徒の様子を確認する」',
    '- 1 タスク 1 アクションに分解する。',
    '- 教員を評価・診断・励まさない。感情代弁・寄り添い表現は禁止。',
    '- 保存はしない (候補だけ返す)。',
    '- 出力は必ず指定 JSON 形式のみ。前後の説明文や markdown 装飾を一切付けない。',
    '',
    '# 期限 (due_date) の解決ルール',
    '- 明示的な期限表現があれば、それぞれのタスクに対応する due_date を YYYY-MM-DD 形式で設定する。',
    '- 「今日」→ 今日の日付。「明日」→ 今日 + 1 日。「明後日」→ 今日 + 2 日。',
    '- 「金曜まで」「今週金曜」→ 今週の対応する曜日。今日がその曜日 or 過ぎていれば来週扱い。',
    '- 「来週月曜」→ 来週の対応する曜日。',
    '- 「5/25」「5月25日」など月日のみ → 今年の該当日。過去日付なら来年扱い。',
    '- 入力に複数のタスクと期限が混在する場合は、文脈から対応関係を判断して各タスクに紐付ける。',
    '  例:「明日までに保護者返信、金曜までに掲示物の確認」→ 保護者返信に明日、掲示物に金曜。',
    '- 「今度」「そろそろ」「近いうち」「いずれ」など曖昧な表現は due_date を null にし、必要なら needsConfirmation に「期限が曖昧です」と追記する。',
    '- 期限の言及がなければ due_date を null にする。推測で日付を入れない。',
    '',
    '# カテゴリ一覧',
    categoriesBlock,
    '',
    AI_CATEGORY_PROMPT_RULES,
    '',
    '# 出力形式 (この JSON 形式のみ)',
    '{',
    '  "tasks": [',
    '    {',
    '      "title": "string (タスク名、PII 抽象化済)",',
    '      "category_id": "string | null",',
    '      "due_date": "YYYY-MM-DD | null",',
    '      "memo": "string (任意、空文字可)",',
    '      "confidence": "high | medium | low"',
    '    }',
    '  ],',
    '  "needsConfirmation": ["string (曖昧で確認したい事項、なければ空配列)"]',
    '}',
  ].join('\n');
}

interface SuccessResult {
  ok: true;
  type: 'task_extraction';
  modelId: string;
  result: ExtractionResult & { inputTextRedacted: string };
}

interface ErrorResult {
  ok: false;
  error: 'invalid_event' | 'invalid_ai_output' | 'bedrock_error';
  message: string;
}

export async function handler(event: unknown): Promise<SuccessResult | ErrorResult> {
  // 1. Event 検証
  const parsed = AiChatEventSchema.safeParse(event);
  if (!parsed.success) {
    console.warn(
      JSON.stringify({
        event: 'ai_chat.invalid_event',
        issues: parsed.error.issues.map((i) => i.code),
      }),
    );
    return { ok: false, error: 'invalid_event', message: 'invalid event shape' };
  }

  const extractEvent = ExtractEventSchema.parse(parsed.data);
  return handleTaskExtraction(extractEvent.inputText);
}

async function handleTaskExtraction(
  inputText: string,
): Promise<SuccessResult | ErrorResult> {
  const inputTextRedacted = maskPii(inputText);

  console.info(
    JSON.stringify({
      event: 'ai_chat.invoke_start',
      type: 'task_extraction',
      input_length: inputTextRedacted.length,
    }),
  );

  let extraction: ExtractionResult;
  let modelId: string;
  try {
    const invoked = await invokeExtraction({
      systemPrompt: buildSystemPrompt(),
      userMessage: inputTextRedacted,
    });
    extraction = invoked.result;
    modelId = invoked.modelId;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'ai_chat.bedrock_error',
        type: 'task_extraction',
        error_name: err instanceof Error ? err.name : 'unknown',
        error_message: err instanceof Error ? err.message : String(err),
      }),
    );
    return {
      ok: false,
      error: 'bedrock_error',
      message: 'extraction failed',
    };
  }

  console.info(
    JSON.stringify({
      event: 'ai_chat.invoke_success',
      type: 'task_extraction',
      input_length: inputTextRedacted.length,
      candidate_count: extraction.tasks.length,
      need_confirmation_count: extraction.needsConfirmation.length,
    }),
  );

  return {
    ok: true,
    type: 'task_extraction',
    modelId,
    result: { ...extraction, inputTextRedacted },
  };
}
