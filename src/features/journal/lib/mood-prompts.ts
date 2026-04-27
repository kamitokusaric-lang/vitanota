// 日々ノートの冒頭で投稿者に向けて表示するランダム問いかけ
// 気分・調子を聞くものに限定 (絵文字クリックで mood を選ぶため、出来事系の問いかけは除外)
const MOOD_PROMPTS = [
  '調子はどうですか?',
  '今日はどんな日でしたか?',
  'いま、どんな気持ち?',
  '今日の気分、一言で言うと?',
  'どんな空気の一日?',
] as const;

export function pickRandomMoodPrompt(): string {
  const i = Math.floor(Math.random() * MOOD_PROMPTS.length);
  return MOOD_PROMPTS[i];
}
