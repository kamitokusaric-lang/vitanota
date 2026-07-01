// /api/journal/recommend — ふりかえり (マイノート=非公開 note) → AIリコメンド。
//
// POST  { entryId }                : 計算 or キャッシュ返却 (idempotent)。保存起点の fire-and-forget で叩かれる。
// GET   ?entryId=...               : 既存リコメンドの取得 (マイノート詳細の表示用)。
// PATCH { entryId, status }        : 本人の対応状態を更新 (published=出した / dismissed=やめておく)。
//
// フロー(POST): 認証 → フラグ(404) → entry 所有権/種別検証 → 既存あれば返す → Rate Limit
//   → ルール側で候補区分を絞る → PII マスク → AI(本番:Lambda / ローカル:inline mock) → 永続化 → 返却。
//
// 踏み絵: 気づきは能動・行動は受け身。AI は宛先を選ばない。mood は読むだけ。フラグ off は 404。
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { and, eq, sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { JournalNotFoundError } from '@/features/journal/lib/errors';
import { journalEntryService } from '@/features/journal/lib/journalEntryService';
import { withTenantUser } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
import { LogEvents, logEvent } from '@/shared/lib/log-events';
import { journalRecommendations } from '@/db/schema';
import { isRetroRecommendEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { maskPii } from '@/features/ai-chat/piiMask';
import {
  retroRecommendResultSchema,
  mockRetroRecommend,
  type RetroRecommendResult,
} from '@/features/journal/recommend/recommendSchema';
import { routeCategory, type RouterTag } from '@/features/journal/recommend/recommendRouter';

// プロンプト版 (プロンプト改善時に上げる。バージョン間で転換率を比較するため計算行に残す)。
const PROMPT_VERSION = 'retro-v1-2026-07-01';
const LOCAL_MOCK = (process.env.AI_CHAT_LOCAL_MOCK ?? 'false').toLowerCase() === 'true';
const RATE_LIMIT_PER_DAY = Number(process.env.RETRO_RECOMMEND_RATE_LIMIT_PER_DAY ?? '50');
const LAMBDA_ARN = process.env.AI_CHAT_LAMBDA_ARN ?? '';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';

const lambdaClient = new LambdaClient({ region: AWS_REGION });

const PostSchema = z.object({ entryId: z.string().guid() });
const PatchSchema = z.object({
  entryId: z.string().guid(),
  status: z.enum(['published', 'dismissed']),
  // 計測用 (任意): 公開時の最終区分と本文編集の有無 (§9 転換率/編集率)。
  finalCategory: z.enum(['soudan', 'kansha', 'knowledge', 'tweet']).optional(),
  bodyChanged: z.boolean().optional(),
});
const QuerySchema = z.object({ entryId: z.string().guid() });

// 主提案/つぶやきから計測用の代表区分を導く。
function proposedCategoryOf(rec: RetroRecommendResult): 'soudan' | 'kansha' | 'knowledge' | 'tweet' | 'none' {
  if (rec.primary) return rec.primary.category;
  if (rec.tweet) return 'tweet';
  return 'none';
}

// Lambda 応答 (handler の retrospective_recommend 分岐が返す形)。
const LambdaResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    type: z.string().optional(),
    modelId: z.string().optional(),
    result: retroRecommendResultSchema,
  }),
  z.object({ ok: z.literal(false), error: z.string(), message: z.string() }),
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!isRetroRecommendEnabledForTenant(ctx.tenantId)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  if (req.method === 'GET') return handleGet(req, res, ctx);
  if (req.method === 'POST') return handlePost(req, res, ctx);
  if (req.method === 'PATCH') return handlePatch(req, res, ctx);

  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
}

type Ctx = NonNullable<Awaited<ReturnType<typeof requireAuth>>>;

// ── GET: 既存リコメンドの取得 ──────────────────────────────
async function handleGet(req: NextApiRequest, res: NextApiResponse, ctx: Ctx) {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_ID', message: '不正なIDです' });
  }
  const role = pickDbRole(ctx);
  const existing = await findExisting(ctx, role, parsed.data.entryId);
  return res.status(200).json({
    recommendation: existing?.recommendation ?? null,
    status: existing?.status ?? null,
  });
}

