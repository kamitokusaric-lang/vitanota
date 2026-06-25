// H9 検証 (2026-05-27): 投稿カードの reaction 3 種類のメタ情報。
//   knowledge    : なるほど (Lightbulb)
//   appreciation : お疲れ様 (Coffee)
//   endorsement  : いいね (ThumbsUp)
// アイコンは lucide (chimo 2026-06-25: 絵文字から戻す)。mine 配色は design 準拠 (☕茶 / 👍ピンク / 💡白)。
import { Lightbulb, Coffee, ThumbsUp, type LucideIcon } from 'lucide-react';
import type { JournalReactionType } from '@/features/journal/schemas/journal';

export interface ReactionMeta {
  Icon: LucideIcon;    // ボタンに表示する lucide アイコン
  label: string;       // ボタンの tooltip / aria 補助に使う表示文言
  ariaLabel: string;   // ボタンの aria-label (操作意図を伝える)
  mineClass: string;   // mine (押下済み) の border/bg/text 配色 (design 2026-06-25)
}

export const REACTION_META: Record<JournalReactionType, ReactionMeta> = {
  knowledge:    { Icon: Lightbulb, label: 'なるほど', ariaLabel: 'なるほどをつける', mineClass: 'border-vn-blue/50 bg-vn-blue-bg text-vn-blue-text' },
  appreciation: { Icon: Coffee,    label: 'お疲れ様', ariaLabel: 'お疲れ様をつける', mineClass: 'border-vn-coffee-border bg-vn-coffee-bg text-vn-coffee-text' },
  endorsement:  { Icon: ThumbsUp,  label: 'いいね',   ariaLabel: 'いいねをつける',   mineClass: 'border-vn-yellow/50 bg-vn-yellow-bg text-vn-yellow-text' },
};

// UI で 3 ボタンを並べる順序 (左 → 右)
// 2026-05-27 chimo 指示: おつかれさま → すてき → ナレッジ の順
//   感情寄り (労い・肯定) を先に置き、 ナレッジ (知見) を最後に。
export const REACTION_TYPES_ORDER = [
  'appreciation',
  'endorsement',
  'knowledge',
] as const satisfies ReadonlyArray<JournalReactionType>;
