// 学年会 (grade-meeting) の設問文。
//
// 段の並び (観察 → 状況判断 → 次の一手) は紙の OODA 記録シート
// (研修の配布物3) と同じ。研修で先生が体得した工程をそのまま日常の学年会に
// 持ち込めるのがこの機能の武器。
// 問いの文言は 2026-08-07 に chimo が学年会向けに言い直した
// (紙の問いかけ形から、書く対象を示す形へ)。

export type ClassNoteKind = 'observe' | 'orient' | 'action';

export interface ClassNoteSection {
  kind: ClassNoteKind;
  /** 見出し (紙の工程名)。 */
  label: string;
  /** この工程で書く対象を示す一行。 */
  question: string;
  /** 入力欄の補足。 */
  hint: string;
}

export const CLASS_NOTE_SECTIONS: ClassNoteSection[] = [
  {
    kind: 'observe',
    label: '観察',
    question: '事実として観察したこと',
    hint: 'どんな小さいことでも良いので、全員の視点を集めましょう',
  },
  {
    kind: 'orient',
    label: '状況判断',
    question: 'どんな判断をする？',
    hint: '観察したことに対する、見立てを書きましょう。なぜ起きている？なぜ良くなった？など。多様な見立てを集めましょう。',
  },
  {
    kind: 'action',
    label: '次の一手',
    question: '次に小さく試してみること',
    hint: '次の1週間で小さくトライすることを一緒に決めましょう',
  },
];

export function findClassNoteSection(kind: ClassNoteKind): ClassNoteSection {
  const found = CLASS_NOTE_SECTIONS.find((s) => s.kind === kind);
  if (!found) throw new Error(`unknown class note kind: ${kind}`);
  return found;
}

// 「次の一手」だけ 1回×1クラスで1行 (クラスとして1つ決めるもの)。
// 観察・状況判断は何行でも入る (複数の視点を畳まないのが設計の核)。
export const SINGLE_ROW_KIND: ClassNoteKind = 'action';
