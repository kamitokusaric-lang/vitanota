// AI 種別提案 (journal kind suggestion) の共有スキーマ + ローカル mock。
// API (pages/api/journal/kind-suggest.ts) と Lambda (scripts/ai-chat-extract/) が共有する。
//
// 踏み絵: AI は「分類・評価・感情代弁」をしない。提案は「どこへ渡す / どう残す」のルーティング。
//   本人が必ず確定する (mood と同原則)。suggestedKind=null は note 据え置き提案。
import { z } from 'zod';

// AI が提案しうる種別 (note は既定なので提案対象外 = null で表す)。
//   thanks=感謝を伝える / help=確認・相談したいこと
// 「役に立つ情報(knowledge)」は手動種別を廃止し「なるほど」集計に一本化 (kind 再設計 2026-06-16)。
// keep/concern は生徒ノート由来とするため職員室ノートの AI 提案からは外す。
export const suggestKindSchema = z.enum(['thanks', 'help']);
export type SuggestKind = z.infer<typeof suggestKindSchema>;

// AI 出力 (信頼できないので strict)。suggestedKind=null は「note のままでよい」。
export const kindSuggestResultSchema = z
  .object({
    suggestedKind: suggestKindSchema.nullable(),
    confidence: z.enum(['high', 'medium', 'low']),
  })
  .strict();
export type KindSuggestResult = z.infer<typeof kindSuggestResultSchema>;

// ── ローカル mock (AI_CHAT_LOCAL_MOCK=true 時に Lambda を介さず応答) ──
// キーワードで素朴に種別を推す。実 AI は Bedrock (2b) に任せる。
export function mockKindSuggest(content: string): KindSuggestResult {
  const t = content;
  if (/相談|困っ|教えてほし|助け|わからな|どうすれ/.test(t)) {
    return { suggestedKind: 'help', confidence: 'medium' };
  }
  if (/ありがと|感謝|助かっ|お礼/.test(t)) {
    return { suggestedKind: 'thanks', confidence: 'medium' };
  }
  // 特定できないときは note 据え置き (null)。
  return { suggestedKind: null, confidence: 'low' };
}
