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

// dashboard 上部 PhilosophyGreeting セクションに表示する哲学格言データ (chimo 選定)
// 朝=始める / 昼=考える / 夜=整える の 3 時間帯 × 15 件 = 計 45 件
// 教員を 1mm 内省させる "静かに読む" 文言群。説教調は避け、原典に忠実な一般的訳
export type Greeting = { text: string; author: string };

// 朝 (05:00 - 10:59): 始める
const MORNING_GREETINGS: Greeting[] = [
  { text: '学びて時にこれを習う、亦た説ばしからずや', author: '孔子' },
  { text: '千里の道も一歩から', author: '老子' },
  { text: '自分の理性を使う勇気を持て', author: 'カント' },
  { text: '準備された心にのみ、チャンスは訪れる', author: 'パスツール' },
  { text: '我思う、ゆえに我あり', author: 'デカルト' },
  { text: '汝自身を知れ', author: 'デルポイ神殿の格言' },
  { text: '人は教えることで学ぶ', author: 'セネカ' },
  { text: '幸福とは徳にかなった活動である', author: 'アリストテレス' },
  { text: '人間は社会的動物である', author: 'アリストテレス' },
  { text: '行為することによって人は学ぶ', author: 'アリストテレス' },
  { text: '未来は今日の行いによって決まる', author: 'ガンジー' },
  { text: '想像力は知識より重要である', author: 'アインシュタイン' },
  { text: '努力する者は希望を持つ', author: 'エマーソン' },
  { text: '意志あるところに道は開ける', author: '西洋格言' },
  { text: '自らを知ることが知恵の始まりである', author: 'ソクラテス' },
];

// 昼 (11:00 - 15:59): 考える
const NOON_GREETINGS: Greeting[] = [
  { text: '人は考える葦である', author: 'パスカル' },
  { text: '無知の知', author: 'ソクラテス' },
  { text: '知る者は言わず、言う者は知らず', author: '老子' },
  { text: '不安は可能性のめまいである', author: 'キルケゴール' },
  { text: '存在は本質に先立つ', author: 'サルトル' },
  { text: '人生は短く、技術は長い', author: 'ヒポクラテス' },
  { text: '悲観は気分、楽観は意志である', author: 'アラン' },
  { text: '幸福とは徳にかなった活動である', author: 'アリストテレス' },
  { text: '自然に従って生きよ', author: 'ストア派' },
  { text: '変えられないものは受け入れよ', author: 'エピクテトス' },
  { text: '想像力は知識より重要である', author: 'アインシュタイン' },
  { text: '自由とは自ら選ぶことである', author: 'サルトル' },
  { text: '人は自分の行いによってつくられる', author: 'アリストテレス' },
  { text: '意味は人間によって与えられる', author: 'カミュ' },
  { text: 'よく生きることが大切である', author: 'ソクラテス' },
];

// 夕〜夜 (16:00 - 04:59): 整える
const EVENING_GREETINGS: Greeting[] = [
  { text: '一日の終わりに自らを省みよ', author: 'セネカ' },
  { text: '足るを知る者は富む', author: '老子' },
  { text: '過去にとらわれるな、未来を夢見るな、今に集中せよ', author: 'ブッダ' },
  { text: '執着が苦しみを生む', author: 'ブッダ' },
  { text: '怒りは他人に投げつける熱い炭のようなもの', author: 'ブッダ' },
  { text: 'われわれは繰り返すことの結果である', author: 'アリストテレス' },
  { text: 'よく生きることが大切である', author: 'ソクラテス' },
  { text: '人生は後ろ向きにしか理解できない', author: 'キルケゴール' },
  { text: '自然のままに生きよ', author: '老子' },
  { text: '自分を制する者は最も強い', author: '孔子' },
  { text: '幸福は内なるものである', author: 'アリストテレス' },
  { text: '人は自由の刑に処されている', author: 'サルトル' },
  { text: 'それでも人生は生きるに値する', author: 'カミュ' },
  { text: '心こそすべてである', author: 'ブッダ' },
  { text: '自らに打ち勝つことが最も偉大な勝利である', author: 'プラトン' },
];

export function pickRandomGreeting(date?: Date): Greeting {
  const tod = getTimeOfDay(date);
  const list =
    tod === 'morning'
      ? MORNING_GREETINGS
      : tod === 'noon'
        ? NOON_GREETINGS
        : EVENING_GREETINGS;
  return list[Math.floor(Math.random() * list.length)]!;
}
