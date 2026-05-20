// POST /api/ai-chat/confirm — AI セッションを確定 (採用タスクを一括 INSERT) or 破棄。
//
// 入力: { sessionId, action: 'confirm' | 'discard', selectedTasks?, inputSnippet? }
// confirm 時: 採用タスク数の分だけ tasks INSERT (本人 assignee 込み)、ai_sessions.status='confirmed'。
//             AI 提案 category と教員選択 category の差分を ai_output_json.userConfirmed に保存し、
//             カテゴリ修正率の改善指標とする (chimo 2026-05-13 指示)。
// discard 時: ai_sessions.status='discarded' に更新するだけ。

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import {
  aiSessions,
  taskCategories,
  tasks,
  taskAssignees,
  taskTagAssignments,
  taskTags,
} from '@/db/schema';
import {
  resolveParentName,
  type ParentCategoryName,
} from '@/features/ai-chat/categoryDefinitions';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';
import { logger } from '@/shared/lib/logger';

const PARENT_NAME_VALUES = [
  '学び',
  '育み',
  '安心',
  '1学年',
  '2学年',
  '3学年',
  '特別支援学級',
  '校務',
] as const;

const ConfirmTaskInputSchema = z.object({
  title: z.string().min(1).max(200),
  aiSuggestedTitle: z.string().max(200).nullable().default(null),
  aiSuggestedCategoryId: z.string().nullable(),
  aiSuggestedDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  userSelectedParentName: z.enum(PARENT_NAME_VALUES),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  memo: z.string().max(500).default(''),
  tagIds: z.array(z.string().uuid()).max(20).default([]),
  assigneeUserIds: z.array(z.string().uuid()).min(1).max(10),
});

// カテゴリ名の全角/半角差を吸収する (DB に「１学年」全角、UI 側「1学年」半角の運用差を許容)。
// 数字以外 (漢字・かな) はそのまま、桁数字のみ全角→半角に寄せる。
function normalizeCategoryName(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
}

const DISCARD_REASONS = [
  'wrong_candidate',
  'too_detailed',
  'too_rough',
  'not_a_task',
  'inconvenient',
  'privacy_concern',
  'other',
] as const;

const RequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('confirm'),
    sessionId: z.string().uuid(),
    selectedTasks: z.array(ConfirmTaskInputSchema).min(0).max(20),
    inputSnippet: z.string().max(2000).default(''),
  }),
  z.object({
    action: z.literal('discard'),
    sessionId: z.string().uuid(),
    discardReason: z.enum(DISCARD_REASONS).optional(),
    discardReasonText: z.string().max(500).optional(),
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
  const body = parsed.data;

  // 破棄
  if (body.action === 'discard') {
    try {
      await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
        const rows = await tx
          .select()
          .from(aiSessions)
          .where(
            and(eq(aiSessions.id, body.sessionId), eq(aiSessions.userId, ctx.userId)),
          );
        const existingOutput = (rows[0]?.aiOutputJson ?? {}) as Record<string, unknown>;
        await tx
          .update(aiSessions)
          .set({
            status: 'discarded',
            aiOutputJson: {
              ...existingOutput,
              discardReason: body.discardReason ?? null,
              discardReasonText: body.discardReasonText ?? null,
              discardedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(aiSessions.id, body.sessionId));
      });
    } catch (err) {
      logger.error({ event: 'ai_chat.discard_failed', err });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
    logger.info({
      event: 'ai_chat.discarded',
      session_id: body.sessionId,
      discard_reason: body.discardReason ?? null,
    });
    return res.status(200).json({ ok: true, createdCount: 0 });
  }

  // 確定: テナント内 task_categories の name -> id を解決し、tasks 一括 INSERT
  let createdCount = 0;
  let skippedCount = 0;
  try {
    await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      const session = await tx
        .select()
        .from(aiSessions)
        .where(
          and(eq(aiSessions.id, body.sessionId), eq(aiSessions.userId, ctx.userId)),
        );
      if (session.length === 0) {
        throw new Error('SESSION_NOT_FOUND');
      }

      const categories = await tx
        .select({ id: taskCategories.id, name: taskCategories.name })
        .from(taskCategories)
        .where(eq(taskCategories.tenantId, ctx.tenantId));
      // 全角/半角差吸収のため normalize 後の name をキーに
      const nameToId = new Map(
        categories.map((c) => [normalizeCategoryName(c.name), c.id]),
      );

      // 各タスクが要求してる tagId の和集合を取得して所有確認 (RLS で弾けるが事前検証で early reject)
      const requestedTagIds = Array.from(
        new Set(body.selectedTasks.flatMap((t) => t.tagIds)),
      );
      let ownedTagIdSet = new Set<string>();
      if (requestedTagIds.length > 0) {
        const ownedTags = await tx
          .select({ id: taskTags.id })
          .from(taskTags)
          .where(eq(taskTags.tenantId, ctx.tenantId));
        ownedTagIdSet = new Set(ownedTags.map((t) => t.id));
      }

      const userConfirmedLog: Array<{
        title: string;
        aiSuggestedTitle: string | null;
        titleChanged: boolean;
        aiSuggestedCategoryId: string | null;
        aiSuggestedParentName: ParentCategoryName | null;
        userSelectedParentName: string;
        categoryChanged: boolean;
        dueDate: string | null;
        aiSuggestedDueDate: string | null;
        dueDateChanged: boolean;
        taskCreated: boolean;
      }> = [];

      for (const t of body.selectedTasks) {
        const categoryId = nameToId.get(normalizeCategoryName(t.userSelectedParentName));
        const aiSuggestedParent = resolveParentName(t.aiSuggestedCategoryId);
        const categoryChanged =
          aiSuggestedParent === null ||
          aiSuggestedParent !== t.userSelectedParentName;
        const titleChanged =
          t.aiSuggestedTitle !== null && t.aiSuggestedTitle.trim() !== t.title.trim();
        const dueDateChanged = (t.aiSuggestedDueDate ?? null) !== (t.dueDate ?? null);

        if (!categoryId) {
          skippedCount++;
          userConfirmedLog.push({
            title: t.title,
            aiSuggestedTitle: t.aiSuggestedTitle,
            titleChanged,
            aiSuggestedCategoryId: t.aiSuggestedCategoryId,
            aiSuggestedParentName: aiSuggestedParent,
            userSelectedParentName: t.userSelectedParentName,
            categoryChanged,
            dueDate: t.dueDate,
            aiSuggestedDueDate: t.aiSuggestedDueDate,
            dueDateChanged,
            taskCreated: false,
          });
          continue;
        }

        const [task] = await tx
          .insert(tasks)
          .values({
            tenantId: ctx.tenantId,
            categoryId,
            createdBy: ctx.userId,
            title: t.title,
            description: t.memo || null,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            sourceChatSnippet: body.inputSnippet || null,
            // chimo 2026-05-20: 新規作成は backlog (未着手) で起こす。 taskRepository.create と整合。
            status: 'backlog',
          })
          .returning({ id: tasks.id });

        // 担当者を ON CONFLICT で複数 INSERT (重複は無視)。RLS で他テナント user は弾かれる。
        const uniqueAssignees = Array.from(new Set(t.assigneeUserIds));
        await tx
          .insert(taskAssignees)
          .values(
            uniqueAssignees.map((uid) => ({
              taskId: task.id,
              userId: uid,
              tenantId: ctx.tenantId,
            })),
          )
          .onConflictDoNothing();

        const validTagIdsForTask = t.tagIds.filter((id) => ownedTagIdSet.has(id));
        if (validTagIdsForTask.length > 0) {
          await tx.insert(taskTagAssignments).values(
            validTagIdsForTask.map((tagId) => ({
              taskId: task.id,
              tagId,
              tenantId: ctx.tenantId,
            })),
          );
        }

        createdCount++;
        userConfirmedLog.push({
          title: t.title,
          aiSuggestedTitle: t.aiSuggestedTitle,
          titleChanged,
          aiSuggestedCategoryId: t.aiSuggestedCategoryId,
          aiSuggestedParentName: aiSuggestedParent,
          userSelectedParentName: t.userSelectedParentName,
          categoryChanged,
          dueDate: t.dueDate,
          aiSuggestedDueDate: t.aiSuggestedDueDate,
          dueDateChanged,
          taskCreated: true,
        });
      }

      const existingOutput = (session[0].aiOutputJson ?? {}) as Record<string, unknown>;
      await tx
        .update(aiSessions)
        .set({
          status: 'confirmed',
          aiOutputJson: {
            ...existingOutput,
            userConfirmed: userConfirmedLog,
            confirmedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(aiSessions.id, body.sessionId));
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    logger.error({ event: 'ai_chat.confirm_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }

  // hasEdits = title / category / dueDate のいずれかが教員によって AI 提案から変更された候補が 1 件でもあるか
  const hasEdits = body.selectedTasks.some((t) => {
    const aiParent = resolveParentName(t.aiSuggestedCategoryId);
    const categoryChanged = aiParent === null || aiParent !== t.userSelectedParentName;
    const titleChanged =
      t.aiSuggestedTitle !== null && t.aiSuggestedTitle.trim() !== t.title.trim();
    const dueDateChanged = (t.aiSuggestedDueDate ?? null) !== (t.dueDate ?? null);
    return categoryChanged || titleChanged || dueDateChanged;
  });

  logger.info({
    event: 'ai_chat.confirmed',
    session_id: body.sessionId,
    selected_count: body.selectedTasks.length,
    created_count: createdCount,
    skipped_count: skippedCount,
    has_edits: hasEdits,
  });

  return res.status(201).json({ ok: true, createdCount, skippedCount, hasEdits });
}
