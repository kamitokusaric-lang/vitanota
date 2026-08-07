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

// 4問。文言は紙の p5 と一字一句そろえる (当日「紙と画面で言い方が違う」を作らない)。
// formLabel は入力欄の見出し、posterLabel はポスター用の短い見出し。
// ③ 合言葉はポスターの主役として大きく出すので posterLabel は表示されない。
export type WorkshopTeamReflectionField =
  | 'change'
  | 'moment'
  | 'motto'
  | 'next';

export interface WorkshopTeamQuestion {
  field: WorkshopTeamReflectionField;
  formLabel: string;
  posterLabel: string;
  hint: string;
}

export const WORKSHOP_TEAM_QUESTIONS: WorkshopTeamQuestion[] = [
  {
    field: 'change',
    formLabel: '① 私たちのチームの変化 — 1周目と3周目を比べて、何が変わりましたか?',
    posterLabel: 'チームの変化',
    hint: '会話の量/決めるまでの速さ/役割の生まれ方/決めたことのやり切り…「最初は○○だったが、3周目には○○になっていた」の形で',
  },
  {
    field: 'moment',
    formLabel:
      '② チームだから起きた瞬間 — 「あれがなかったら、今の作品はなかった」という場面を1つ選んでください',
    posterLabel: 'チームだから起きた瞬間',
    hint: '誰の観察・誰の一言でしたか? それによって、チームの何が変わりましたか?',
  },
  {
    field: 'motto',
    formLabel: '③ 私たちのチームの「コツ」 — 明日から使える合言葉にすると?',
    posterLabel: 'チームのコツ',
    hint: '例:「とりあえず作ってみる」「迷ったら口に出す」— チームで1フレーズ作ってください',
  },
  {
    field: 'next',
    formLabel:
      '④ 仕事で活かせること — このチームの動き方を、試せる場面はありますか?',
    posterLabel: '仕事で活かせること',
    hint: '例:「学年会で、まず全員が一言ずつ」「行事の準備は、とりあえず形にしてから相談」',
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
