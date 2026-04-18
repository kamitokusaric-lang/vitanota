import Link from 'next/link';

interface AlertBannerProps {
  openCount: number;
}

export function AlertBanner({ openCount }: AlertBannerProps) {
  if (openCount === 0) return null;

  return (
    <div
      className="mb-4 flex items-center justify-between rounded-vn border border-vn-border bg-vn-red-bg px-5 py-3"
      data-testid="alert-banner"
    >
      <span className="text-sm font-medium text-vn-red">
        {openCount} 件のアラートがあります
      </span>
      <Link
        href="/dashboard/admin/alerts"
        className="text-sm text-vn-red hover:underline"
        data-testid="alert-banner-link"
      >
        アラート一覧を見る
      </Link>
    </div>
  );
}
