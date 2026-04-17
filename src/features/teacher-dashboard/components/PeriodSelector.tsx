interface PeriodSelectorProps {
  value: 'week' | 'month' | 'quarter';
  onChange: (period: 'week' | 'month' | 'quarter') => void;
}

const PERIODS = [
  { key: 'week' as const, label: '週' },
  { key: 'month' as const, label: '月' },
  { key: 'quarter' as const, label: '3ヶ月' },
];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="inline-flex rounded-md shadow-sm" data-testid="period-selector">
      {PERIODS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={[
            'px-4 py-2 text-sm font-medium',
            'first:rounded-l-md last:rounded-r-md',
            'border border-gray-300',
            '-ml-px first:ml-0',
            value === key
              ? 'bg-blue-600 text-white border-blue-600 z-10'
              : 'bg-white text-gray-700 hover:bg-gray-50',
          ].join(' ')}
          data-testid={`period-selector-${key}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
