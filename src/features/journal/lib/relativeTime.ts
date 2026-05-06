// 相対時刻フォーマッタ (Linear Updates 風)
//   < 1 分     → "たった今"
//   < 1 時間   → "X 分前"
//   < 24 時間  → "X 時間前"
//   < 7 日     → "X 日前"
//   それ以上   → "M月D日"
// 絶対時刻 (tooltip 用) は formatAbsoluteTime で別途提供

export function formatRelativeTime(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'たった今';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatAbsoluteTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
