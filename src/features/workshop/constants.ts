// 研修 (workshop) の決め打ちの箱 (chimo 2026-07-29)。
//
// 箱は UI で作らず、コード定数として1つ用意する。箱本体テーブルは作らないので、
// workshop_checkins / workshop_reflections はこの WORKSHOP.id を workshop_id に持つ。
// 将来もう1箱増やすときは、ここに定数を足す (DB スキーマは触らない)。
//
export interface WorkshopBox {
  /** 決め打ちの箱 ID (workshop_checkins/reflections.workshop_id が参照する固定 UUID)。 */
  id: string;
  /** 開催日時 (タイトルの上に小さく出す)。未設定なら出さない。 */
  schedule?: string;
  /** 研修タイトル (正式名・パネル見出しに1箇所だけ出す)。 */
  title: string;
  /** チェックインの問い (研修前・任意回答)。 */
  checkinQuestion: string;
}

// 「正解がない課題にチームで向き合う」研修の箱。
export const WORKSHOP: WorkshopBox = {
  id: '872e7328-fa6f-41c9-bb79-7aa19749628f',
  schedule: '2026/8/18 10:00-12:00 開催',
  title: '正解がない課題にチームで向き合う',
  checkinQuestion: '子どもの頃、動物園でいちばん好きだった場所はどこですか？',
};

// ── チーム振り返り (紙の配布物5「振り返り・発表シート」の画面化) ──────
//
// 当日の班。班テーブルは作らない (参加者テーブルを作らないのと同じ方針)。
// 班数・呼び方が変わったらここを直すだけ。tone は発表中に「今どの班か」が
// 一目で分かるための淡い色分けで、優劣の色分けではない。既存パレット
// (accent/blue/green/pink) の範囲に収める。
//
// Tailwind の JIT はクラス名を文字列として走査するため、tone は
// 組み立てずに完全なクラス文字列で持つこと (`bg-vn-${x}` は効かない)。
export interface WorkshopTeamTone {
  /** ポスターの地 (淡い面)。 */
  surface: string;
  /** 班ラベル・合言葉の文字色。 */
  text: string;
  /** ポスターの枠線。 */
  border: string;
  /** ④「仕事で活かせること」の帯。 */
  band: string;
}

export interface WorkshopTeam {
  key: string;
  label: string;
  tone: WorkshopTeamTone;
}

export const WORKSHOP_TEAMS: WorkshopTeam[] = [
  {
    key: '1',
    label: '1班',
    tone: {
      surface: 'bg-vn-accent-bg/40',
      text: 'text-vn-accent-text',
      border: 'border-vn-accent/30',
      band: 'bg-vn-accent-bg text-vn-accent-text',
    },
  },
  {
    key: '2',
    label: '2班',
    tone: {
      surface: 'bg-vn-blue-bg/50',
      text: 'text-vn-blue-text',
      border: 'border-vn-blue/30',
      band: 'bg-vn-blue-bg text-vn-blue-text',
    },
  },
  {
    key: '3',
    label: '3班',
    tone: {
      surface: 'bg-vn-green-bg/50',
      text: 'text-vn-green-text',
      border: 'border-vn-green/40',
      band: 'bg-vn-green-bg text-vn-green-text',
    },
  },
  {
    key: '4',
    label: '4班',
    tone: {
      surface: 'bg-vn-pink-bg/50',
      text: 'text-vn-pink-text',
      border: 'border-vn-pink/30',
      band: 'bg-vn-pink-bg text-vn-pink-text',
    },
  },
];

export const WORKSHOP_TEAM_KEYS = WORKSHOP_TEAMS.map((t) => t.key);

export function findWorkshopTeam(key: string): WorkshopTeam | undefined {
  return WORKSHOP_TEAMS.find((t) => t.key === key);
}

// チーム振り返りの4問 (chimo 2026-08-10)。
//
// 研修資料のスライド「正解がない複雑な課題にチームで向き合う」が示す**3条件**に紐づける。
// それまでは OODA の周回 (変化 / チームだから起きた瞬間 / 合言葉) を軸にしていたが、
// スライドの問いと軸がズレていた。
//   ・共に働く人の価値観や前提を尊重する
//   ・一人一人が自律的に取り組む
// (スライドの「共に目指したいビジョン」は chimo 判断で外した・2026-08-10)
// 最後の1問だけはスライドに無い「日常への着地」で、ポスターの主役に置く
// (発表のクライマックスを「で、明日から何をするか」にするため)。
//
// 見出しに番号を振らない。1問外したときに番号が飛ぶのと、見出し自体が
// 説明的なので番号が要らないため。
//
// formLabel は入力欄の問い、posterLabel はポスター用の短い見出し。
// hint (プレースホルダー) には**例を載せない** (chimo 2026-08-10)。
// 例を置くと、それをなぞった答えが並んでチームの言葉が出てこなくなるため。
// ④ は主役として大きく出すので posterLabel は表示されない。
export type WorkshopTeamReflectionField = 'respect' | 'autonomy' | 'next';

export interface WorkshopTeamQuestion {
  field: WorkshopTeamReflectionField;
  formLabel: string;
  posterLabel: string;
  hint: string;
}

export const WORKSHOP_TEAM_QUESTIONS: WorkshopTeamQuestion[] = [
  {
    field: 'respect',
    formLabel:
      '異なる観察や解釈を、ポジティブな力に変えるコツは見つかりましたか？',
    posterLabel: 'ちがいの活かし方',
    hint: '',
  },
  {
    field: 'autonomy',
    formLabel:
      '役割や立場に関わらず、全員が自律的に主体的に関わるコツは見つかりましたか？',
    posterLabel: '自律的な動き',
    hint: '',
  },
  {
    field: 'next',
    formLabel: '仕事で活かせること — このチームの動き方を、試せる場面はありますか?',
    posterLabel: '仕事で活かせること',
    hint: '',
  },
];


// 研修資料 (スライド)。PDF を1ページずつ PNG 化して public/workshop/pages/ に置き、
// 1枚ずつめくって見せる (pdftoppm で 2桁ゼロ埋め page-01.png…)。差し替えるときは
// PDF を再変換し pageCount を更新する。静的アセットなので API を通さずクライアントが直接読む。
const MATERIAL_PAGE_COUNT = 10;
const MATERIAL_PAD = String(MATERIAL_PAGE_COUNT).length;

export const WORKSHOP_MATERIAL = {
  /** 総ページ数。 */
  pageCount: MATERIAL_PAGE_COUNT,
  /** 1-indexed のページ画像パス。 */
  pagePath: (n: number) =>
    `/workshop/pages/page-${String(n).padStart(MATERIAL_PAD, '0')}.png`,
};
