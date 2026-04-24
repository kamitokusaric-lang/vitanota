// 日々ノートの冒頭で投稿者に向けて表示するランダム問いかけ
// 評価/分析を感じさせない柔らかさを意識。裏テーマ「独り言空間」を壊さない
const MOOD_PROMPTS = [
  '調子はどうですか?',
  '今日はどんな日でしたか?',
  'いま、どんな気持ち?',
  '今日の気分、一言で言うと?',
  '今日、一番印象に残ったのは?',
  'いま、気になってることある?',
  'どんな空気の一日?',
  '教室、どんな感じでした?',
  'いま、ちょっと立ち止まるなら?',
  '今日の自分に声をかけるなら?',
  '朝よりいい顔してる?',
  'ひと息ついた?',
] as const;

export function pickRandomMoodPrompt(): string {
  const i = Math.floor(Math.random() * MOOD_PROMPTS.length);
  return MOOD_PROMPTS[i];
}
