// H9 検証 (2026-05-27): 投稿カードの reaction 3 種類のメタ情報。
//   knowledge    : 参考になった (旧「ナレッジリアクション」, Lightbulb 既存維持)
//   appreciation : お疲れ様です (Coffee)
//   endorsement  : すてきです (ThumbsUp)
// アイコンは lucide-react に統一 (chimo 決定、 emoji 不使用)。
import { Lightbulb, Coffee, ThumbsUp, type LucideIcon } from 'lucide-react';
import type { JournalReactionType } from '@/features/journal/schemas/journal';

export interface ReactionMeta {
  Icon: LucideIcon;
  label: string;       // ボタンの tooltip / aria 補助に使う表示文言
  ariaLabel: string;   // ボタンの aria-label (操作意図を伝える)
}

export const REACTION_META: Record<JournalReactionType, ReactionMeta> = {
  knowledge:    { Icon: Lightbulb, label: '参考になった', ariaLabel: '参考になったをつける' },
  appreciation: { Icon: Coffee,    label: 'お疲れ様です', ariaLabel: 'お疲れ様ですをつける' },
  endorsement:  { Icon: ThumbsUp,  label: 'すてきです',   ariaLabel: 'すてきですをつける' },
};

// UI で 3 ボタンを並べる順序 (左 → 右)
// 2026-05-27 chimo 指示: おつかれさま → すてき → ナレッジ の順
//   感情寄り (労い・肯定) を先に置き、 ナレッジ (知見) を最後に。
export const REACTION_TYPES_ORDER = [
  'appreciation',
  'endorsement',
  'knowledge',
] as const satisfies ReadonlyArray<JournalReactionType>;