// ── POST: 計算 or キャッシュ返却 ───────────────────────────
async function handlePost(req: NextApiRequest, res: NextApiResponse, ctx: Ctx) {
  const parsed = PostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'INVALID_ID', message: '不正なIDです' });
  }
  const { entryId } = parsed.data;
  const role = pickDbRole(ctx);

  // 1. 対象 entry を所有権つきで取得 (他人 / 不在は 404)。
  let entry;
  try {
    entry = await journalEntryService.getEntryById(entryId, ctx);
  } catch (err) {
    if (err instanceof JournalNotFoundError) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    logger.error({ event: 'journal_recommend.entry_load_error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  // 2. リコメンド対象はマイノートのふりかえり (kind=note かつ 非公開) のみ。
  if (entry.kind !== 'note' || entry.isPublic) {
    return res.status(400).json({ error: 'NOT_RECOMMENDABLE' });
  }

  // 3. 既にあればそのまま返す (entry あたり最大1回の AI 呼び出し)。
  const existing = await findExisting(ctx, role, entryId);
  if (existing) {
    return res.status(200).json({ recommendation: existing.recommendation, status: existing.status });
  }

  // 4. Rate Limit (read 先行・加算は成功後)。
  const today = new Date().toISOString().slice(0, 10);
  let currentCount = 0;
  try {
    currentCount = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const result = await tx.execute<{ count: number }>(sql`
        SELECT count FROM api_rate_limits
        WHERE user_id = ${ctx.userId}::uuid
          AND endpoint = 'journal_recommend'
          AND date = ${today}::date
      `);
      return result.rows[0]?.count ?? 0;
    });
  } catch (err) {
    logger.error({ event: 'journal_recommend.rate_limit_error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  if (currentCount >= RATE_LIMIT_PER_DAY) {
    return res.status(429).json({
      error: 'RATE_LIMIT',
      message: '本日の利用上限に達しました。明日また使えるようになります。',
    });
  }

  // 5. ルール側で候補区分を絞る (説明可能)。
  const tags: RouterTag[] = entry.tags.map((t) => ({ name: t.name, category: t.category }));
  const candidateCategory = routeCategory(entry.content, tags);
  const masked = maskPii(entry.content); // 計算入力 + プロンプト改善用に残す (PII マスク済)

  // 6. AI 判定 (本番: Lambda / ローカル: inline mock)。本文は PII マスクして渡す。
  let result: RetroRecommendResult;
  let modelId = 'mock';
  if (LOCAL_MOCK) {
    result = mockRetroRecommend(candidateCategory, entry.content);
  } else {
    if (!LAMBDA_ARN) {
      logger.error({ event: 'journal_recommend.lambda_arn_missing' });
      return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }
    try {
      const response = await lambdaClient.send(
        new InvokeCommand({
          FunctionName: LAMBDA_ARN,
          InvocationType: 'RequestResponse',
          Payload: Buffer.from(
            JSON.stringify({
              type: 'retrospective_recommend',
              inputText: masked,
              candidateCategory,
              tags,
              mood: entry.mood ?? null,
            }),
          ),
        }),
      );
      if (!response.Payload) throw new Error('empty lambda payload');
      const raw = JSON.parse(Buffer.from(response.Payload).toString('utf-8'));
      const lambdaPayload = LambdaResponseSchema.parse(raw);
      if (!lambdaPayload.ok) {
        logger.warn({ event: 'journal_recommend.lambda_error', error: lambdaPayload.error });
        return res.status(503).json({ error: 'BEDROCK_ERROR' });
      }
      result = lambdaPayload.result;
      modelId = lambdaPayload.modelId ?? 'unknown';
    } catch (err) {
      logger.error({
        event: 'journal_recommend.lambda_invoke_failed',
        err_name: err instanceof Error ? err.name : 'unknown',
      });
      return res.status(503).json({ error: 'BEDROCK_ERROR' });
    }
  }

  // 7. 永続化 (entry 1:1・既存があれば race で勝った行を返す)。
  let savedStatus: 'proposed' | 'published' | 'dismissed' = 'proposed';
  try {
    savedStatus = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const inserted = await tx
        .insert(journalRecommendations)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          journalEntryId: entryId,
          aiOutputJson: result,
          status: 'proposed',
          inputMasked: masked,
          modelId,
          promptVersion: PROMPT_VERSION,
        })
        .onConflictDoNothing({ target: journalRecommendations.journalEntryId })
        .returning({ status: journalRecommendations.status });
      if (inserted[0]) return inserted[0].status;
      // 競合 (別リクエストが先に入れた) → 既存の状態を読む。
      const rows = await tx
        .select({ status: journalRecommendations.status })
        .from(journalRecommendations)
        .where(eq(journalRecommendations.journalEntryId, entryId))
        .limit(1);
      return rows[0]?.status ?? 'proposed';
    });
  } catch (err) {
    logger.error({ event: 'journal_recommend.persist_error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  // 8. 成功したので Rate Limit を加算 (best-effort)。
  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      await tx.execute(sql`
        INSERT INTO api_rate_limits (user_id, endpoint, date, count)
        VALUES (${ctx.userId}::uuid, 'journal_recommend', ${today}::date, 1)
        ON CONFLICT (user_id, endpoint, date)
        DO UPDATE SET count = api_rate_limits.count + 1, updated_at = NOW()
      `);
    });
  } catch (err) {
    logger.warn({ event: 'journal_recommend.rate_limit_increment_failed', err });
  }

  if (result.surface) {
    logEvent(LogEvents.RetroRecommendSurfaced, {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      primaryCategory: proposedCategoryOf(result),
      hasTweet: result.tweet !== null,
    });
  }

  return res.status(200).json({ recommendation: result, status: savedStatus });
}

