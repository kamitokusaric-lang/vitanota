// PP-U02-01: クライアントサイドタグフィルタ
// category 見出し付きグループ表示 (ポジティブ / ちょっと大変 / 状態)
// 色はカテゴリ問わず同一 (選択中: 青、非選択: 薄灰) で、視覚的な
// カテゴリ差異を出さない (観測されてる感を薄める配慮)
import { useMemo } from 'react';
import type { EmotionTag } from '@/db/schema';

interface TagFilterProps {
  tags: EmotionTag[];
  selectedTagIds: string[];
  onChange: (selectedIds: string[]) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  positive: 'ポジティブ',
  negative: 'ちょっと大変',
  neutral: '状態',
};

const CATEGORY_ORDER = ['positive', 'negative', 'neutral'] as const;

function getTagStyle(isSelected: boolean): string {
  const base =
    'rounded-full px-3 py-1 text-xs font-medium transition-colors';
  return isSelected
    ? `${base} bg-blue-600 text-white`
    : `${base} border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100`;
}

export function TagFilter({
  tags,
  selectedTagIds,
  onChange,
}: TagFilterProps) {
  const sortedTags = useMemo(
    () =>
      [...tags].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      }),
    [tags]
  );

  const groups = useMemo(() => {
    const grouped: Record<string, EmotionTag[]> = {};
    for (const tag of sortedTags) {
      const cat = tag.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tag);
    }
    return grouped;
  }, [sortedTags]);

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  return (
    <div data-testid="tag-filter">
      {sortedTags.length > 0 ? (
        <div
          className="space-y-3"
          data-testid="entry-form-emotion-tags"
        >
          {CATEGORY_ORDER.map((cat) => {
            const group = groups[cat];
            if (!group || group.length === 0) return null;
            return (
              <div key={cat}>
                <p className="mb-1 text-xs font-medium text-gray-500">
                  {CATEGORY_LABEL[cat]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={getTagStyle(isSelected)}
                        data-testid={`tag-filter-${tag.id}`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <span className="text-sm text-gray-400">
          該当するタグがありません
        </span>
      )}

      {selectedTagIds.length > 0 && (
        <p
          className="mt-2 text-xs text-gray-500"
          data-testid="tag-filter-count"
        >
          {selectedTagIds.length} 件選択中
        </p>
      )}
    </div>
  );
}
