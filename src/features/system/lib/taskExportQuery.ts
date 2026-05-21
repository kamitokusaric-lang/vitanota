// system_admin 用 task エクスポートの SQL を切り出した薄いクエリレイヤ。
//
// chimo 確認済: task には本人限定の可視ステータスは存在しないので全 scope を出す。
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/db/schema';

type Tx = NodePgDatabase<typeof schema>;

export interface TaskExportRow {
  id: string;
  title: string;
  status: string;
  category_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by: string;
  assignees: string | null;
  description: string | null;
  source_chat_snippet: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskExportArgs {
  tenantId: string;
  /** YYYY-MM-DD (JST) */
  from: string;
  /** YYYY-MM-DD (JST, 包含) */
  to: string;
}

export async function selectTaskExportRows(
  tx: Tx,
  args: TaskExportArgs,
): Promise<TaskExportRow[]> {
  const { tenantId, from, to } = args;
  const result = await tx.execute(sql`
    SELECT
      t.id::text                                              AS id,
      t.title                                                 AS title,
      t.status::text                                          AS status,
      tc.name                                                 AS category_name,
      t.due_date::text                                        AS due_date,
      CASE WHEN t.completed_at IS NULL THEN NULL
           ELSE to_char(t.completed_at AT TIME ZONE 'Asia/Tokyo',
                        'YYYY-MM-DD"T"HH24:MI:SS')
      END                                                     AS completed_at,
      t.created_by::text                                      AS created_by,
      asg.assignees                                           AS assignees,
      t.description                                           AS description,
      t.source_chat_snippet                                   AS source_chat_snippet,
      to_char(t.created_at AT TIME ZONE 'Asia/Tokyo',
              'YYYY-MM-DD"T"HH24:MI:SS')                      AS created_at,
      to_char(t.updated_at AT TIME ZONE 'Asia/Tokyo',
              'YYYY-MM-DD"T"HH24:MI:SS')                      AS updated_at
    FROM tasks t
    LEFT JOIN task_categories tc ON tc.id = t.category_id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(ta.user_id::text, ';' ORDER BY ta.user_id::text) AS assignees
      FROM task_assignees ta
      WHERE ta.task_id = t.id AND ta.tenant_id = ${tenantId}::uuid
    ) asg ON true
    WHERE t.tenant_id = ${tenantId}::uuid
      AND (t.created_at AT TIME ZONE 'Asia/Tokyo')::date >= ${from}::date
      AND (t.created_at AT TIME ZONE 'Asia/Tokyo')::date <= ${to}::date
    ORDER BY t.created_at ASC
  `);
  return result.rows as unknown as TaskExportRow[];
}

export const TASK_EXPORT_HEADERS = [
  'id',
  'title',
  'status',
  'category_name',
  'due_date',
  'completed_at_jst',
  'created_by',
  'assignees',
  'description',
  'source_chat_snippet',
  'created_at_jst',
  'updated_at_jst',
] as const;

export function taskRowToCsvCells(r: TaskExportRow): unknown[] {
  return [
    r.id,
    r.title,
    r.status,
    r.category_name ?? '',
    r.due_date ?? '',
    r.completed_at ?? '',
    r.created_by,
    r.assignees ?? '',
    r.description ?? '',
    r.source_chat_snippet ?? '',
    r.created_at,
    r.updated_at,
  ];
}
