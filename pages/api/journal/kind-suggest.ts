// POST /api/journal/kind-suggest — 本文から journal 種別を AI が「そっと提案」する。
//
// フロー: 認証 → フラグ → Rate Limit (日次) → AI (本番: Lambda / ローカル: inline mock) → 提案を返す。
// 確定は行わない (本人が TodayCaptureBox の確認ステップで決める)。
//
// 踏み絵: AI は決めない・提案のみ。フラグ off は 404、失敗は 503。入口側は tweet で成立する。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { maskPii } from '@/features/ai-chat/piiMask';
import {
  kindSuggestResultSchema,
  mockKindSuggest,
  type KindSuggestResult,
} from '@/features/ai-chat/kindSuggest';

const LOCAL_MOCK =
  (process.env.AI_CHAT_LOCAL_MOCK ?? 'false').toLowerCase() === 'true';
// 種別提案はタイピング中デバウンスで頻繁に呼ばれるため、タスク抽出 (20/日) とは別枠の高い上限。
// さらに加算は「提案成功時のみ」(下記) — 失敗 (Bedrock 障害等) で枠を消費しない。
const RATE_LIMIT_PER_DAY = Number(
  process.env.AI_CHAT_KIND_SUGGEST_RATE_LIMIT_PER_DAY ?? '200',
);
const LAMBDA_ARN = process.env.AI_CHAT_LAMBDA_ARN ?? '';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';

const lambdaClient = new LambdaClient({ region: AWS_REGION });

const RequestSchema = z.object({
  content: z.string().min(1, '本文を入力してください').max(2000),
});

// Lambda 応答 (2b で kind_suggestion 分岐が返す形)。
const LambdaResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    modelId: z.string().optional(),
    result: kindSuggestResultSchema,
  }),
  z.object({ ok: z.literal(false), error: z.string(), message: z.string() }),
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!isAiChatEnabledForTenant(ctx.tenantId)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message ?? '入力が不正です',
    });
  }

  const role = pickDbRole(ctx);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Rate Limit 判定 (read のみ・加算は提案成功後)。失敗した呼び出しで枠を消費しないため。
  let currentCount = 0;
  try {
    currentCount = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const result = await tx.execute<{ count: number }>(sql`
        SELECT count FROM api_rate_limits
        WHERE user_id = ${ctx.userId}::uuid
          AND endpoint = 'journal_kind_suggest'
          AND date = ${today}::date
      `);
      return result.rows[0]?.count ?? 0;
    });
  } catch (err) {
    logger.error({ event: 'journal_kind_suggest.rate_limit_error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  if (currentCount >= RATE_LIMIT_PER_DAY) {
    return res.status(429).json({
      error: 'RATE_LIMIT',
      message: '本日の利用上限に達しました。明日また使えるようになります。',
    });
  }

  // 2. AI 提案 (本番: Lambda invoke、ローカル: inline mock)
  let suggestion: KindSuggestResult;
  if (LOCAL_MOCK) {
    suggestion = mockKindSuggest(parsed.data.content);
    logger.info({ event: 'journal_kind_suggest.local_mock_used' });
  } else {
    if (!LAMBDA_ARN) {
      logger.error({ event: 'journal_kind_suggest.lambda_arn_missing' });
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    try {
      const response = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: LAMBDA_ARN,
          InvocationType: 'RequestResponse',
          Payload: Buffer.from(
            JSON.stringify({
              type: 'kind_suggestion',
              inputText: maskPii(parsed.data.content),
            }),
          ),
        }),
      );
      if (!response.Payload) throw new Error('empty lambda payload');
      const raw = JSON.parse(Buffer.from(response.Payload).toString('utf-8'));
      const lambdaPayload = LambdaResponseSchema.parse(raw);
      if (!lambdaPayload.ok) {
        logger.warn({ event: 'journal_kind_suggest.lambda_error', error: lambdaPayload.error });
        return res.status(503).json({ error: 'BEDROCK_ERROR' });
      }
      suggestion = lambdaPayload.result;
    } catch (err) {
      logger.error({
        event: 'journal_kind_suggest.lambda_invoke_failed',
        err_name: err instanceof Error ? err.name : 'unknown',
      });
      return res.status(503).json({ error: 'BEDROCK_ERROR' });
    }
  }

  // 3. 提案が得られたときだけ枠を加算 (失敗は上で return 済みなのでここに来ない)。
  //    加算失敗は提案返却を妨げない (best-effort)。
  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      await tx.execute(sql`
        INSERT INTO api_rate_limits (user_id, endpoint, date, count)
        VALUES (${ctx.userId}::uuid, 'journal_kind_suggest', ${today}::date, 1)
        ON CONFLICT (user_id, endpoint, date)
        DO UPDATE SET count = api_rate_limits.count + 1, updated_at = NOW()
      `);
    });
  } catch (err) {
    logger.warn({ event: 'journal_kind_suggest.rate_limit_increment_failed', err });
  }

  logger.info({
    event: 'journal_kind_suggest.suggested',
    input_length: parsed.data.content.length,
    suggested_kind: suggestion.suggestedKind ?? 'tweet',
    confidence: suggestion.confidence,
  });

  return res.status(200).json(suggestion);
}
