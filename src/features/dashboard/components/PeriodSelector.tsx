// 学校エンゲージメントの期間選択 (1週間 / 1ヶ月 / 3ヶ月)
import {
  PERIOD_LABEL,
  type PeriodKey,
} from '@/features/dashboard/lib/schoolDashboardService';

interface PeriodSelectorProps {
  value: PeriodKey;
  onChange: (value: PeriodKey) => void;
}

const KEYS: PeriodKey[] = ['1w', '1m', '3m'];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div
      role="group"
      aria-label="期間選択"
      className="flex items-center gap-2"
    >
      <span className="text-xs text-gray-500">期間:</span>
      <div className="flex gap-1">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              value === k
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
            ].join(' ')}
            data-testid={`period-selector-${k}`}
          >
            {PERIOD_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
