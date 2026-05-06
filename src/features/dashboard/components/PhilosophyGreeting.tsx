// dashboard 上部の哲学格言セクション ("静かに読む UI")
// chimo の UI 指針:
//   - 1 画面 1 メッセージ・上下スカスカの余白・中央寄せ
//   - 明朝フォント (重み + 静けさ)
//   - 本文 18-22px / 行間 1.8-2.2 / 名前 12-14px (#888)
//   - フェードイン (0.3-0.5 秒) — opacity 0 → 100 で表現 (Tailwind 標準 utilities で完結)
//   - 切替: 3 分ごと (chimo 指示)
import { useEffect, useState } from 'react';
import {
  pickRandomGreeting,
  type Greeting,
} from '@/features/journal/lib/mood-prompts';
import { MoodPromptBar } from '@/features/journal/components/MoodPromptBar';
import type { JournalEntryKind } from '@/features/journal/schemas/journal';

// SSR とクライアント初回レンダーで一致させるための固定初期値
const INITIAL_GREETING: Greeting = {
  text: '汝自身を知れ',
  author: 'デルポイ神殿の格言',
};

const SERIF_FAMILY =
  '"Noto Serif JP", "Yu Mincho", YuMincho, "Hiragino Mincho ProN", "Hiragino Mincho Pro", serif';

interface PhilosophyGreetingProps {
  onPick: (kind: JournalEntryKind) => void;
}

export function PhilosophyGreeting({ onPick }: PhilosophyGreetingProps) {
  const [greeting, setGreeting] = useState<Greeting>(INITIAL_GREETING);
  // フェードイン: greeting が変わるたびに opacity 0 → 100
  const [shown, setShown] = useState(false);

  // mount 後にランダム選定 + 3 分ごと切替
  useEffect(() => {
    setGreeting(pickRandomGreeting());
    const t = setInterval(
      () => {
        setGreeting(pickRandomGreeting());
      },
      3 * 60 * 1000,
    );
    return () => clearInterval(t);
  }, []);

  // 文言変更のたびにフェードイン再発火 (opacity 0 → 100)
  useEffect(() => {
    setShown(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setShown(true));
    });
    return () => cancelAnimationFrame(id);
  }, [greeting.text, greeting.author]);

  return (
    <section
      className={`flex flex-col items-center justify-center py-0 text-center transition-opacity duration-500 ease-out ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ fontFamily: SERIF_FAMILY }}
      data-testid="philosophy-greeting"
    >
      <p
        className="px-4 text-[20px] leading-loose text-[#111] sm:text-[22px]"
        data-testid="philosophy-greeting-text"
      >
        <span>{greeting.text}</span>
        <span
          className="ml-3 text-[13px] text-[#888]"
          data-testid="philosophy-greeting-author"
        >
          — {greeting.author}
        </span>
      </p>
      {/* 投稿入口 (3 アイコン) を格言の下に。MoodPromptBar 自体は左寄せ設計なので
          wrapper で中央配置だけ与える */}
      <div className="mt-4 flex justify-center">
        <MoodPromptBar onPick={onPick} />
      </div>
    </section>
  );
}
