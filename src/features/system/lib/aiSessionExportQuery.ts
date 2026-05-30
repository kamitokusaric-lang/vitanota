// system_admin 用 AI セッション詳細エクスポートの SQL を切り出したクエリレイヤ。
// 用途: prompt 改善 (入力 → AI 提案 → 教員確定/破棄の差分を offline で分析)。
//
// 踏み絵 (project_ai_sessions_visibility / feedback_observed_moment_broken):
//   - system_admin 限定 (handler 認証層 + withSystemAdmin)
//   - **個人/学校を特定しない**: user_id / tenant_id は出力しない (匿名)
//   - 全テナント横断の corpus (改善は全データから学ぶため、 期間のみで絞る)
//   - input_text / ai_output_json は PII を含みうる (system_admin のみ、 ページ表示では出さない)
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/db/schema';

type Tx = NodePgDatabase<typeof schema>;

export interface AiSessionExportRow {
  id: string;
  type: string;
  status: string;
  prompt_version: string | null;
  input_text: string;
  input_text_redacted: string | null;
  ai_output_json: string; // 生 JSONB を文字列化 (extraction / userConfirmed / 理由を全て含む)
  created_at: string;
}

export interface AiSessionExportArgs {
  /** YYYY-MM-DD (JST) */
  from: string;
  /** YYYY-MM-DD (JST, 包含) */
  to: string;
}

export async function selectAiSessionExportRows(
  tx: Tx,
  args: AiSessionExportArgs,
): Promise<AiSessionExportRow[]> {
  const { from, to } = args;
  const result = await tx.execute(sql`
    SELECT
      id::text                                                AS id,
      type::text                                              AS type,
      status::text                                            AS status,
      ai_output_json->>'promptVersion'                        AS prompt_version,
      input_text                                              AS input_text,
      ai_output_json->>'inputTextRedacted'                    AS input_text_redacted,
      ai_output_json::text                                    AS ai_output_json,
      to_char(created_at AT TIME ZONE 'Asia/Tokyo',
              'YYYY-MM-DD"T"HH24:MI:SS')                      AS created_at
    FROM ai_sessions
    WHERE (created_at AT TIME ZONE 'Asia/Tokyo')::date >= ${from}::date
      AND (created_at AT TIME ZONE 'Asia/Tokyo')::date <= ${to}::date
    ORDER BY created_at ASC
  `);
  return result.rows as unknown as AiSessionExportRow[];
}

export const AI_SESSION_EXPORT_HEADERS = [
  'id',
  'type',
  'status',
  'prompt_version',
  'input_text',
  'input_text_redacted',
  'ai_output_json',
  'created_at_jst',
] as const;

export function aiSessionRowToCsvCells(r: AiSessionExportRow): unknown[] {
  return [
    r.id,
    r.type,
    r.status,
    r.prompt_version ?? '',
    r.input_text,
    r.input_text_redacted ?? '',
    r.ai_output_json,
    r.created_at,
  ];
}
