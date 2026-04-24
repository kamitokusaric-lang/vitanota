// タスクのカテゴリ絞込 (全カテゴリ / 特定カテゴリ)
import type { TaskCategory } from '@/db/schema';

interface CategoryFilterProps {
  value: string | undefined; // undefined = 全カテゴリ
  onChange: (value: string | undefined) => void;
  categories: TaskCategory[];
}

export function CategoryFilter({
  value,
  onChange,
  categories,
}: CategoryFilterProps) {
  const currentValue = value ?? '__all__';

  return (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <span>カテゴリ:</span>
      <select
        value={currentValue}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === '__all__' ? undefined : next);
        }}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
        data-testid="category-filter-select"
      >
        <option value="__all__">すべて</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
