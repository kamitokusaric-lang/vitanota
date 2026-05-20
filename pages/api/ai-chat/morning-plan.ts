// POST /api/ai-chat/morning-plan — H3「朝の見通し作り」のセッション操作。
//
// action:
//   - generate: 自分の未完了タスクを取得 → Lambda 呼び出し → ai_sessions / today_plan_items INSERT
//   - start:    「この内容で今日を始める」押下、startedAt / acceptedAt 追記
//   - edit:     編集モーダルで bucket 移動、today_plan_items UPDATE
//   - close:    AI 提案を見て閉じた (即閉じガードレール用)、closedAt 追記
//
// フラグ: ENABLE_AI_CHAT_EXTRACTION=false なら 404 (デプロイ後の段階リリース)。
// 集計対象は ai_sessions.ai_output_json + today_plan_items の 2 つで完結する。

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { and, eq, ne, sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import {
  aiSessions,
  tasks,
  taskAssignees,
  taskCategories,
  users,
  todayPlanItems,
} from '@/db/schema';
import { logger } from '@/shared/lib/logger';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { mockMorningPlan } from '@/features/ai-chat/morning-plan/localMock';

const LOCAL_MOCK =
  (process.env.AI_CHAT_LOCAL_MOCK ?? 'false').toLowerCase() === 'true';
const RATE_LIMIT_PER_DAY = Number(
  process.env.AI_CHAT_MORNING_PLAN_RATE_LIMIT_PER_DAY ?? '10',
);
const LAMBDA_ARN = process.env.AI_CHAT_LAMBDA_ARN ?? '';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-northeast-1';

const lambdaClient = new LambdaClient({ region: AWS_REGION });

const PROMPT_VERSION = 'today_plan_v1';

const CAPACITY = z.enum(['low', 'normal', 'high']);
const EDIT_TARGET = z.enum(['today', 'optional', 'excluded']);

const RequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('generate'),
    capacity: CAPACITY,
  }),
  z.object({
    action: z.literal('start'),
    sessionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('edit'),
    sessionId: z.string().uuid(),
    taskId: z.string().uuid(),
    // 'today' | 'optional' = bucket 移動、'excluded' = 今日プランから外す (row 残す)
    toBucket: EDIT_TARGET,
  }),
  z.object({
    // 手動追加: AI 提案外のタスクを今日プランに加える (ai_bucket=NULL, final_bucket=指定)
    action: z.literal('add'),
    sessionId: z.string().uuid(),
    taskId: z.string().uuid(),
    bucket: z.enum(['today', 'optional']),
  }),
  z.object({
    action: z.literal('close'),
    sessionId: z.string().uuid(),
  }),
]);

const PlanItemSchema = z
  .object({
    task_id: z.string(),
    reason: z.string(),
    suggested_action: z.string(),
    confidence: z.number(),
  })
  .strict();

const LambdaMorningPlanResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    type: z.literal('morning_plan'),
    modelId: z.string().optional(),
    result: z.object({
      summary: z.string(),
      today: z.array(PlanItemSchema),
      optional: z.array(PlanItemSchema),
      not_shown_task_ids: z.array(z.string()),
      notes: z.array(z.string()),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    message: z.string(),
  }),
]);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
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

  const body = parsed.data;
  const role = pickDbRole(ctx);

  if (body.action === 'generate') {
    return handleGenerate(req, res, ctx, role, body.capacity);
  }
  if (body.action === 'start') {
    return handleStart(res, ctx, role, body.sessionId);
  }
  if (body.action === 'edit') {
    return handleEdit(res, ctx, role, body.sessionId, body.taskId, body.toBucket);
  }
  if (body.action === 'add') {
    return handleAdd(res, ctx, role, body.sessionId, body.taskId, body.bucket);
  }
  if (body.action === 'close') {
    return handleClose(res, ctx, role, body.sessionId);
  }
  return res.status(400).json({ error: 'VALIDATION_ERROR' });
}

type Ctx = NonNullable<Awaited<ReturnType<typeof requireAuth>>>;
type Role = ReturnType<typeof pickDbRole>;

