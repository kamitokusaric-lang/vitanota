// mood (5 段階感情) のラベル / アイコン / プロンプト集約
// EntryForm の選択 UI と EntryCard の表示で同一のアイコンを使うため共通化
// emoji は通知メールなど text コンテキスト用に保持、UI 表示は Icon component を使う
import { Frown, Meh, Smile, type LucideIcon } from 'lucide-react';
import type { MoodLevel } from '@/features/journal/schemas/journal';

export interface MoodOption {
  value: MoodLevel;
  emoji: string;
  Icon: LucideIcon;
  label: string;
  caption: string;
  prompts: string[];
}

// 2026-05-27 chimo 指示: mood UI を 5 → 3 種化「良い / ふつう / 大変」。
// DB enum は 5 値そのまま温存 (revert 可能)、 既存データは fallback で 3 値にマッピング表示。
export const MOOD_OPTIONS: MoodOption[] = [
  {
    value: 'positive',
    emoji: '🙂',
    Icon: Smile,
    label: 'いい感じ',
    caption: 'いい感じでした',
    prompts: [
      'いい感じだったこと、ちょっと教えて',
      '何が嬉しかった?',
      '誰かに感謝したいこと、ある?',
    ],
  },
  {
    value: 'neutral',
    emoji: '😐',
    Icon: Meh,
    label: 'いつも通り',
    caption: 'いつも通りでした',
    prompts: [
      '今日はどんな一日だった?',
      'なんとなく印象に残ってることある?',
      '今日、気になったこと書いておく?',
      'ふと思い出すと、どんな一日?',
    ],
  },
  {
    value: 'negative',
    emoji: '😣',
    Icon: Frown,
    label: 'ちょっと大変',
    caption: 'ちょっと大変でした',
    prompts: [
      '少し疲れた場面、どこだった?',
      'うまくいかなかったこと、書いてみる?',
      '誰かに聞いてほしいこと、ある?',
      '無理してない?',
    ],
  },
];

// 既存データ fallback: very_positive → positive、 very_negative → negative として表示扱い。
// 投稿時の選択肢からは外れたが、 DB 上の旧 5 値データを timeline で見せる必要があるため。
const MOOD_FALLBACK: Partial<Record<MoodLevel, MoodLevel>> = {
  very_positive: 'positive',
  very_negative: 'negative',
};

const MOOD_BY_VALUE: Record<string, MoodOption> = MOOD_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt;
    return acc;
  },
  {} as Record<string, MoodOption>,
);

export function getMoodOption(mood: MoodLevel | null | undefined): MoodOption | null {
  if (!mood) return null;
  const normalized = MOOD_FALLBACK[mood] ?? mood;
  return MOOD_BY_VALUE[normalized] ?? null;
}

export function getMoodEmoji(mood: MoodLevel | null | undefined): string | null {
  return getMoodOption(mood)?.emoji ?? null;
}

export function getMoodIcon(
  mood: MoodLevel | null | undefined,
): LucideIcon | null {
  return getMoodOption(mood)?.Icon ?? null;
}

export function getMoodLabel(mood: MoodLevel | null | undefined): string | null {
  return getMoodOption(mood)?.label ?? null;
}

// 選んだ mood に紐づく問いかけ文 (mood ごとに 4 つ用意済) からランダムに 1 件
// 例: positive → "いい感じだったこと、ちょっと教えて" / "今日、どんなことがスムーズだった?" 等
export function pickRandomPromptFor(
  mood: MoodLevel | null | undefined,
): string {
  const opt = getMoodOption(mood);
  if (!opt || opt.prompts.length === 0) return '';
  return opt.prompts[Math.floor(Math.random() * opt.prompts.length)];
}
