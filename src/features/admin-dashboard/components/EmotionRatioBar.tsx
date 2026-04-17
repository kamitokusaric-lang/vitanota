interface EmotionRatioBarProps {
  positive: number;
  negative: number;
  neutral: number;
}

export function EmotionRatioBar({ positive, negative, neutral }: EmotionRatioBarProps) {
  const total = positive + negative + neutral;

  if (total === 0) {
    return (
      <div className="h-2 w-full rounded-full bg-gray-200" data-testid="emotion-ratio-bar-empty" />
    );
  }

  const pPct = (positive / total) * 100;
  const nPct = (negative / total) * 100;
  const neuPct = (neutral / total) * 100;

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full" data-testid="emotion-ratio-bar">
      {pPct > 0 && (
        <div className="bg-green-500" style={{ width: `${pPct}%` }} data-testid="emotion-ratio-positive" />
      )}
      {neuPct > 0 && (
        <div className="bg-gray-400" style={{ width: `${neuPct}%` }} data-testid="emotion-ratio-neutral" />
      )}
      {nPct > 0 && (
        <div className="bg-red-500" style={{ width: `${nPct}%` }} data-testid="emotion-ratio-negative" />
      )}
    </div>
  );
}
