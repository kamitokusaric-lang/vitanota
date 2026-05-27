// H9 検証 (2026-05-27): 投稿カードの reaction 3 種類のメタ情報。
//   knowledge    : なるほど (Lightbulb、 旧「ナレッジリアクション/参考になった」)
//   appreciation : お疲れ様 (Coffee)
//   endorsement  : いいね (ThumbsUp)
// アイコンは lucide-react に統一 (chimo 決定、 emoji 不使用)。
// 2026-05-27 リリース後微調整: ラベルをカジュアル化 (です/参考になった → 短く)。
import { Lightbulb, Coffee, ThumbsUp, type LucideIcon } from 'lucide-react';
import type { JournalReactionType } from '@/features/journal/schemas/journal';

export interface ReactionMeta {
  Icon: LucideIcon;
  label: string;       // ボタンの tooltip / aria 補助に使う表示文言
  ariaLabel: string;   // ボタンの aria-label (操作意図を伝える)
}

export const REACTION_META: Record<JournalReactionType, ReactionMeta> = {
  knowledge:    { Icon: Lightbulb, label: 'なるほど', ariaLabel: 'なるほどをつける' },
  appreciation: { Icon: Coffee,    label: 'お疲れ様', ariaLabel: 'お疲れ様をつける' },
  endorsement:  { Icon: ThumbsUp,  label: 'いいね',   ariaLabel: 'いいねをつける' },
};

// UI で 3 ボタンを並べる順序 (左 → 右)
// 2026-05-27 chimo 指示: おつかれさま → すてき → ナレッジ の順
//   感情寄り (労い・肯定) を先に置き、 ナレッジ (知見) を最後に。
export const REACTION_TYPES_ORDER = [
  'appreciation',
  'endorsement',
  'knowledge',
] as const satisfies ReadonlyArray<JournalReactionType>;
