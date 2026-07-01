// system_admin 用「ふりかえり → AIリコメンド」エクスポートの SQL を切り出したクエリレイヤ。
// 用途: prompt 改善 (入力 → AI の気づき/ドラフト/reason → 本人の公開/見送り/編集を offline 分析)。
//
// 踏み絵 (project_ai_sessions_visibility / feedback_observed_moment_broken):
//   - system_admin 限定 (handler 認証層 + withSystemAdmin)
//   - **個人/学校を特定しない**: user_id / tenant_id は出力しない (匿名)
//   - 全テナント横断の corpus (改善は全データから学ぶため、期間のみで絞る)
//   - input は PII マスク済 (input_masked) のみ出す。生本文 (journal_entries.content) は出さない
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/db/schema';

type Tx = NodePgDatabase<typeof schema>;

export interface RetroRecommendExportRow {
  id: string;
  created_at: string;
  surface: string | null;
  primary_category: string | null;
  has_tweet: boolean;
  status: string;
  final_category: string | null;
  body_changed: boolean | null;
  prompt_version: string | null;
  model_id: string | null;
  awareness: string | null;
  draft: string | null;
  reason: string | null;
  input_masked: string | null;
}

export interface RetroRecommendExportArgs {
  /** YYYY-MM-DD (JST) */
  from: string;
  /** YYYY-MM-DD (JST, 包含) */
  to: string;
}

export async function selectRetroRecommendExportRows(
  tx: Tx,
  args: RetroRecommendExportArgs,
): Promise<RetroRecommendExportRow[]> {
  const { from, to } = args;
  const result = await tx.execute(sql`
    SELECT
      id::text                                             AS id,
      to_char(created_at AT TIME ZONE 'Asia/Tokyo',
              'YYYY-MM-DD"T"HH24:MI:SS')                   AS created_at,
      output_json->>'surface'                              AS surface,
      output_json->'primary'->>'category'                  AS primary_category,
      (output_json->'tweet') IS NOT NULL                   AS has_tweet,
      status::text                                         AS status,
      final_category                                       AS final_category,
      body_changed                                         AS body_changed,
      prompt_version                                       AS prompt_version,
      model_id                                             AS model_id,
      output_json->'primary'->>'awareness'                 AS awareness,
      output_json->'primary'->>'draft'                     AS draft,
      output_json->>'reason'                               AS reason,
      input_masked                                         AS input_masked
    FROM journal_recommendations
    WHERE (created_at AT TIME ZONE 'Asia/Tokyo')::date >= ${from}::date
      AND (created_at AT TIME ZONE 'Asia/Tokyo')::date <= ${to}::date
    ORDER BY created_at ASC
  `);
  return result.rows as unknown as RetroRecommendExportRow[];
}

export const RETRO_RECOMMEND_EXPORT_HEADERS = [
  'id',
  'created_at_jst',
  'surface',
  'primary_category',
  'has_tweet',
  'status',
  'final_category',
  'category_changed',
  'body_changed',
  'prompt_version',
  'model_id',
  'awareness',
  'draft',
  'reason',
  'input_masked',
] as const;

// 提案区分 → 最終区分の差分 (公開時のみ意味を持つ)。primary が無い (tweet のみ) 提案は 'tweet' 扱い。
function categoryChanged(r: RetroRecommendExportRow): string {
  if (r.status !== 'published' || !r.final_category) return '';
  const proposed = r.primary_category ?? 'tweet';
  return String(proposed !== r.final_category);
}

export function retroRecommendRowToCsvCells(r: RetroRecommendExportRow): unknown[] {
  return [
    r.id,
    r.created_at,
    r.surface ?? '',
    r.primary_category ?? '',
    String(r.has_tweet),
    r.status,
    r.final_category ?? '',
    categoryChanged(r),
    r.body_changed === null ? '' : String(r.body_changed),
    r.prompt_version ?? '',
    r.model_id ?? '',
    r.awareness ?? '',
    r.draft ?? '',
    r.reason ?? '',
    r.input_masked ?? '',
  ];
}
