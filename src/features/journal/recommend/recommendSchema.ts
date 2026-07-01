// ふりかえり → AIリコメンドの出力スキーマ (Lambda・API・Frontend 共通の契約)。
// 設計: docs/proposal/retrospective.md §6 / project_retro_recommend_20260630
//
// 踏み絵:
//   - AI は「気づき(awareness)」と「公開用ドラフト(draft)」を能動的に返すが、宛先(destination)は選ばない。
//     destination は category から関数導出する (categoryToDestination)。
//   - つぶやき(tweet)には draft を持たせない (一押しのみ・本人が素のまま書く) = 型で保証。
//   - mood は読むだけ。出力スキーマに mood を持たせない (AI が mood を推定・上書きしない)。
//   - AI 出力は信頼できないので strict() で未知フィールドを弾く。
import { z } from 'zod';
import { parseReflection } from '../lib/reflectionTemplate';

// 主提案で使う区分 (= 職員室ボード行き)。つぶやきは別枠 (tweet) で扱う。
export const retroBoardCategorySchema = z.enum(['soudan', 'kansha', 'knowledge']);
export type RetroBoardCategory = z.infer<typeof retroBoardCategorySchema>;

// 本人が編集時に選び直せる 4 区分 (相談/感謝/ナレッジ/つぶやき)。
export const retroCategorySchema = z.enum(['soudan', 'kansha', 'knowledge', 'tweet']);
export type RetroCategory = z.infer<typeof retroCategorySchema>;

// 区分ごとの付随情報。感謝=宛先ヒント / ナレッジ=タイトル+要点。
// 「どこに共有されるか」の一言は中身に依存しないので UI 固定 (AI に書かせない)。
export const retroPrimaryMetaSchema = z
  .object({
    recipientHint: z.string().max(100).optional(),
    title: z.string().max(100).optional(),
    points: z.array(z.string().max(200)).max(5).optional(),
  })
  .strict();
export type RetroPrimaryMeta = z.infer<typeof retroPrimaryMetaSchema>;

// 主提案 (相談/感謝/ナレッジ)。気づき + 公開用ドラフト + 付随情報。
export const retroPrimarySchema = z
  .object({
    category: retroBoardCategorySchema,
    awareness: z.string().min(1).max(300),
    draft: z.string().min(1).max(2000),
    meta: retroPrimaryMetaSchema,
  })
  .strict();
export type RetroPrimary = z.infer<typeof retroPrimarySchema>;

// つぶやき枠 (任意・併置可)。一押しのみで draft は持たない。
export const retroTweetSchema = z
  .object({
    nudge: z.string().min(1).max(200),
  })
  .strict();
export type RetroTweet = z.infer<typeof retroTweetSchema>;

// AI 出力本体 (§6)。surface=false なら primary/tweet は null でよい。
export const retroRecommendResultSchema = z
  .object({
    surface: z.boolean(),
    primary: retroPrimarySchema.nullable(),
    tweet: retroTweetSchema.nullable(),
    reason: z.string().max(500),
  })
  .strict();
export type RetroRecommendResult = z.infer<typeof retroRecommendResultSchema>;

// ── 宛先導出 (AI に選ばせない・category から一意に決まる) ──
export type RetroDestination = 'board' | 'note';

const CATEGORY_TO_DESTINATION: Record<RetroCategory, RetroDestination> = {
  soudan: 'board',
  kansha: 'board',
  knowledge: 'board',
  tweet: 'note',
};
export function categoryToDestination(category: RetroCategory): RetroDestination {
  return CATEGORY_TO_DESTINATION[category];
}

// board 行き区分 → staffroom board kind。tweet は board ではないので null。
export type RetroBoardKind = 'help' | 'thanks' | 'knowledge';
const CATEGORY_TO_BOARD_KIND: Record<RetroCategory, RetroBoardKind | null> = {
  soudan: 'help',
  kansha: 'thanks',
  knowledge: 'knowledge',
  tweet: null,
};
export function categoryToBoardKind(category: RetroCategory): RetroBoardKind | null {
  return CATEGORY_TO_BOARD_KIND[category];
}

