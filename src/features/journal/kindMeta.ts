// 投稿種別 (kind) のラベルとアイコンの**単一正本**。
//
// 2026-08-07: 職員室ボードの情報共有セクション (boardMeta.ts) を廃止したとき、
// 種別の見た目の定義が TodayCaptureBox の中だけに残った。
// 投稿欄とタイムラインで別々に持つと必ずズレるので、ここに一本化する。
//
// タイムラインでは「小さなアイコン + hover でラベル」だけを出す。
// ラベルを常時大きく並べると分類が主役になってしまうので、あくまで添えるだけ。
// mood (情緒データ) は引き続きタイムラインに出さない — そちらは踏み絵。
import {
  MessageCircle,
  Flower2,
  MessagesSquare,
  Lightbulb,
  type LucideIcon,
} from 'lucide-react';

// 職員室ノートの投稿欄から選べる種別。
// keep/concern (生徒系) は生徒ノート由来なので選択肢に出さない (踏み絵)。
export type JournalKindKey = 'note' | 'thanks' | 'help' | 'knowledge';

export interface JournalKindMeta {
  label: string;
  Icon: LucideIcon;
  /** タイムラインのアイコン色 (カテゴリ別)。 */
  iconClass: string;
}

export const JOURNAL_KIND_META: Record<JournalKindKey, JournalKindMeta> = {
  note: {
    label: 'つぶやき',
    Icon: MessageCircle,
    iconClass: 'text-vn-blue-text',
  },
  thanks: {
    label: '感謝',
    Icon: Flower2,
    iconClass: 'text-vn-pink-text',
  },
  help: {
    label: '相談・確認',
    Icon: MessagesSquare,
    iconClass: 'text-vn-accent-text',
  },
  knowledge: {
    label: 'ナレッジ',
    Icon: Lightbulb,
    iconClass: 'text-vn-yellow-text',
  },
};

/**
 * kind 文字列から表示メタを引く。
 * 旧 kind (diary / tweet) や未知の値には何も出さない (null)。
 */
export function findJournalKindMeta(
  kind: string | null | undefined,
): JournalKindMeta | null {
  if (!kind) return null;
  return JOURNAL_KIND_META[kind as JournalKindKey] ?? null;
}
