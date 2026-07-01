// ふりかえり → AIリコメンドの「区分ルーティング (ルール側)」。
// 設計: docs/proposal/retrospective.md §5.2 (ルール+AI併用)。
//
// ルールが宛先区分の候補を 1 つに絞り、AI は awareness/draft 生成と surface 判定に集中する。
// 信号 = 3行日誌テンプレの欄 (keep/problem/try, parseReflection) + 気持ちタグの category。
// mood は AI 入力には渡すがルーティングの確定信号には使わない (本人選択を読むだけ)。
import { parseReflection } from '../lib/reflectionTemplate';
import type { RetroCategory } from './recommendSchema';

export interface RouterTag {
  name: string;
  category: 'positive' | 'negative' | 'neutral';
}

// 助けがいる困りごと・気がかりの手がかり (自由記述の相談判定に使う)。
const HELP_WORDS = /相談|困っ|困った|迷|どうすれ|どこまで|教えてほし|助け|わからな|不安|気になる|気がかり|心配|悩/;
// 感謝の手がかり。
const THANKS_WORDS = /ありがと|感謝|助かっ|助けてもら|おかげ|お礼/;
// 再現できる工夫の手がかり。
const KNOWLEDGE_WORDS = /工夫|うまくいっ|コツ|やり方|手順|テンプレ|使え|効いた|ウケ|反応がよ/;
// 「特になし」等、実質的な中身のない記入 (相談扱いにしない)。
const TRIVIAL = /^(特に)?(なし|無し|ない|なかった|ありません)[。.\s]*$/u;

/**
 * 本文 + 気持ちタグから主提案の候補区分を 1 つ選ぶ。手がかりが弱ければ null。
 * 返り値はあくまで候補 (AI が surface=false で打ち消すこともある)。
 */
export function routeCategory(
  content: string,
  tags: RouterTag[],
): RetroCategory | null {
  const parsed = parseReflection(content);
  const keep = parsed.isTemplate ? parsed.values.keep : '';
  const problem = parsed.isTemplate ? parsed.values.problem : '';
  const tryText = parsed.isTemplate ? parsed.values.try : '';
  const whole = content;

  const hasNeg = tags.some((t) => t.category === 'negative');
  const hasPos = tags.some((t) => t.category === 'positive');

  // 1. 相談: 「気になった・困ったこと」欄に中身があれば最優先で相談。
  //    よかったことが並んでいても、困りごと欄に書いた時点で「相談したい」信号とみなす
  //    (chimo 2026-07-01: keep が良い話なのは当たり前。拾うべきは困りごと)。
  const problemFilled =
    parsed.isTemplate && problem.trim() !== '' && !TRIVIAL.test(problem.trim());
  if (problemFilled) {
    return 'soudan';
  }
  // 自由記述 (テンプレ無し): ネガ寄りタグ or 困りごと・気がかりの語があれば相談。
  if (!parsed.isTemplate && whole.trim() && (hasNeg || HELP_WORDS.test(whole))) {
    return 'soudan';
  }

  // 以降のポジ系判定で使うテキスト (テンプレなら keep/try、自由記述なら全体)。
  const posText = [keep, tryText].filter((s) => s.trim()).join('\n') || whole;

  // 2. 感謝: 感謝の語。
  if (THANKS_WORDS.test(posText)) {
    return 'kansha';
  }

  // 3. ナレッジ: 再現できる工夫の語、または「次に試したいこと」欄あり。
  if (KNOWLEDGE_WORDS.test(posText) || tryText.trim() !== '') {
    return 'knowledge';
  }

  // 4. つぶやき: ポジ寄りタグ or keep 欄あり or 自由記述に中身あり (共有まででいい軽い話)。
  if (hasPos || keep.trim() || (!parsed.isTemplate && whole.trim())) {
    return 'tweet';
  }

  // 手がかりなし。
  return null;
}