// ── ローカル mock (MOCK_BEDROCK=true / AI_CHAT_LOCAL_MOCK=true 時) ──
// 実 AI を介さず UX 動線を確認できる。ルート候補区分を主信号に fixture を返す。
// draft は実プロンプトの意図に寄せる: テンプレ見出しを持ち込まず、区分に関係する欄だけを
// 自己完結した 1 文にする (実際の文章品質は Bedrock + buildRetroSystemPrompt が担う)。
function sectionsOf(content: string): {
  keep: string;
  problem: string;
  try: string;
  whole: string;
} {
  const p = parseReflection(content);
  const whole = content.replace(/\s+/g, ' ').trim();
  if (!p.isTemplate) return { keep: '', problem: '', try: '', whole };
  return {
    keep: p.values.keep.replace(/\s+/g, ' ').trim(),
    problem: p.values.problem.replace(/\s+/g, ' ').trim(),
    try: p.values.try.replace(/\s+/g, ' ').trim(),
    whole,
  };
}

// 末尾の句読点を落として 1 文の素材にする (次の文と自然につなぐため)。
function stem(s: string): string {
  return s.replace(/[。.!?！？、\s]+$/u, '').trim();
}

// 文頭の逆接の接続語を落とす (「だけど、」等。よかった欄からの続きで始まることがある)。
function stripLead(s: string): string {
  return s.replace(/^(だけど|でも|しかし|ただし|ただ|けど|が)[、,]?\s*/u, '');
}

// 問い・悩みを含んでいそうな手がかり (mock が相談文を組むときの判定)。
const QUESTION_HINT = /どう|いか|べき|方法|どこ|なぜ|どんな|のか|かな|悩/u;

export function mockRetroRecommend(
  candidateCategory: RetroCategory | null,
  content: string,
): RetroRecommendResult {
  if (!candidateCategory) {
    return { surface: false, primary: null, tweet: null, reason: 'mock: 候補区分なし' };
  }
  if (candidateCategory === 'tweet') {
    return {
      surface: true,
      primary: null,
      tweet: { nudge: 'ちょっといい話。ひとりで持っておくの、もったいないかも' },
      reason: 'mock: ポジティブな共有 → つぶやき',
    };
  }
  const s = sectionsOf(content);
  if (candidateCategory === 'soudan') {
    // 困りごとを主素材に。困りごとが既に問いを含むなら「次に試したい」は混ぜない
    // (困りごとと無関係な別アイデアのことがあるため)。試したい欄が問いのときだけ核心に使う。
    const concern = stripLead(stem(s.problem || s.whole));
    const ask = stem(s.try);
    let draft: string;
    if (QUESTION_HINT.test(concern)) {
      draft = `${concern}。みなさんの工夫を教えてください。`;
    } else if (ask && QUESTION_HINT.test(ask)) {
      draft = `${concern}。${ask}、みなさんの工夫を教えてください。`;
    } else {
      draft = `${concern}。こういうとき、みなさんはどうされていますか?`;
    }
    return {
      surface: true,
      primary: {
        category: 'soudan',
        awareness: 'これ、一人で抱えなくていい困りごとかも。同じく迷ってる先生、たぶん多いです',
        draft,
        meta: {},
      },
      tweet: null,
      reason: 'mock: ネガ寄り + 困りごと → 相談',
    };
  }
  if (candidateCategory === 'kansha') {
    const body = stem(s.keep || s.whole);
    return {
      surface: true,
      primary: {
        category: 'kansha',
        awareness: '誰かへのありがとうが書かれていました。そっと伝えてみませんか',
        draft: `${body}。ありがとうの気持ちを伝えたいです。`,
        meta: { recipientHint: '学年の先生' },
      },
      tweet: null,
      reason: 'mock: 感謝の語 → 感謝',
    };
  }
  const body = stem(s.keep || s.try || s.whole);
  return {
    surface: true,
    primary: {
      category: 'knowledge',
      awareness: '再現できそうな工夫が書かれていました。共有すると誰かの役に立つかも',
      draft: `${body}。うまくいったので共有します。`,
      meta: { title: '今日の工夫', points: ['やったこと', '効いた理由'] },
    },
    tweet: null,
    reason: 'mock: 再現できる工夫 → ナレッジ',
  };
}
