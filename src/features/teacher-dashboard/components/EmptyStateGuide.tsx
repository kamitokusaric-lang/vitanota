interface EmptyStateGuideProps {
  currentCount: number;
  minRequired: number;
}

export function EmptyStateGuide({
  currentCount,
  minRequired,
}: EmptyStateGuideProps) {
  const remaining = Math.max(0, minRequired - currentCount);

  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center"
      data-testid="empty-state-guide"
    >
      <p className="text-lg font-medium text-gray-600">
        記録を続けるとグラフが表示されます
      </p>
      <p className="mt-2 text-sm text-gray-400">
        あと {remaining} 件の記録が必要です
      </p>
    </div>
  );
}