// ── PATCH: 対応状態の更新 (出した / やめておく) ────────────
async function handlePatch(req: NextApiRequest, res: NextApiResponse, ctx: Ctx) {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: parsed.error.issues[0]?.message ?? '入力が不正です',
    });
  }
  const { entryId, status, finalCategory, bodyChanged } = parsed.data;
  const role = pickDbRole(ctx);

  // 計測用に AI 提案区分を読む (更新前)。
  const existing = await findExisting(ctx, role, entryId);
  const proposedForPersist = existing ? proposedCategoryOf(existing.recommendation) : 'none';
  const finalForPersist =
    status === 'published'
      ? (finalCategory ?? (proposedForPersist === 'none' ? 'tweet' : proposedForPersist))
      : null;

  let updated;
  try {
    updated = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      return tx
        .update(journalRecommendations)
        .set({
          status,
          updatedAt: new Date(),
          // 公開時のみ最終区分/本文編集を残す (集計・エクスポート用)。
          ...(status === 'published'
            ? { finalCategory: finalForPersist, bodyChanged: bodyChanged ?? false }
            : {}),
        })
        .where(
          and(
            eq(journalRecommendations.journalEntryId, entryId),
            eq(journalRecommendations.userId, ctx.userId),
          ),
        )
        .returning({ status: journalRecommendations.status });
    });
  } catch (err) {
    logger.error({ event: 'journal_recommend.status_update_error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  if (!updated[0]) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  // 計測 (§9・集計のみ)。
  const proposed = existing ? proposedCategoryOf(existing.recommendation) : 'none';
  if (status === 'published') {
    const final = finalCategory ?? (proposed === 'none' ? 'tweet' : proposed);
    logEvent(LogEvents.RetroRecommendConverted, {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      proposedCategory: proposed,
      finalCategory: final,
      categoryChanged: proposed !== final,
      bodyChanged: bodyChanged ?? false,
    });
  } else {
    logEvent(LogEvents.RetroRecommendDismissed, {
      userId: ctx.userId,
      tenantId: ctx.tenantId,
    });
  }

  return res.status(200).json({ status: updated[0].status });
}

// 既存リコメンド行を取得 (RLS で所有権担保)。
async function findExisting(
  ctx: Ctx,
  role: string,
  entryId: string,
): Promise<{ recommendation: RetroRecommendResult; status: 'proposed' | 'published' | 'dismissed' } | null> {
  const rows = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
    return tx
      .select({
        aiOutputJson: journalRecommendations.aiOutputJson,
        status: journalRecommendations.status,
      })
      .from(journalRecommendations)
      .where(eq(journalRecommendations.journalEntryId, entryId))
      .limit(1);
  });
  const row = rows[0];
  if (!row) return null;
  const parsed = retroRecommendResultSchema.safeParse(row.aiOutputJson);
  if (!parsed.success) return null;
  return { recommendation: parsed.data, status: row.status };
}
