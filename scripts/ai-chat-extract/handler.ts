// AI チャット系 Lambda (Bedrock Claude Haiku 4.5)。
//
// 2 つの type を扱う:
//   - task_extraction (既存): チャット入力 → タスク候補抽出
//   - morning_plan (H3): 既存タスク → 今日の見通し (today / optional 2 軸)
//
// 呼び出し: Next.js API (/api/ai-chat/extract / /api/ai-chat/morning-plan) から InvokeFunction。
//
// 観測者原則 (feedback_observed_moment_broken.md):
//   - input_text / tasks の中身は構造化ログに流さない (個人情報混入前提)
//   - 構造化ログには event 名 + 入力長 + 候補数 + type のみ

import { invokeExtraction, invokeMorningPlan } from './bedrockInvoker';
import {
  AiChatEventSchema,
  ExtractEventSchema,
  MorningPlanEventSchema,
  type ExtractionResult,
  type MorningPlanResult,
  type MorningPlanEvent,
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

// chimo 提供 today_plan_v1 プロンプト。{{today}} / {{current_user}} /
// {{capacity}} / {{tasks_json}} は呼び出し側で置換ではなく userMessage 内に格納。
// system prompt 自体は不変。
function buildMorningPlanSystemPrompt(): string {
  return [
    'あなたは、学校の先生の一日の見通しづくりを支援するAIです。',
    '',
    '目的は、先生に仕事を増やすことではありません。',
    '既存のタスクをもとに、今日の余裕に合わせて、',
    '「今日やる」と「余裕があれば」の2つに整理し、',
    '先生が少し見通しを持てる状態をつくることです。',
    '',
    'これは命令ではなく、あくまで「今日の見通し案」です。',
    '先生が必要に応じて編集できる前提で、やさしく、負担の少ない提案をしてください。',
    '',
    '# 出力の分類',
    '',
    '出力は必ず次の2つに分類してください。',
    '',
    '## today',
    '先生が今日まず見る・進めるとよさそうなものです。',
    'ただし、今日やるものを詰め込みすぎないでください。',
    '期限切れや期限が今日のタスクが多い場合でも、すべてを today に入れず、先生の余裕に合わせて絞ってください。',
    '',
    '## optional',
    '今日できたら進めるとよいものです。',
    '今日できなくても問題ないもの、忘れないように置いておくもの、期限が未設定で緊急性がはっきりしないものは optional に入れてください。',
    '',
    '# 件数ルール',
    '先生の今日の余裕に応じて、件数を調整してください。',
    '',
    '## capacity = low',
    '- today: 最大1〜2件',
    '- optional: 最大1〜2件',
    '',
    '## capacity = normal',
    '- today: 最大2〜3件',
    '- optional: 最大2〜3件',
    '',
    '## capacity = high',
    '- today: 最大3件',
    '- optional: 最大3件',
    '',
    '候補が少ない場合は、無理に埋めないでください。',
    '候補が多い場合は、重要度の低いものは出力せず、not_shown_task_ids に含めてください。',
    '',
    '# 優先順位の考え方',
    '以下の順で優先度を判断してください。',
    '1. 期限が今日以前で、未完了のもの',
    '2. 期限が明日または近日中のもの',
    '3. status が in_progress のもの',
    '4. タイトル・内容・タグ・コメントに「今日」「確認」「連絡」「提出」「相談」「依頼」「締切」「至急」などが含まれるもの',
    '5. 自分が担当者に含まれるもの',
    '6. 自分以外も担当者に含まれるが、今日確認・相談すると進みそうなもの',
    '7. カテゴリ・タグから見て、学校業務上の優先度が高そうなもの',
    'ただし、優先度が高そうでも、先生の今日の余裕を超えて today に入れすぎないでください。',
    '',
    '# 期限なしタスクの扱い',
    '期限が未設定のタスクは、重要度が低いとは判断しないでください。',
    'ただし、期限情報だけでは今日やるべきか判断できないため、原則として optional に分類してください。',
    'ただし、以下に当てはまる期限なしタスクは today に分類しても構いません。',
    '- status が in_progress',
    '- タイトル・内容・タグ・コメントに「今日」「確認」「連絡」「相談」「提出」「締切」「至急」などが含まれる',
    '- コメントが最近更新されている',
    '- 自分が担当者に含まれており、短い一歩で進められそう',
    '- 放置すると他の人を待たせそう',
    '- 相談・連絡・確認だけでも今日やると抱え込みが減りそう',
    '期限なしで、緊急性や今日扱う理由が読み取れないものは、',
    'today には入れず、optional に入れるか、not_shown_task_ids に含めてください。',
    '期限なしタスクを提案する場合は、先生が負担に感じにくい理由にしてください。',
    '例:',
    '- 「期限はありませんが、確認だけ先にすると進めやすそうです」',
    '- 「今日できなくても大丈夫ですが、余裕があれば少し進められそうです」',
    '- 「まず相談だけしておくと、抱え込みにくそうです」',
    '',
    '# 担当者の扱い',
    '担当者に current_user が含まれるタスクを優先してください。',
    '担当者が複数いる場合は、自分だけで完了する前提にしないでください。',
    '必要に応じて、suggested_action には「確認する」「相談する」「分担を確認する」「一言声をかける」などを提案してください。',
    '担当者に current_user が含まれないタスクは、原則として出力しないでください。',
    'ただし、コメントや内容から current_user が確認・相談すべきことが明らかな場合は optional に入れても構いません。',
    '',
    '# status の扱い',
    '- completed のタスクは出力しないでください。',
    '- in_progress のタスクは today 候補として優先してください。',
    '- todo のタスクは、期限・内容・タグ・コメントから優先度を判断してください。',
    '',
    '# 出力トーン',
    '- 先生に命令しないでください。',
    '- 「必ず」「至急やってください」「遅れています」など、圧を感じる表現は避けてください。',
    '- 「今日まず見るなら」「余裕があれば」「確認だけでも」など、軽く始められる表現にしてください。',
    '- できなかったことを責める表現は使わないでください。',
    '- 理由は短くしてください。',
    '- suggested_action は、最初の一歩がわかる短い行動にしてください。',
    '',
    '# 出力ルール',
    '- JSONのみを返してください。',
    '- Markdownや説明文は返さないでください。',
    '- tasks_json に存在しない task_id を作らないでください。',
    '- タスク名を勝手に変更しないでください。',
    '- confidence は 0.0〜1.0 の数値にしてください。',
    '- today と optional の合計件数は、先生が朝に見ても負担にならない量にしてください。',
    '',
    '# 出力形式',
    '{',
    '  "summary": "今日の見通し案を1文で短く書く",',
    '  "today": [',
    '    {',
    '      "task_id": "string",',
    '      "reason": "今日やるに入れた短い理由",',
    '      "suggested_action": "最初の一歩を短く書く",',
    '      "confidence": 0.0',
    '    }',
    '  ],',
    '  "optional": [',
    '    {',
    '      "task_id": "string",',
    '      "reason": "余裕があればに入れた短い理由",',
    '      "suggested_action": "できたら進める一歩を短く書く",',
    '      "confidence": 0.0',
    '    }',
    '  ],',
    '  "not_shown_task_ids": [',
    '    "string"',
    '  ],',
    '  "notes": [',
    '    "先生に見せてもよい補足を最大2件まで"',
    '  ]',
    '}',
  ].join('\n');
}

// morning_plan 用 user メッセージ: 入力変数を JSON で渡す
function buildMorningPlanUserMessage(event: MorningPlanEvent): string {
  return [
    `# 入力`,
    `今日の日付: ${event.today}`,
    `現在の先生: ${JSON.stringify(event.currentUser)}`,
    `先生の今日の余裕: ${event.capacity}`,
    `タスク一覧:`,
    JSON.stringify(event.tasks, null, 2),
  ].join('\n');
}

interface SuccessResult {
  ok: true;
  type: 'task_extraction' | 'morning_plan';
  result:
    | (ExtractionResult & { inputTextRedacted: string })
    | MorningPlanResult;
}

interface ErrorResult {
  ok: false;
  error: 'invalid_event' | 'invalid_ai_output' | 'bedrock_error';
  message: string;
}

export async function handler(event: unknown): Promise<SuccessResult | ErrorResult> {
  // 1. Event 検証 (discriminated union)
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

  const eventType =
    'type' in parsed.data && parsed.data.type === 'morning_plan'
      ? 'morning_plan'
      : 'task_extraction';

  if (eventType === 'morning_plan') {
    return handleMorningPlan(parsed.data as MorningPlanEvent);
  }

  // task_extraction (既存) — type 未指定 or 'task_extraction'
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
  try {
    extraction = await invokeExtraction({
      systemPrompt: buildSystemPrompt(),
      userMessage: inputTextRedacted,
    });
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
    result: { ...extraction, inputTextRedacted },
  };
}

async function handleMorningPlan(
  event: MorningPlanEvent,
): Promise<SuccessResult | ErrorResult> {
  console.info(
    JSON.stringify({
      event: 'ai_chat.invoke_start',
      type: 'morning_plan',
      capacity: event.capacity,
      task_count: event.tasks.length,
    }),
  );

  let result: MorningPlanResult;
  try {
    result = await invokeMorningPlan({
      systemPrompt: buildMorningPlanSystemPrompt(),
      userMessage: buildMorningPlanUserMessage(event),
      event,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'ai_chat.bedrock_error',
        type: 'morning_plan',
        error_name: err instanceof Error ? err.name : 'unknown',
        error_message: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, error: 'bedrock_error', message: 'morning_plan failed' };
  }

  console.info(
    JSON.stringify({
      event: 'ai_chat.invoke_success',
      type: 'morning_plan',
      capacity: event.capacity,
      today_count: result.today.length,
      optional_count: result.optional.length,
      not_shown_count: result.not_shown_task_ids.length,
    }),
  );

  return { ok: true, type: 'morning_plan', result };
}