async function handleGenerate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: Ctx,
  role: Role,
  capacity: 'low' | 'normal' | 'high',
) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  // 1. Rate Limit
  let currentCount = 0;
  try {
    currentCount = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const result = await tx.execute<{ count: number }>(sql`
        INSERT INTO api_rate_limits (user_id, endpoint, date, count)
        VALUES (${ctx.userId}::uuid, 'ai_chat_morning_plan', ${today}::date, 1)
        ON CONFLICT (user_id, endpoint, date)
        DO UPDATE SET count = api_rate_limits.count + 1, updated_at = NOW()
        RETURNING count
      `);
      return result.rows[0]?.count ?? 0;
    });
  } catch (err) {
    logger.error({ event: 'ai_chat.morning_plan.rate_limit_error', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  if (currentCount > RATE_LIMIT_PER_DAY) {
    logger.info({
      event: 'ai_chat.morning_plan.rate_limit_hit',
      user_id: ctx.userId,
      count: currentCount,
    });
    return res.status(429).json({
      error: 'RATE_LIMIT',
      message: '本日の整理は上限に達しました。明日また使えるようになります。',
    });
  }

  // 2. 自分が assignee の未完了タスクを取得 (assignees / category 含む)
  let myTasks: Array<{
    id: string;
    title: string;
    description: string | null;
    dueDate: string | null;
    status: string;
    categoryName: string | null;
    assigneeIds: string[];
    assigneeNames: string[];
  }> = [];
  let currentUserName = '先生';
  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      // 自分のタスクの基本情報 + カテゴリ名
      const taskRows = await tx
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          dueDate: tasks.dueDate,
          status: tasks.status,
          categoryName: taskCategories.name,
        })
        .from(tasks)
        .innerJoin(
          taskAssignees,
          and(
            eq(taskAssignees.taskId, tasks.id),
            eq(taskAssignees.tenantId, tasks.tenantId),
          ),
        )
        .leftJoin(taskCategories, eq(taskCategories.id, tasks.categoryId))
        .where(
          and(
            eq(taskAssignees.userId, ctx.userId),
            eq(tasks.tenantId, ctx.tenantId),
            ne(tasks.status, 'done'),
          ),
        )
        .limit(100);

      // 各タスクの全 assignees を取得
      const taskIds = taskRows.map((t) => t.id);
      const assigneeRows = taskIds.length
        ? await tx
            .select({
              taskId: taskAssignees.taskId,
              userId: taskAssignees.userId,
              name: users.name,
            })
            .from(taskAssignees)
            .innerJoin(users, eq(users.id, taskAssignees.userId))
            .where(eq(taskAssignees.tenantId, ctx.tenantId))
        : [];

      const assigneeMap = new Map<string, { ids: string[]; names: string[] }>();
      for (const row of assigneeRows) {
        if (!taskIds.includes(row.taskId)) continue;
        const cur = assigneeMap.get(row.taskId) ?? { ids: [], names: [] };
        cur.ids.push(row.userId);
        cur.names.push(row.name ?? 'unknown');
        assigneeMap.set(row.taskId, cur);
      }

      // current user name
      const me = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      currentUserName = me[0]?.name ?? '先生';

      myTasks = taskRows.map((t) => {
        const a = assigneeMap.get(t.id) ?? { ids: [], names: [] };
        return {
          id: t.id,
          title: t.title,
          description: t.description ?? '',
          dueDate: t.dueDate
            ? typeof t.dueDate === 'string'
              ? t.dueDate
              : (t.dueDate as Date).toISOString().slice(0, 10)
            : null,
          status: t.status,
          categoryName: t.categoryName,
          assigneeIds: a.ids,
          assigneeNames: a.names,
        };
      });
    });
  } catch (err) {
    logger.error({ event: 'ai_chat.morning_plan.tasks_fetch_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  if (myTasks.length === 0) {
    return res.status(200).json({
      sessionId: null,
      plan: { summary: '今日のタスクは見当たりません', today: [], optional: [], notes: [] },
      empty: true,
    });
  }

  // 3. ai_sessions に INSERT (生成前段階)
  let sessionId: string;
  try {
    sessionId = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const [row] = await tx
        .insert(aiSessions)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          type: 'morning_plan',
          inputText: `morning_plan capacity=${capacity}`,
          aiOutputJson: {
            promptVersion: PROMPT_VERSION,
            capacity,
            clickedAt: now.toISOString(),
            capacitySelectedAt: now.toISOString(),
            inputTaskCount: myTasks.length,
          },
          status: 'draft',
        })
        .returning({ id: aiSessions.id });
      return row.id;
    });
  } catch (err) {
    logger.error({ event: 'ai_chat.morning_plan.session_insert_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  // 4. Lambda invoke (or local mock)
  const lambdaEvent = {
    type: 'morning_plan' as const,
    today,
    currentUser: { id: ctx.userId, name: currentUserName },
    capacity,
    tasks: myTasks.map((t) => ({
      id: t.id,
      title: t.title,
      assignees: t.assigneeIds.map((id, i) => ({
        id,
        name: t.assigneeNames[i] ?? 'unknown',
      })),
      category: t.categoryName,
      tags: [],
      due_date: t.dueDate,
      description: t.description,
      comments: [],
      status: t.status,
    })),
  };

  let plan: z.infer<typeof LambdaMorningPlanResponseSchema>;
  if (LOCAL_MOCK) {
    const mocked = mockMorningPlan(
      capacity,
      today,
      myTasks.map((t) => ({
        id: t.id,
        title: t.title,
        due_date: t.dueDate,
        status: t.status,
        description: t.description ?? '',
      })),
    );
    plan = { ok: true, type: 'morning_plan', modelId: 'local-mock', result: mocked };
    logger.info({ event: 'ai_chat.morning_plan.local_mock_used' });
  } else if (!LAMBDA_ARN) {
    logger.error({ event: 'ai_chat.morning_plan.lambda_arn_missing' });
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  } else {
  try {
    const response = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: LAMBDA_ARN,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(lambdaEvent)),
      }),
    );
    if (!response.Payload) throw new Error('empty lambda payload');
    const raw = JSON.parse(Buffer.from(response.Payload).toString('utf-8'));
    plan = LambdaMorningPlanResponseSchema.parse(raw);
  } catch (err) {
    logger.error({
      event: 'ai_chat.morning_plan.lambda_invoke_failed',
      err_name: err instanceof Error ? err.name : 'unknown',
    });
    // generationFailedAt 記録 (集計用)
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const rows = await tx
        .select({ aiOutputJson: aiSessions.aiOutputJson })
        .from(aiSessions)
        .where(eq(aiSessions.id, sessionId));
      const existing = (rows[0]?.aiOutputJson ?? {}) as Record<string, unknown>;
      await tx
        .update(aiSessions)
        .set({
          aiOutputJson: {
            ...existing,
            generationFailedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(aiSessions.id, sessionId));
    }).catch(() => undefined);
    return res.status(503).json({
      error: 'BEDROCK_ERROR',
      message: 'AI 整理に失敗しました。しばらく待ってからもう一度お試しください。',
    });
  }
  }

  if (!plan.ok) {
    logger.warn({ event: 'ai_chat.morning_plan.lambda_error', error: plan.error });
    return res.status(503).json({
      error: 'BEDROCK_ERROR',
      message: 'AI 整理に失敗しました。しばらく待ってからもう一度お試しください。',
    });
  }

  const planResult = plan.result;
  const planModelId = plan.modelId ?? 'unknown';

  // 5. ai_output_json に plan + generatedAt、today_plan_items を bulk INSERT
  // tasks_json に存在しない task_id を AI が返した場合は除外 (safety net)
  const validTaskIds = new Set(myTasks.map((t) => t.id));
  const validTodayItems = planResult.today.filter((i) => validTaskIds.has(i.task_id));
  const validOptionalItems = planResult.optional.filter((i) =>
    validTaskIds.has(i.task_id),
  );

  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const rows = await tx
        .select({ aiOutputJson: aiSessions.aiOutputJson })
        .from(aiSessions)
        .where(eq(aiSessions.id, sessionId));
      const existing = (rows[0]?.aiOutputJson ?? {}) as Record<string, unknown>;
      await tx
        .update(aiSessions)
        .set({
          aiOutputJson: {
            ...existing,
            plan: {
              summary: planResult.summary,
              today: validTodayItems,
              optional: validOptionalItems,
              not_shown_task_ids: planResult.not_shown_task_ids,
              notes: planResult.notes,
            },
            modelId: planModelId,
            generatedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(aiSessions.id, sessionId));

      const allItems = [
        ...validTodayItems.map((i) => ({ taskId: i.task_id, aiBucket: 'today' as const })),
        ...validOptionalItems.map((i) => ({
          taskId: i.task_id,
          aiBucket: 'optional' as const,
        })),
      ];
      if (allItems.length > 0) {
        await tx.insert(todayPlanItems).values(
          allItems.map((i) => ({
            sessionId,
            taskId: i.taskId,
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            aiBucket: i.aiBucket,
          })),
        );
      }
    });
  } catch (err) {
    logger.error({ event: 'ai_chat.morning_plan.plan_save_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  logger.info({
    event: 'ai_chat.morning_plan.generated',
    session_id: sessionId,
    capacity,
    input_task_count: myTasks.length,
    today_count: validTodayItems.length,
    optional_count: validOptionalItems.length,
  });

  // task_id ごとに title を join して返す (フロント表示用)
  const taskById = new Map(myTasks.map((t) => [t.id, t]));
  const planTaskIds = new Set([
    ...validTodayItems.map((i) => i.task_id),
    ...validOptionalItems.map((i) => i.task_id),
  ]);
  // 「別のタスクを追加する」候補: AI 提案に含まれなかった自分の未完了タスク
  const notShown = myTasks
    .filter((t) => !planTaskIds.has(t.id))
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      dueDate: t.dueDate,
      categoryName: t.categoryName,
    }));
  const enrichItem = (i: { task_id: string; reason: string; suggested_action: string; confidence: number }) => {
    const t = taskById.get(i.task_id);
    return {
      ...i,
      title: t?.title ?? '',
      dueDate: t?.dueDate ?? null,
      categoryName: t?.categoryName ?? null,
      description: t?.description ?? '',
      status: t?.status ?? '',
      assigneeNames: t?.assigneeNames ?? [],
    };
  };
  return res.status(200).json({
    sessionId,
    plan: {
      summary: planResult.summary,
      today: validTodayItems.map(enrichItem),
      optional: validOptionalItems.map(enrichItem),
      notShown,
      notes: planResult.notes,
    },
  });
}

