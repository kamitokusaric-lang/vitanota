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
  // 完全フラット + 単色 (chimo 2026-07-02): mine は背景を持たず、アイコン + 数字を
  // 唯一のアクセント色 (オレンジ) で示す。種類はアイコンで判別するため色は 1 色に統一。
  knowledge:    { Icon: Lightbulb, label: 'なるほど', ariaLabel: 'なるほどをつける', mineClass: 'text-vn-accent' },
  appreciation: { Icon: Coffee,    label: 'お疲れ様', ariaLabel: 'お疲れ様をつける', mineClass: 'text-vn-accent' },
  endorsement:  { Icon: ThumbsUp,  label: 'いいね',   ariaLabel: 'いいねをつける',   mineClass: 'text-vn-accent' },
};

// UI で 3 ボタンを並べる順序 (左 → 右)
// 2026-05-27 chimo 指示: おつかれさま → すてき → ナレッジ の順
//   感情寄り (労い・肯定) を先に置き、 ナレッジ (知見) を最後に。
export const REACTION_TYPES_ORDER = [
  'appreciation',
  'endorsement',
  'knowledge',
] as const satisfies ReadonlyArray<JournalReactionType>;
