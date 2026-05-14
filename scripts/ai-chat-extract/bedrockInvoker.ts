// Bedrock Claude Haiku 4.5 を呼び出すサービス。
// MOCK_BEDROCK=true の場合、固定 fixture を返してローカル/CI 開発を可能にする
// (chimo 2026-05-11 合意のハイブリッド開発スタイル: 日常開発は mock、プロンプト調整は AWS Console Playground)。

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { ExtractionResultSchema, type ExtractionResult } from './schemas';

const REGION = process.env.AWS_REGION_OVERRIDE ?? process.env.AWS_REGION ?? 'ap-northeast-1';
const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-haiku-4-5-20251001-v1:0';
const MAX_TOKENS = Number(process.env.BEDROCK_MAX_TOKENS ?? '800');
const USE_MOCK = (process.env.MOCK_BEDROCK ?? 'false').toLowerCase() === 'true';

const client = USE_MOCK ? null : new BedrockRuntimeClient({ region: REGION });

export async function invokeExtraction(args: {
  systemPrompt: string;
  userMessage: string;
}): Promise<ExtractionResult> {
  if (USE_MOCK) {
    return mockExtraction(args.userMessage);
  }

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: MAX_TOKENS,
    system: args.systemPrompt,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: args.userMessage }],
      },
    ],
  };

  // 1 回 retry (Bedrock 一時障害対策、Unit-05 NFR-U05-AVL に対応)
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
      return parseExtractionPayload(text);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function parseExtractionPayload(text: string): ExtractionResult {
  // AI が markdown code fence で囲んでも剥がす保険
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const json = JSON.parse(stripped);
  return ExtractionResultSchema.parse(json);
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
