// POST /api/ai-chat/extract — チャット入力から AI タスク候補を抽出する。
//
// フロー: 認証 → Rate Limit (日次) → Lambda invoke → ai_sessions INSERT (draft)。
// 教員確認後の確定/破棄は POST /api/ai-chat/confirm を使う。
//
// フラグ: ENABLE_AI_CHAT_EXTRACTION=false なら 404 を返す (デプロイ後の段階リリース)。

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { aiSessions } from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import { mockExtractTasks } from '@/features/ai-chat/mockExtraction';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { maskPii } from '@/features/ai-chat/piiMask';

const LOCAL_MOCK =
  (process.env.AI_CHAT_LOCAL_MOCK ?? 'false').toLowerCase() === 'true';
const RATE_LIMIT_PER_DAY = Number(process.env.AI_CHAT_RATE_LIMIT_PER_DAY ?? '20');
const LAMBDA_ARN = process.env.AI_CHAT_LAMBDA_ARN ?? '';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';

const lambdaClient = new LambdaClient({ region: AWS_REGION });

const RequestSchema = z.object({
  inputText: z.string().min(1, '本文を入力してください').max(2000),
});

const TaskCandidateResponseSchema = z.object({
  title: z.string(),
  category_id: z.string().nullable(),
  due_date: z.string().nullable(),
  memo: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

type TaskCandidateResponse = z.infer<typeof TaskCandidateResponseSchema>;

const LambdaResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    result: z.object({
      tasks: z.array(TaskCandidateResponseSchema),
      needsConfirmation: z.array(z.string()),
      inputTextRedacted: z.string(),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    message: z.string(),
  }),
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
      message: parsed.error.errors[0]?.message ?? '入力が不正です',
    });
  }

  const role = pickDbRole(ctx);
  const today = new Date().toISOString().slice(0, 10);

  // 1. Rate Limit (UPSERT して count を進める)
  let currentCount = 0;
  try {
    currentCount = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const result = await tx.execute<{ count: number }>(sql`
        INSERT INTO api_rate_limits (user_id, endpoint, date, count)
        VALUES (${ctx.userId}::uuid, 'ai_chat_extract', ${today}::date, 1)
        ON CONFLICT (user_id, endpoint, date)
        DO UPDATE SET count = api_rate_limits.count + 1, updated_at = NOW()
        RETURNING count
      `);
      return result.rows[0]?.count ?? 0;
    });
  } catch (err) {
    logger.error({ event: 'ai_chat.rate_limit_error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  if (currentCount > RATE_LIMIT_PER_DAY) {
    logger.info({
      event: 'ai_chat.rate_limit_hit',
      user_id: ctx.userId,
      count: currentCount,
    });
    return res.status(429).json({
      error: 'RATE_LIMIT',
      message: '本日の利用上限に達しました。明日また使えるようになります。',
    });
  }

  // 2. AI 整理 (本番: Lambda invoke、ローカル: inline mock)
  let extraction: { tasks: TaskCandidateResponse[]; needsConfirmation: string[] };
  let inputTextRedacted: string;
  if (LOCAL_MOCK) {
    extraction = mockExtractTasks(parsed.data.inputText);
    inputTextRedacted = maskPii(parsed.data.inputText);
    logger.info({ event: 'ai_chat.local_mock_used' });
  } else {
    if (!LAMBDA_ARN) {
      logger.error({ event: 'ai_chat.lambda_arn_missing' });
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    let lambdaPayload: z.infer<typeof LambdaResponseSchema>;
    try {
      const response = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: LAMBDA_ARN,
          InvocationType: 'RequestResponse',
          Payload: Buffer.from(JSON.stringify({ inputText: parsed.data.inputText })),
        }),
      );
      if (!response.Payload) throw new Error('empty lambda payload');
      const raw = JSON.parse(Buffer.from(response.Payload).toString('utf-8'));
      lambdaPayload = LambdaResponseSchema.parse(raw);
    } catch (err) {
      logger.error({
        event: 'ai_chat.lambda_invoke_failed',
        err_name: err instanceof Error ? err.name : 'unknown',
      });
      return res.status(503).json({
        error: 'BEDROCK_ERROR',
        message: 'AI 整理に失敗しました。しばらく待ってからもう一度お試しください。',
      });
    }
    if (!lambdaPayload.ok) {
      logger.warn({ event: 'ai_chat.lambda_error', error: lambdaPayload.error });
      return res.status(503).json({
        error: 'BEDROCK_ERROR',
        message: 'AI 整理に失敗しました。しばらく待ってからもう一度お試しください。',
      });
    }
    const { inputTextRedacted: redacted, ...rest } = lambdaPayload.result;
    extraction = rest;
    inputTextRedacted = redacted;
  }

  // 3. ai_sessions に draft で INSERT (本人 + system_admin のみ可視、school_admin 不可視)
  let sessionId: string;
  try {
    sessionId = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const [row] = await tx
        .insert(aiSessions)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          type: 'quick_capture',
          inputText: parsed.data.inputText,
          aiOutputJson: {
            extraction,
            promptVersion: 'v1-2026-05-13',
            placement: 'dashboard_section',
            inputTextRedacted,
          },
          status: 'draft',
        })
        .returning({ id: aiSessions.id });
      return row.id;
    });
  } catch (err) {
    logger.error({ event: 'ai_chat.session_insert_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  logger.info({
    event: 'ai_chat.extracted',
    session_id: sessionId,
    input_length: parsed.data.inputText.length,
    candidate_count: extraction.tasks.length,
    need_confirmation_count: extraction.needsConfirmation.length,
  });

  return res.status(200).json({
    sessionId,
    tasks: extraction.tasks,
    needsConfirmation: extraction.needsConfirmation,
  });
}
