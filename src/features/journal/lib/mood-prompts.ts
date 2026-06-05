// 日々ノート / mood 投稿入口で投稿者に向けて表示するランダム問いかけ
// 時間帯別に語り口を変える (朝=軽く / 昼=共感ベース / 夕〜夜=労い先) — chimo 指示
// 気分・調子を聞くものに限定 (絵文字クリックで mood を選ぶため、出来事系の問いかけは除外)

// 朝 (05:00 - 10:59): "まだ何も起きてない" 前提で軽く
const MORNING_PROMPTS = [
  'おっはよー、今日はどんな感じ?',
  'おはよー、調子どう?',
  'おっはよー、いいスタート切れてる?',
  'おはよう、今日はやれそう? それともぼちぼち?',
  'おっはよー、今の気分どう?',
] as const;

// 昼 (11:00 - 15:59): 共感ベース (評価しない)
const NOON_PROMPTS = [
  '午前中おつかれ! 今どんな感じ?',
  'ここまでいい感じ? それともキツい?',
  '午前おつ! ちょい疲れてきた?',
  'ここまでどう? まだいけそう?',
  'ひとまずおつかれ、今の気分どう?',
] as const;

// 夕〜夜 (16:00 - 04:59): "労い" を先に置くと投稿しやすくなる
const EVENING_PROMPTS = [
  '1日よく頑張った! どうだった?',
  '今日もおつかれ、ひとことで言うと?',
  'おつかれさま、今日はどんな1日だった?',
  '今日も乗り切ったね、気分どう?',
  'いい感じで終われそう? それともぐったり?',
] as const;

type TimeOfDay = 'morning' | 'noon' | 'evening';

function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'noon';
  return 'evening';
}

export function pickRandomMoodPrompt(date?: Date): string {
  const tod = getTimeOfDay(date);
  const list =
    tod === 'morning'
      ? MORNING_PROMPTS
      : tod === 'noon'
        ? NOON_PROMPTS
        : EVENING_PROMPTS;
  return list[Math.floor(Math.random() * list.length)];
}
