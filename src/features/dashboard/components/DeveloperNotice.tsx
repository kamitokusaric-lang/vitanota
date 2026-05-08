// dashboard 最上部の「開発者から」セクション (announcements.ts の最新 1 件を表示)
// dismiss なし・最新 1 件のみ。グレー基調 + 青 1 点 (vn-accent) のラベル。
import { getLatestAnnouncement } from '@/features/dashboard/lib/announcements';

export function DeveloperNotice() {
  const latest = getLatestAnnouncement();
  if (!latest) return null;
  return (
    <section
      className="mb-4 rounded-vn border border-vn-border bg-vn-surface px-4 py-3"
      data-testid="developer-notice"
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-vn-accent">
          開発者から
        </span>
        <span className="text-[11px] text-vn-muted">{latest.date}</span>
      </div>
      <h2 className="mb-2 text-sm font-semibold text-[#111]">{latest.title}</h2>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-gray-700">
        {latest.body.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
