// system_admin 用 journal エクスポートの SQL を切り出した薄いクエリレイヤ。
// handler から呼ぶ。integration test では withSystemAdminContext から直接叩く。
//
// 重要 (chimo 絶対指示): 公開 journal のみを返す。
// public_journal_entries VIEW (`is_public = true` を VIEW 定義に組み込み + 列に is_public を含めない)
// から SELECT することで、ここで条件を書き忘れても schema 層で is_public フィルタ漏れを防ぐ。
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '@/db/schema';

type Tx = NodePgDatabase<typeof schema>;

export interface JournalExportRow {
  id: string;
  kind: string;
  mood: string | null;
  content: string;
  emotion_tags: string | null;
  knowledge_tags: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalExportArgs {
  tenantId: string;
  /** YYYY-MM-DD (JST) */
  from: string;
  /** YYYY-MM-DD (JST, 包含) */
  to: string;
}

export async function selectJournalExportRows(
  tx: Tx,
  args: JournalExportArgs,
): Promise<JournalExportRow[]> {
  const { tenantId, from, to } = args;
  const result = await tx.execute(sql`
    SELECT
      pje.id::text                                            AS id,
      pje.kind::text                                          AS kind,
      pje.mood::text                                          AS mood,
      pje.content                                             AS content,
      et_agg.tags                                             AS emotion_tags,
      kt_agg.tags                                             AS knowledge_tags,
      pje.user_id::text                                       AS user_id,
      to_char(pje.created_at AT TIME ZONE 'Asia/Tokyo',
              'YYYY-MM-DD"T"HH24:MI:SS')                      AS created_at,
      to_char(pje.updated_at AT TIME ZONE 'Asia/Tokyo',
              'YYYY-MM-DD"T"HH24:MI:SS')                      AS updated_at
    FROM public_journal_entries pje
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(et.name, ';' ORDER BY et.name) AS tags
      FROM journal_entry_tags jet
      JOIN emotion_tags et ON et.id = jet.tag_id
      WHERE jet.entry_id = pje.id AND jet.tenant_id = ${tenantId}::uuid
    ) et_agg ON true
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(kt.name, ';' ORDER BY kt.name) AS tags
      FROM journal_entry_knowledge_tags jekt
      JOIN knowledge_tags kt ON kt.id = jekt.knowledge_tag_id
      WHERE jekt.journal_entry_id = pje.id AND jekt.tenant_id = ${tenantId}::uuid
    ) kt_agg ON true
    WHERE pje.tenant_id = ${tenantId}::uuid
      AND (pje.created_at AT TIME ZONE 'Asia/Tokyo')::date >= ${from}::date
      AND (pje.created_at AT TIME ZONE 'Asia/Tokyo')::date <= ${to}::date
    ORDER BY pje.created_at ASC
  `);
  return result.rows as unknown as JournalExportRow[];
}

export const JOURNAL_EXPORT_HEADERS = [
  'id',
  'kind',
  'mood',
  'content',
  'emotion_tags',
  'knowledge_tags',
  'user_id',
  'created_at_jst',
  'updated_at_jst',
] as const;

export function journalRowToCsvCells(r: JournalExportRow): unknown[] {
  return [
    r.id,
    r.kind,
    r.mood ?? '',
    r.content,
    r.emotion_tags ?? '',
    r.knowledge_tags ?? '',
    r.user_id ?? '',
    r.created_at,
    r.updated_at,
  ];
}