async function handleStart(
  res: NextApiResponse,
  ctx: Ctx,
  role: Role,
  sessionId: string,
) {
  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const rows = await tx
        .select({ aiOutputJson: aiSessions.aiOutputJson })
        .from(aiSessions)
        .where(
          and(eq(aiSessions.id, sessionId), eq(aiSessions.userId, ctx.userId)),
        );
      if (rows.length === 0) throw new Error('SESSION_NOT_FOUND');
      const existing = (rows[0].aiOutputJson ?? {}) as Record<string, unknown>;
      const nowIso = new Date().toISOString();
      await tx
        .update(aiSessions)
        .set({
          aiOutputJson: {
            ...existing,
            acceptedAt: nowIso,
            startedAt: nowIso,
          },
          status: 'confirmed',
          updatedAt: new Date(),
        })
        .where(eq(aiSessions.id, sessionId));
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    logger.error({ event: 'ai_chat.morning_plan.start_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  logger.info({ event: 'ai_chat.morning_plan.started', session_id: sessionId });
  return res.status(200).json({ ok: true });
}

async function handleEdit(
  res: NextApiResponse,
  ctx: Ctx,
  role: Role,
  sessionId: string,
  taskId: string,
  toBucket: 'today' | 'optional' | 'excluded',
) {
  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      // editStartedAt + 「除外」操作の場合 excludedTaskIds 配列を追記
      const sessionRows = await tx
        .select({ aiOutputJson: aiSessions.aiOutputJson })
        .from(aiSessions)
        .where(
          and(eq(aiSessions.id, sessionId), eq(aiSessions.userId, ctx.userId)),
        );
      if (sessionRows.length === 0) throw new Error('SESSION_NOT_FOUND');
      const existing = (sessionRows[0].aiOutputJson ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = { ...existing };
      if (!existing.editStartedAt) {
        patch.editStartedAt = new Date().toISOString();
      }
      if (toBucket === 'excluded') {
        // 「今日やらない」: 集計のため excludedTaskIds に追記してから row 削除
        const prev = Array.isArray(existing.excludedTaskIds)
          ? (existing.excludedTaskIds as string[])
          : [];
        if (!prev.includes(taskId)) {
          patch.excludedTaskIds = [...prev, taskId];
        }
      }
      await tx
        .update(aiSessions)
        .set({ aiOutputJson: patch, updatedAt: new Date() })
        .where(eq(aiSessions.id, sessionId));

      // 'excluded' を含めて final_bucket / last_moved_to を UPDATE で記録 (row は残す)
      await tx.execute(sql`
        UPDATE today_plan_items
        SET final_bucket = ${toBucket},
            last_moved_to = ${toBucket},
            moved_count = moved_count + 1,
            updated_at = NOW()
        WHERE session_id = ${sessionId}::uuid
          AND task_id = ${taskId}::uuid
          AND user_id = ${ctx.userId}::uuid
      `);
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    logger.error({ event: 'ai_chat.morning_plan.edit_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  return res.status(200).json({ ok: true });
}

async function handleAdd(
  res: NextApiResponse,
  ctx: Ctx,
  role: Role,
  sessionId: string,
  taskId: string,
  bucket: 'today' | 'optional',
) {
  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      // session 所有確認
      const sessionRows = await tx
        .select({ aiOutputJson: aiSessions.aiOutputJson })
        .from(aiSessions)
        .where(
          and(eq(aiSessions.id, sessionId), eq(aiSessions.userId, ctx.userId)),
        );
      if (sessionRows.length === 0) throw new Error('SESSION_NOT_FOUND');

      // tasks の所有確認 (自分が assignee の未完了タスク)
      const taskRows = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .innerJoin(
          taskAssignees,
          and(
            eq(taskAssignees.taskId, tasks.id),
            eq(taskAssignees.tenantId, tasks.tenantId),
          ),
        )
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, ctx.tenantId),
            eq(taskAssignees.userId, ctx.userId),
          ),
        )
        .limit(1);
      if (taskRows.length === 0) throw new Error('TASK_NOT_FOUND');

      // editStartedAt 初回のみ追記
      const existing = (sessionRows[0].aiOutputJson ?? {}) as Record<string, unknown>;
      if (!existing.editStartedAt) {
        await tx
          .update(aiSessions)
          .set({
            aiOutputJson: {
              ...existing,
              editStartedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(aiSessions.id, sessionId));
      }

      // INSERT (ai_bucket=NULL = 教員手動追加、final_bucket=bucket)
      // 既存の row が excluded だった場合 (= 一度外して再追加) は UPSERT で復活させる
      await tx.execute(sql`
        INSERT INTO today_plan_items
          (session_id, task_id, tenant_id, user_id, ai_bucket, final_bucket, last_moved_to, moved_count)
        VALUES
          (${sessionId}::uuid, ${taskId}::uuid, ${ctx.tenantId}::uuid, ${ctx.userId}::uuid, NULL, ${bucket}, ${bucket}, 0)
        ON CONFLICT (session_id, task_id)
        DO UPDATE SET
          final_bucket = ${bucket},
          last_moved_to = ${bucket},
          moved_count = today_plan_items.moved_count + 1,
          updated_at = NOW()
      `);
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    if (err instanceof Error && err.message === 'TASK_NOT_FOUND') {
      return res.status(404).json({ error: 'TASK_NOT_FOUND' });
    }
    logger.error({ event: 'ai_chat.morning_plan.add_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  logger.info({
    event: 'ai_chat.morning_plan.added',
    session_id: sessionId,
    task_id: taskId,
    bucket,
  });
  return res.status(200).json({ ok: true });
}

async function handleClose(
  res: NextApiResponse,
  ctx: Ctx,
  role: Role,
  sessionId: string,
) {
  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const rows = await tx
        .select({ aiOutputJson: aiSessions.aiOutputJson })
        .from(aiSessions)
        .where(
          and(eq(aiSessions.id, sessionId), eq(aiSessions.userId, ctx.userId)),
        );
      if (rows.length === 0) throw new Error('SESSION_NOT_FOUND');
      const existing = (rows[0].aiOutputJson ?? {}) as Record<string, unknown>;
      // 既に閉じてれば何もしない (idempotent)
      if (existing.closedAt) return;
      await tx
        .update(aiSessions)
        .set({
          aiOutputJson: {
            ...existing,
            closedAt: new Date().toISOString(),
          },
          status: 'discarded',
          updatedAt: new Date(),
        })
        .where(eq(aiSessions.id, sessionId));
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    logger.error({ event: 'ai_chat.morning_plan.close_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  return res.status(200).json({ ok: true });
}
