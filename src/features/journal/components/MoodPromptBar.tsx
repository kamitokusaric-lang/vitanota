// 投稿入口: 3 種別アイコン (今日の日誌 / ナレッジノート / 軽いつぶやき)。
// 設計指針 (2026-05-04 chimo): "UI を作る" でなく "反応を置く"。塗り潰し
// しない / サイズ変えない、静かに存在する形に倒す。
// アイコンクリックで onPick (呼び出し側でそれぞれの Modal を開く想定)。
// 上部の声かけ文言は dashboard PhilosophyGreeting に移管 (重複防止)。
import { Pencil, Lightbulb, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { JournalEntryKind } from '@/features/journal/schemas/journal';

interface KindOption {
  value: JournalEntryKind;
  label: string;
  Icon: LucideIcon;
}

const KIND_OPTIONS: KindOption[] = [
  { value: 'diary', label: '今日の日誌', Icon: Pencil },
  { value: 'knowledge', label: 'ナレッジノート', Icon: Lightbulb },
  { value: 'tweet', label: '軽いつぶやき', Icon: MessageCircle },
];

interface MoodPromptBarProps {
  onPick: (kind: JournalEntryKind) => void;
}

export function MoodPromptBar({ onPick }: MoodPromptBarProps) {
  return (
    <div className="inline-flex max-w-[600px] flex-col items-start gap-3 pb-4 pt-1">
      {/* 3 kind アイコン (48px / icon 20px / gap 12px、個別 delay の bob アニメ) */}
      <div
        className="flex items-center gap-3"
        role="menu"
        data-testid="mood-prompt-bar"
      >
        {KIND_OPTIONS.map((opt: KindOption, idx) => {
          const Icon = opt.Icon;
          return (
            <div
              key={opt.value}
              className="flex flex-col items-center gap-1 motion-safe:animate-bob"
              style={{ animationDelay: `${idx * 160}ms` }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => onPick(opt.value)}
                aria-label={opt.label}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-vn-border bg-vn-surface text-gray-700 hover:bg-vn-muted-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-vn-accent/40"
                data-testid={`mood-prompt-pick-${opt.value}`}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden />
              </button>
              <span
                className="text-[11px] font-medium text-gray-600"
                data-testid={`mood-prompt-label-${opt.value}`}
              >
                {opt.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
