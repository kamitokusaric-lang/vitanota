// GET /api/ai-chat/today-plan — 今日の「朝の見通し」(morning_plan) を取得。
//
// 自分の (今日の JST 範囲で) startedAt が立った最新 morning_plan セッションを返す。
// 紐づく today_plan_items × tasks JOIN で表示用データを組み立てる。
// セッションがなければ sessionId=null を返す (ダッシュボードはカード表示に戻る)。

import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from 'drizzle-orm';
import { requireAuth, pickDbRole } from '@/features/journal/lib/apiHelpers';
import { withTenantUser } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
import { isAiChatEnabledForTenant } from '@/features/ai-chat/featureFlag';

interface PlanItemView {
  taskId: string;
  title: string;
  dueDate: string | null;
  categoryName: string | null;
  description: string;
  status: string;
  assigneeNames: string[];
  reason: string;
  suggestedAction: string;
  bucket: 'today' | 'optional';
  doneAt: string | null;
}

interface DoneItemView {
  taskId: string;
  title: string;
  doneAt: string;
  bucket: 'today' | 'optional';
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const ctx = await requireAuth(req, res);
  if (!ctx) return;

  if (!isAiChatEnabledForTenant(ctx.tenantId)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  const role = pickDbRole(ctx);

  try {
    const result = await withTenantUser(ctx.tenantId, ctx.userId, role, async (tx) => {
      // 自分が assignee の未完了タスク件数 (カード表示用)
      const countResult = await tx.execute<{ count: number }>(sql`
        SELECT COUNT(*)::int AS count
        FROM tasks t
        INNER JOIN task_assignees ta
          ON ta.task_id = t.id AND ta.tenant_id = t.tenant_id
        WHERE ta.user_id = ${ctx.userId}::uuid
          AND t.tenant_id = ${ctx.tenantId}::uuid
          AND t.status <> 'done'
      `);
      const incompleteAssigneeTaskCount = countResult.rows[0]?.count ?? 0;

      // 過去に morning_plan を一度でも開始 (startedAt 立った) ことがあるか
      const everResult = await tx.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM ai_sessions
          WHERE user_id = ${ctx.userId}::uuid
            AND type = 'morning_plan'
            AND ai_output_json->>'startedAt' IS NOT NULL
        ) AS exists
      `);
      const hasEverUsedMorningPlan = everResult.rows[0]?.exists ?? false;

      // 当日 (JST) かつ startedAt 立ち済の最新 morning_plan セッション
      const sessionRows = await tx.execute<{
        id: string;
        ai_output_json: Record<string, unknown>;
      }>(sql`
        SELECT id, ai_output_json
        FROM ai_sessions
        WHERE user_id = ${ctx.userId}::uuid
          AND type = 'morning_plan'
          AND ai_output_json->>'startedAt' IS NOT NULL
          AND created_at >= (NOW() AT TIME ZONE 'Asia/Tokyo')::date AT TIME ZONE 'Asia/Tokyo'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (sessionRows.rows.length === 0) {
        return {
          sessionId: null,
          plan: null,
          incompleteAssigneeTaskCount,
          hasEverUsedMorningPlan,
        };
      }

      const row = sessionRows.rows[0];
      const json = (row.ai_output_json ?? {}) as Record<string, unknown>;
      const planFromJson = (json.plan ?? {}) as {
        summary?: string;
        today?: Array<{ task_id: string; reason: string; suggested_action: string }>;
        optional?: Array<{ task_id: string; reason: string; suggested_action: string }>;
        notes?: string[];
      };

      // task_id ごとに reason / suggested_action を引ける map
      const itemMeta = new Map<
        string,
        { reason: string; suggestedAction: string; aiBucket: 'today' | 'optional' }
      >();
      for (const i of planFromJson.today ?? []) {
        itemMeta.set(i.task_id, {
          reason: i.reason,
          suggestedAction: i.suggested_action,
          aiBucket: 'today',
        });
      }
      for (const i of planFromJson.optional ?? []) {
        itemMeta.set(i.task_id, {
          reason: i.reason,
          suggestedAction: i.suggested_action,
          aiBucket: 'optional',
        });
      }

      // today_plan_items × tasks JOIN (description / status + 担当者一覧も取得)
      const itemRows = await tx.execute<{
        task_id: string;
        title: string;
        description: string | null;
        status: string;
        due_date: string | null;
        category_name: string | null;
        ai_bucket: 'today' | 'optional' | null;
        final_bucket: 'today' | 'optional' | 'excluded' | null;
        done_at: string | null;
        assignee_names: string[] | null;
      }>(sql`
        SELECT
          tpi.task_id,
          t.title,
          t.description,
          t.status,
          t.due_date,
          c.name AS category_name,
          tpi.ai_bucket,
          tpi.final_bucket,
          tpi.done_at,
          (
            SELECT array_agg(u.name)
            FROM task_assignees ta
            INNER JOIN users u ON u.id = ta.user_id
            WHERE ta.task_id = tpi.task_id
          ) AS assignee_names
        FROM today_plan_items tpi
        INNER JOIN tasks t ON t.id = tpi.task_id
        LEFT JOIN task_categories c ON c.id = t.category_id
        WHERE tpi.session_id = ${row.id}::uuid
          AND tpi.user_id = ${ctx.userId}::uuid
        ORDER BY tpi.created_at
      `);

      const todayList: PlanItemView[] = [];
      const optionalList: PlanItemView[] = [];
      const doneItems: DoneItemView[] = [];

      for (const r of itemRows.rows) {
        // 教員が「今日やらない」と外した row は表示しない (集計用に row は残してる)
        if (r.final_bucket === 'excluded') continue;

        const meta = itemMeta.get(r.task_id);
        // 教員が手動追加 (ai_bucket=NULL) で final_bucket が立ってないケースは
        // 想定上ないが念のため fallback。
        const currentBucket = (r.final_bucket ?? r.ai_bucket ?? 'today') as 'today' | 'optional';

        if (r.done_at) {
          doneItems.push({
            taskId: r.task_id,
            title: r.title,
            doneAt: r.done_at,
            bucket: currentBucket,
          });
          continue;
        }

        const view: PlanItemView = {
          taskId: r.task_id,
          title: r.title,
          dueDate: r.due_date,
          categoryName: r.category_name,
          description: r.description ?? '',
          status: r.status,
          assigneeNames: r.assignee_names ?? [],
          reason: meta?.reason ?? '',
          suggestedAction: meta?.suggestedAction ?? '',
          bucket: currentBucket,
          doneAt: null,
        };
        if (currentBucket === 'today') {
          todayList.push(view);
        } else {
          optionalList.push(view);
        }
      }

      // 完了は古い順 (1 日の流れに沿って積み上がる)
      doneItems.sort((a, b) => a.doneAt.localeCompare(b.doneAt));

      return {
        sessionId: row.id,
        plan: {
          summary: planFromJson.summary ?? '',
          today: todayList,
          optional: optionalList,
          doneItems,
          notes: planFromJson.notes ?? [],
          feedbackSubmitted: Boolean(json.feedback),
        },
        incompleteAssigneeTaskCount,
        hasEverUsedMorningPlan,
      };
    });

    return res.status(200).json(result);
  } catch (err) {
    logger.error({ event: 'ai_chat.today_plan.get_failed', err });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
