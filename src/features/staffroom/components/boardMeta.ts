// 職員室ボードのカテゴリ (= journal_entry_kind の board 直値) の表示メタ。
// 語彙は世界観 (PHILOSOPHY §6) に寄せ、分析/評価/スコアの語を使わない。
import type { StaffroomBoardKind, StaffroomBoxKind } from '../types';

export interface BoardKindMeta {
  label: string; // 短いラベル (投稿チップ・カードバッジ)
  boxTitle: string; // 箱の見出し (説明ラベル・chimo 2026-06-11 関係図)
  hint: string; // 入力時の一言ガイド
  placeholder: string;
  pill: string; // バッジ配色 (vn / tailwind トークン)
  dot: string; // 箱見出し前の◯の濃い配色 (判別用・chimo 2026-06-13)
}

// 表示する 5 kind 分のメタ (board ネイティブ 4 + knowledge)。
export const BOARD_KIND_META: Record<StaffroomBoxKind, BoardKindMeta> = {
  keep: {
    label: '続けたい',
    boxTitle: '生徒の良い様子を共有',
    hint: 'うまくいったこと',
    placeholder: 'クラスや学年で続けたいこと…',
    pill: 'bg-vn-green-bg text-vn-green-text',
    dot: 'bg-emerald-500',
  },
  concern: {
    label: '気になる',
    boxTitle: '生徒の気になる様子を共有',
    hint: '引っかかっていること',
    placeholder: '気になっていること、引っかかっていること…',
    pill: 'bg-vn-warning-bg text-vn-warning-text',
    dot: 'bg-amber-500',
  },
  thanks: {
    label: 'ありがとう',
    boxTitle: '感謝を伝える',
    hint: '感謝・お礼',
    placeholder: '誰かに伝えたいありがとう…',
    pill: 'bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
  help: {
    label: '相談',
    boxTitle: '確認・相談したいこと',
    hint: '困っている・教えてほしい',
    placeholder: '困っていること、誰かに教えてほしいこと…',
    pill: 'bg-indigo-50 text-indigo-700',
    dot: 'bg-indigo-500',
  },
  knowledge: {
    label: 'ナレッジ',
    boxTitle: '役に立つ情報',
    hint: '日々ノートの公開ナレッジ',
    placeholder: '',
    pill: 'bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
  },
  note: {
    label: 'メモ',
    boxTitle: 'メモ',
    hint: '公開したメモ',
    placeholder: '',
    pill: 'bg-slate-100 text-slate-600',
    dot: 'bg-slate-500',
  },
};

// 投稿フォームで選べる board ネイティブ kind (4)。knowledge は集約表示のみ。
export const POSTABLE_KIND_ORDER: StaffroomBoardKind[] = ['keep', 'concern', 'thanks', 'help'];

// 職員室ボードに表示する箱の順。keep/concern は生徒ノート由来、tweet(つぶやき)は
// 表示しない (chimo 2026-06-13/14)。BOARD_KIND_META には残す (型・将来連携のため)。
export const BOX_KIND_ORDER: StaffroomBoxKind[] = [
  'help',
  'thanks',
  'knowledge',
];
