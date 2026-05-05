// 投稿入口: テキスト挨拶 + 3 種別アイコン (今日の日誌 / ナレッジ共有 / 軽いつぶやき)。
// 設計指針 (2026-05-04 chimo): "UI を作る" でなく "反応を置く"。塗り潰し
// しない / サイズ変えない、静かに存在する形に倒す。
// アイコンクリックで onPick (呼び出し側でそれぞれの Modal を開く想定)。
import { useEffect, useState } from 'react';
import { Pencil, Lightbulb, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { pickRandomFiveCharGreeting } from '@/features/journal/lib/mood-prompts';
import type { JournalEntryKind } from '@/features/journal/schemas/journal';

interface KindOption {
  value: JournalEntryKind;
  label: string;
  Icon: LucideIcon;
}

const KIND_OPTIONS: KindOption[] = [
  { value: 'diary', label: '今日の日誌', Icon: Pencil },
  { value: 'knowledge', label: 'ナレッジ共有', Icon: Lightbulb },
  { value: 'tweet', label: '軽いつぶやき', Icon: MessageCircle },
];

interface MoodPromptBarProps {
  onPick: (kind: JournalEntryKind) => void;
}

const INITIAL_GREETING = 'おはよう!';

export function MoodPromptBar({ onPick }: MoodPromptBarProps) {
  // SSR とクライアント最初のレンダーで一致させるため初期値は固定文言、
  // マウント後にクライアントだけ時間帯別ランダム挨拶に置き換える。
  // 加えて 3 分ごとに文言を入れ替える (時間帯境界を跨ぐと自然と朝→昼→夕の
  // 語り口にも追従する)。
  const [greeting, setGreeting] = useState<string>(INITIAL_GREETING);
  useEffect(() => {
    setGreeting(pickRandomFiveCharGreeting());
    const timer = setInterval(
      () => {
        setGreeting(pickRandomFiveCharGreeting());
      },
      3 * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="inline-flex max-w-[600px] flex-col items-start gap-3 pb-4 pt-1">
      {/* テキスト挨拶: 18px / 500 / #222、軽く置く (会話感) */}
      <span
        className="px-2 text-lg font-semibold leading-none text-gray-900 motion-safe:animate-bob"
        style={{ animationDelay: '320ms' }}
        data-testid="mood-prompt-greeting"
      >
        {greeting}
      </span>

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
