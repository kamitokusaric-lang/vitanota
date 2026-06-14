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

import { invokeExtraction, invokeKindSuggest } from './bedrockInvoker';
import {
  AiChatEventSchema,
  ExtractEventSchema,
  KindSuggestEventSchema,
  type ExtractionResult,
} from './schemas';
import type { KindSuggestResult } from '../../src/features/ai-chat/kindSuggest';
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

interface ExtractionSuccess {
  ok: true;
  type: 'task_extraction';
  modelId: string;
  result: ExtractionResult & { inputTextRedacted: string };
}

interface KindSuggestSuccess {
  ok: true;
  type: 'kind_suggestion';
  modelId: string;
  result: KindSuggestResult;
}

interface ErrorResult {
  ok: false;
  error: 'invalid_event' | 'invalid_ai_output' | 'bedrock_error';
  message: string;
}

type HandlerResult = ExtractionSuccess | KindSuggestSuccess | ErrorResult;

export async function handler(event: unknown): Promise<HandlerResult> {
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

  if (parsed.data.type === 'kind_suggestion') {
    const ev = KindSuggestEventSchema.parse(parsed.data);
    return handleKindSuggestion(ev.inputText);
  }

  const extractEvent = ExtractEventSchema.parse(parsed.data);
  return handleTaskExtraction(extractEvent.inputText);
}

async function handleTaskExtraction(
  inputText: string,
): Promise<ExtractionSuccess | ErrorResult> {
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

// ── kind_suggestion (Slice 2b) ──────────────────────────────
// 踏み絵: AI は決めない・提案のみ (本人が確定)。「分類・評価・感情代弁」をしない。
// 「どこへ渡す / どう残す」のルーティングとして種別を 1 つだけそっと薦める。確信が無ければ null。
function buildKindSuggestSystemPrompt(): string {
  return [
    'あなたは中学校教員が職員室ノートに書いた一文を、しまう先の入口へそっと案内するアシスタントです。',
    '',
    '# 役割',
    '- 文章を「分類」「評価」「採点」しない。教員を診断・励まさない。感情を代弁しない。',
    '- やることは、その一文を「どの入口に渡すと自然か」を 1 つだけ控えめに薦めることだけ。',
    '- 確定はしない (最終的に教員本人が選ぶ)。迷ったら無理に決めず null を返す。',
    '',
    '# 入口の種類 (suggestedKind)',
    '- "knowledge": 役に立つ情報・やり方・工夫・手順・テンプレなど、他の先生の参考になる共有。',
    '- "thanks": 誰かへの感謝・お礼・助かったという気持ちの共有。',
    '- "help": 確認したいこと・相談したいこと・困っていて誰かの知恵を借りたいこと。',
    '- null: 上のどれにも自然に当てはまらない、ただのつぶやき。判断に迷うときも null。',
    '',
    '# 確信度 (confidence)',
    '- "high": 入口がはっきり読み取れる。"medium": おそらくそうだが断定しない。"low": 弱い手がかりのみ。',
    '- null を返すときは "low"。',
    '',
    '# 出力形式 (この JSON のみ・前後の説明や markdown を一切付けない)',
    '{ "suggestedKind": "knowledge" | "thanks" | "help" | null, "confidence": "high" | "medium" | "low" }',
  ].join('\n');
}

async function handleKindSuggestion(
  inputText: string,
): Promise<KindSuggestSuccess | ErrorResult> {
  // route 側で PII マスク済の本文が渡る。本文は構造化ログに出さない (観測者原則)。
  console.info(
    JSON.stringify({
      event: 'ai_chat.invoke_start',
      type: 'kind_suggestion',
      input_length: inputText.length,
    }),
  );

  let result: KindSuggestResult;
  let modelId: string;
  try {
    const invoked = await invokeKindSuggest({
      systemPrompt: buildKindSuggestSystemPrompt(),
      userMessage: inputText,
    });
    result = invoked.result;
    modelId = invoked.modelId;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'ai_chat.bedrock_error',
        type: 'kind_suggestion',
        error_name: err instanceof Error ? err.name : 'unknown',
        error_message: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, error: 'bedrock_error', message: 'kind suggestion failed' };
  }

  console.info(
    JSON.stringify({
      event: 'ai_chat.invoke_success',
      type: 'kind_suggestion',
      input_length: inputText.length,
      suggested_kind: result.suggestedKind ?? 'tweet',
      confidence: result.confidence,
    }),
  );

  return { ok: true, type: 'kind_suggestion', modelId, result };
}
