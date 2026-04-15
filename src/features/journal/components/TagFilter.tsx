// PP-U02-01: クライアントサイドタグフィルタ（useMemo + includes）
// NFR-U02-01: 20件上限 + テキスト入力フィルタ
import { useMemo, useState } from 'react';
import type { Tag } from '@/db/schema';

interface TagFilterProps {
  tags: Tag[];
  selectedTagIds: string[];
  onChange: (selectedIds: string[]) => void;
  maxInitialDisplay?: number;
}

export function TagFilter({
  tags,
  selectedTagIds,
  onChange,
  maxInitialDisplay = 20,
}: TagFilterProps) {
  const [query, setQuery] = useState('');

  // sort_order → name 順にソート（tagRepo と同じ並び）
  const sortedTags = useMemo(
    () =>
      [...tags].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      }),
    [tags]
  );

  // クライアントサイドフィルタ（PP-U02-01）
  const filteredTags = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return sortedTags.slice(0, maxInitialDisplay);
    }
    return sortedTags.filter((t) => t.name.toLowerCase().includes(normalized));
  }, [sortedTags, query, maxInitialDisplay]);

  const showFilter = sortedTags.length > maxInitialDisplay;

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      if (selectedTagIds.length >= 10) return; // NFR-U02-05: 最大10件
      onChange([...selectedTagIds, tagId]);
    }
  };

  return (
    <div data-testid="tag-filter">
      {showFilter && (
        <input
          type="text"
          placeholder="タグを検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          data-testid="tag-filter-input"
        />
      )}
      <div className="flex flex-wrap gap-2" data-testid="tag-filter-list">
        {filteredTags.length === 0 && (
          <span className="text-sm text-gray-400">
            該当するタグがありません
          </span>
        )}
        {filteredTags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id);
          const classes = [
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            isSelected
              ? 'bg-blue-600 text-white'
              : tag.isEmotion
              ? 'border border-pink-300 bg-pink-50 text-pink-700 hover:bg-pink-100'
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
          ].join(' ');
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={classes}
              data-testid={`tag-filter-${tag.id}`}
            >
              {tag.name}
            </button>
          );
        })}
      </div>
      {selectedTagIds.length > 0 && (
        <p
          className="mt-2 text-xs text-gray-500"
          data-testid="tag-filter-count"
        >
          {selectedTagIds.length} / 10 件選択中
        </p>
      )}
    </div>
  );
}
