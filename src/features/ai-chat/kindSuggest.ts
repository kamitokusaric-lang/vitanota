// AI 種別提案 (journal kind suggestion) の共有スキーマ + ローカル mock。
// API (pages/api/journal/kind-suggest.ts) と Lambda (scripts/ai-chat-extract/) が共有する。
//
// 踏み絵: AI は「分類・評価・感情代弁」をしない。提案は「どこへ渡す / どう残す」のルーティング。
//   本人が必ず確定する (mood と同原則)。suggestedKind=null は tweet 据え置き提案。
import { z } from 'zod';

// AI が提案しうる種別 (tweet は既定なので提案対象外 = null で表す)。
//   knowledge=役に立つ情報 / thanks=感謝を伝える / help=確認・相談したいこと
// keep/concern は生徒ノート由来とするため職員室ノートの AI 提案からは外す (chimo 2026-06-13)。
export const suggestKindSchema = z.enum(['knowledge', 'thanks', 'help']);
export type SuggestKind = z.infer<typeof suggestKindSchema>;

// AI 出力 (信頼できないので strict)。suggestedKind=null は「tweet のままでよい」。
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
  if (/方法|やり方|コツ|工夫|知見|まとめ|テンプレ|手順|参考/.test(t)) {
    return { suggestedKind: 'knowledge', confidence: 'medium' };
  }
  // 特定できないときは tweet 据え置き (null)。
  return { suggestedKind: null, confidence: 'low' };
}
