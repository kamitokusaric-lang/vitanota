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

import {
  invokeExtraction,
  invokeKindSuggest,
  invokeRetroRecommend,
} from './bedrockInvoker';
import {
  AiChatEventSchema,
  ExtractEventSchema,
  KindSuggestEventSchema,
  RetroRecommendEventSchema,
  type ExtractionResult,
  type RetroRecommendEvent,
} from './schemas';
import type { KindSuggestResult } from '../../src/features/ai-chat/kindSuggest';
import type { RetroRecommendResult } from '../../src/features/journal/recommend/recommendSchema';
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

interface RetroRecommendSuccess {
  ok: true;
  type: 'retrospective_recommend';
  modelId: string;
  result: RetroRecommendResult;
}

interface ErrorResult {
  ok: false;
  error: 'invalid_event' | 'invalid_ai_output' | 'bedrock_error';
  message: string;
}

type HandlerResult =
  | ExtractionSuccess
  | KindSuggestSuccess
  | RetroRecommendSuccess
  | ErrorResult;

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

  if (parsed.data.type === 'retrospective_recommend') {
    const ev = RetroRecommendEventSchema.parse(parsed.data);
    return handleRetroRecommend(ev);
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

// ── retrospective_recommend (ふりかえり → AIリコメンド) ──────────
// 設計: docs/proposal/retrospective.md §1/§5/§6。
// 非対称設計: 気づき(awareness)は能動的に返してよいが、公開という行動は 100% 本人。
// AI は区分を選ばない (ルール側 candidateCategory を尊重し、surface だけ判断)。
// 踏み絵: 感情代弁・励まし・評価をしない。mood は読むだけ (推定・採点・上書きしない)。
function buildRetroSystemPrompt(): string {
  return [
    'あなたは中学校教員が「自分だけの記録 (マイノート)」に書いた今日のふりかえりを読み、',
    '職員室の同僚に向けて出す価値があれば、その下書きをそっと用意するアシスタントです。',
    '',
    '# 大原則 (非対称設計)',
    '- 「気づき」は能動的に返してよい (本人が抱えていることに名前をつけて差し出す)。',
    '- だが「出すかどうか」は 100% 本人が決める。あなたは決めない・急かさない・誘導しない。',
    '- 出す価値が薄い日は surface=false でよい (ゼロ件を許容)。無理に出さない。',
    '',
    '# 禁止事項 (踏み絵)',
    '- 教員を評価・診断・採点・分類しない。感情を代弁しない。励まさない。寄り添い表現を書かない。',
    '- mood (気分) は本人が選んだものを文脈として読むだけ。mood を推定・上書き・スコア化しない。出力に mood を含めない。',
    '- 生徒名・保護者名・個人を特定する情報はドラフトから必ず外す (抽象化する)。',
    '- 感情の生々しい表現は公開用に和らげる。',
    '',
    '# 区分 (category) — ルール側が candidateCategory を渡す。原則それを尊重する',
    '- "soudan" 相談: 困っている・確認したいこと。会議の議題として扱われる。',
    '- "kansha" 感謝: 誰かへのありがとう。',
    '- "knowledge" ナレッジ: 再現できる工夫・やり方。',
    '- "tweet" つぶやき: 軽い共有。← この場合は primary を null にし、tweet.nudge だけ返す (ドラフトは作らない)。',
    '',
    '# 何を拾うか (優先順位)',
    '- ふりかえりに「よかったこと」と「気になった・困ったこと」が両方書かれていても、よかったことは当たり前として主提案にしない。',
    '  拾うべきは「気になった・困ったこと」(気がかり・心配を含む)。それがあれば相談として surface する (候補区分は soudan で来る)。',
    '  例: 「よかった: 生徒と雑談できた / 気になった: 一人でいる子が気になる」→ 一人でいる子の話を相談として拾う (雑談の話をつぶやきにしない)。',
    '',
    '# ドラフト(draft)の書き方 — 最重要',
    'draft は「本人が一切手を加えずに、そのまま職員室ボード/ノートに投稿できる完成文」にする。整形不足の下書きは失敗。',
    '- ふりかえりの見出し(「よかった・続けたいこと」「気になった・困ったこと」「次に試したいこと」)や箇条書き構造を絶対に持ち込まない。地の文の自然な文章に書き直す。',
    '- 主提案の区分に関係する部分だけを扱う。無関係な欄は入れない (例: 相談なら「困ったこと」だけを素材にし、「よかったこと」は使わない)。',
    '- 一人称の自然な話し言葉。教員が同僚に向けて職員室で話しかけるトーン。硬い書き言葉や説明口調にしない。',
    '- 文は必ず完結させる。途中で切らない。原文の言い回しをそのままコピペせず、意味を汲んで書き直す。',
    '- 長さの目安は 1〜3 文。冗長にしない。',
    '- 生徒名・保護者名・固有名詞は出さない。感情の生々しい表現は和らげる。',
    '- 区分ごとの型:',
    '  - 相談: 状況を一言添えつつ、困りごとの核心(「どうすれば〜できるか」など・「次に試したいこと」欄に書かれることが多い)を具体的な問いにして締める。観察の言い換えだけで終えない。例:「授業中にそわそわしている子がいて、どうすれば集中してもらえるか悩んでいます。みなさんはどんな工夫をしていますか?」',
    '  - 感謝: 何が助かった/嬉しかったかを簡潔に。宛先の名前は出さず「学年の先生」等に留める。',
    '  - ナレッジ: 何をどうしたら良かったかを、他の先生が再現できる形で簡潔に。',
    '',
    '# その他の出力',
    '- awareness: 本人にそっと差し出す気づきの一文 (評価でなく、抱えていることに名前をつける)。',
    '- meta: 感謝=recipientHint (誰への感謝か・名前は出さない) / ナレッジ=title (短いタイトル) + points (要点 1〜3 個)。相談は meta を空 {} にする (どこに共有されるかの案内はアプリ側が出す)。',
    '- tweet (つぶやきのとき): nudge=「これ、ひとりで持っておくのもったいないかも」等の軽い気づき一言。投稿への誘い文はアプリ側が出すので nudge には入れない。draft は作らない (本人が素のまま書く)。',
    '- reason: なぜこの判断にしたかの短いメモ (本人には見せない・計測用)。',
    '',
    '# 安全 (最優先)',
    '- 自傷・強い心理的危機の兆候を読み取ったら、公開の提案は一切しない。surface=false にし、reason に "crisis_signal" と書く。',
    '',
    '# 出力形式 (この JSON のみ・前後の説明や markdown を一切付けない)',
    '{',
    '  "surface": true | false,',
    '  "primary": null | { "category": "soudan"|"kansha"|"knowledge", "awareness": "string", "draft": "string", "meta": { "recipientHint"?: "string", "title"?: "string", "points"?: ["string"] } },',
    '  "tweet": null | { "nudge": "string" },',
    '  "reason": "string"',
    '}',
  ].join('\n');
}

// Lambda に渡る本文は route 側で PII マスク済。tags/mood は読むだけの信号として添える。
function buildRetroUserMessage(ev: RetroRecommendEvent): string {
  const tagsLine =
    ev.tags.length > 0
      ? ev.tags.map((t) => `${t.name}(${t.category})`).join(', ')
      : 'なし';
  return [
    '# 今日のふりかえり (本文)',
    ev.inputText,
    '',
    `# 気持ちタグ: ${tagsLine}`,
    `# 気分(mood・本人選択・読むだけ): ${ev.mood ?? '未選択'}`,
    `# ルール側の候補区分: ${ev.candidateCategory ?? 'なし'}`,
  ].join('\n');
}

async function handleRetroRecommend(
  ev: RetroRecommendEvent,
): Promise<RetroRecommendSuccess | ErrorResult> {
  // 本文は構造化ログに出さない (観測者原則)。長さと候補区分のみ。
  console.info(
    JSON.stringify({
      event: 'ai_chat.invoke_start',
      type: 'retrospective_recommend',
      input_length: ev.inputText.length,
      candidate_category: ev.candidateCategory ?? 'none',
    }),
  );

  let result: RetroRecommendResult;
  let modelId: string;
  try {
    const invoked = await invokeRetroRecommend({
      systemPrompt: buildRetroSystemPrompt(),
      userMessage: buildRetroUserMessage(ev),
      candidateCategory: ev.candidateCategory,
      rawContent: ev.inputText,
    });
    result = invoked.result;
    modelId = invoked.modelId;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'ai_chat.bedrock_error',
        type: 'retrospective_recommend',
        error_name: err instanceof Error ? err.name : 'unknown',
        error_message: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, error: 'bedrock_error', message: 'retro recommend failed' };
  }

  console.info(
    JSON.stringify({
      event: 'ai_chat.invoke_success',
      type: 'retrospective_recommend',
      input_length: ev.inputText.length,
      surface: result.surface,
      primary_category: result.primary?.category ?? 'none',
      has_tweet: result.tweet !== null,
    }),
  );

  return { ok: true, type: 'retrospective_recommend', modelId, result };
}
