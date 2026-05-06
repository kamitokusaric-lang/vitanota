// 投稿者アバター: ニックネーム/名前の頭文字 + user_id ハッシュベースの淡い色背景
// "面で分ける、箱で区切らない" 指針に沿って、写真でも border でもない控えめな円
// memory 踏み絵: "個" の見える化を強めすぎず、教員同士の親しみだけを補助する役割
import { memo } from 'react';

interface AuthorAvatarProps {
  userId: string;
  name?: string | null;
  nickname?: string | null;
  size?: number; // px、デフォルト 28
}

// 8 色の淡いトーン (Tailwind の 100-200 階調イメージ)
// border / text-color は親側で contrast 用に変えやすいよう bg + text セットで持つ
const PALETTE = [
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-lime-100', text: 'text-lime-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  { bg: 'bg-sky-100', text: 'text-sky-700' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function pickColor(userId: string): (typeof PALETTE)[number] {
  return PALETTE[hashString(userId) % PALETTE.length]!;
}

function pickInitial(name: string | null | undefined, nickname: string | null | undefined): string {
  const source = (nickname || name || '').trim();
  if (!source) return '?';
  // 先頭の grapheme を 1 文字。Intl.Segmenter があれば理想だが、emoji/CJK でも 1 char で十分
  const first = Array.from(source)[0];
  return first ?? '?';
}

export const AuthorAvatar = memo(function AuthorAvatar({
  userId,
  name,
  nickname,
  size = 28,
}: AuthorAvatarProps) {
  const initial = pickInitial(name, nickname);
  const color = pickColor(userId);
  const fontSize = Math.round(size * 0.45);
  return (
    <span
      role="img"
      aria-label={nickname || name || '投稿者'}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${color.bg} ${color.text}`}
      style={{ width: size, height: size, fontSize }}
      data-testid={`author-avatar-${userId}`}
    >
      {initial}
    </span>
  );
});
