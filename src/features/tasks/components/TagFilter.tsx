// タスクのタグ絞込 (全タグ / 特定タグ)
import type { TaskTag } from '../hooks/useTaskTags';

interface TagFilterProps {
  value: string | undefined; // undefined = 全タグ / tagId = 特定タグ
  onChange: (value: string | undefined) => void;
  tags: TaskTag[];
}

export function TagFilter({ value, onChange, tags }: TagFilterProps) {
  const currentValue = value ?? '__all__';

  return (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <span>タグ:</span>
      <select
        value={currentValue}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next === '__all__' ? undefined : next);
        }}
        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
        data-testid="tag-filter-select"
      >
        <option value="__all__">全タグ</option>
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            #{t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
