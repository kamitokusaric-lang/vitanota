import Link from 'next/link';

interface AlertBannerProps {
  openCount: number;
}

export function AlertBanner({ openCount }: AlertBannerProps) {
  if (openCount === 0) return null;

  return (
    <div
      className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3"
      data-testid="alert-banner"
    >
      <span className="text-sm font-medium text-red-800">
        {openCount} 件のアラートがあります
      </span>
      <Link
        href="/dashboard/admin/alerts"
        className="text-sm text-red-600 hover:text-red-800 hover:underline"
        data-testid="alert-banner-link"
      >
        アラート一覧を見る
      </Link>
    </div>
  );
}
