// mood (5 段階感情) のラベル / アイコン / プロンプト集約
// EntryForm の選択 UI と EntryCard の表示で同一のアイコンを使うため共通化
// emoji は通知メールなど text コンテキスト用に保持、UI 表示は Icon component を使う
import { Annoyed, Frown, Meh, Smile, SmilePlus, type LucideIcon } from 'lucide-react';
import type { MoodLevel } from '@/features/journal/schemas/journal';

export interface MoodOption {
  value: MoodLevel;
  emoji: string;
  Icon: LucideIcon;
  label: string;
  caption: string;
  prompts: string[];
}

export const MOOD_OPTIONS: MoodOption[] = [
  {
    value: 'very_positive',
    emoji: '😊',
    Icon: SmilePlus,
    label: 'とても良い',
    caption: 'すごくいい感じでした',
    prompts: [
      'どんなことがよかった?',
      '何が嬉しかった?',
      '今日の良かったこと、一つあげるなら?',
      '誰かに感謝したいこと、ある?',
    ],
  },
  {
    value: 'positive',
    emoji: '🙂',
    Icon: Smile,
    label: '良い',
    caption: 'いい感じでした',
    prompts: [
      'いい感じだったこと、ちょっと教えて',
      '今日、どんなことがスムーズだった?',
      '落ち着いて過ごせた瞬間は?',
      '少し嬉しかったこと、ある?',
    ],
  },
  {
    value: 'neutral',
    emoji: '😐',
    Icon: Meh,
    label: 'ふつう',
    caption: 'ふつうでした',
    prompts: [
      '今日はどんな一日だった?',
      'なんとなく印象に残ってることある?',
      '今日、気になったこと書いておく?',
      'ふと思い出すと、どんな一日?',
    ],
  },
  {
    value: 'negative',
    emoji: '😥',
    Icon: Annoyed,
    label: 'ちょっと大変',
    caption: 'ちょっと大変でした',
    prompts: [
      '何が大変だった?',
      'どこに引っかかった?',
      '少し疲れた場面、どこだった?',
      'うまくいかなかったこと、書いてみる?',
    ],
  },
  {
    value: 'very_negative',
    emoji: '😣',
    Icon: Frown,
    label: 'かなり大変',
    caption: 'かなり大変でした',
    prompts: [
      'ちょっとつらかったことは?',
      'いま、一番重いのはどれ?',
      '誰かに聞いてほしいこと、ある?',
      '無理してない?',
    ],
  },
];

const MOOD_BY_VALUE: Record<MoodLevel, MoodOption> = MOOD_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt;
    return acc;
  },
  {} as Record<MoodLevel, MoodOption>,
);

export function getMoodOption(mood: MoodLevel | null | undefined): MoodOption | null {
  if (!mood) return null;
  return MOOD_BY_VALUE[mood] ?? null;
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
