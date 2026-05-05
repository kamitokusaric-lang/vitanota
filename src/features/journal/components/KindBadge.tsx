// 投稿種別バッジ (日誌 / ナレッジ / つぶやき)
// EntryCard / TimelineTab の chip filter で使用、表示は控えめ (グレー bg + 小アイコン)
import {
  Pencil,
  Lightbulb,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import type { JournalEntryKind } from '@/features/journal/schemas/journal';

interface KindMeta {
  Icon: LucideIcon;
  label: string;
}

export const KIND_META: Record<JournalEntryKind, KindMeta> = {
  diary: { Icon: Pencil, label: '日誌' },
  knowledge: { Icon: Lightbulb, label: 'ナレッジ' },
  tweet: { Icon: MessageCircle, label: 'つぶやき' },
};

interface KindBadgeProps {
  kind: JournalEntryKind;
}

export function KindBadge({ kind }: KindBadgeProps) {
  const { Icon, label } = KIND_META[kind];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-vn-muted-bg px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
      data-testid={`kind-badge-${kind}`}
    >
      <Icon size={10} strokeWidth={1.75} aria-hidden />
      {label}
    </span>
  );
}
