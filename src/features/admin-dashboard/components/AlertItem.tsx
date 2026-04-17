import type { AlertListItem } from '../lib/alertService';

interface AlertItemProps {
  alert: AlertListItem;
  onClose: (alertId: string) => void;
  isClosing: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  negative_trend: 'ネガティブ傾向',
  recording_gap: '記録途絶',
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function AlertItem({ alert, onClose, isClosing }: AlertItemProps) {
  return (
    <div
      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
      data-testid={`alert-item-${alert.id}`}
    >
      <div>
        <div className="flex items-center gap-2">
          <span
            className={[
              'inline-block h-2 w-2 rounded-full',
              alert.type === 'negative_trend' ? 'bg-red-500' : 'bg-yellow-500',
            ].join(' ')}
          />
          <span className="font-medium text-gray-900">{alert.teacherName}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            {TYPE_LABELS[alert.type] ?? alert.type}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">{formatDate(alert.createdAt)}</p>
      </div>
      <button
        type="button"
        onClick={() => onClose(alert.id)}
        disabled={isClosing}
        className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
        data-testid={`alert-close-${alert.id}`}
      >
        対応済みにする
      </button>
    </div>
  );
}
