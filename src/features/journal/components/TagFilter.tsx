// PP-U02-01: クライアントサイドタグフィルタ（useMemo + includes）
// NFR-U02-01: 20件上限 + テキスト入力フィルタ
// Unit-03: タグを type (emotion/context) + category でグループ表示
import { useMemo } from 'react';
import type { Tag } from '@/db/schema';

interface TagFilterProps {
  tags: Tag[];
  selectedTagIds: string[];
  onChange: (selectedIds: string[]) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  positive: 'ポジティブ',
  negative: 'ネガティブ',
  neutral: 'ニュートラル',
};

const CATEGORY_STYLES: Record<string, { normal: string; selected: string }> = {
  positive: {
    normal: 'border border-green-300 bg-green-50 text-green-700 hover:bg-green-100',
    selected: 'bg-green-600 text-white',
  },
  negative: {
    normal: 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
    selected: 'bg-red-600 text-white',
  },
  neutral: {
    normal: 'border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100',
    selected: 'bg-gray-600 text-white',
  },
  context: {
    normal: 'border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100',
    selected: 'bg-blue-600 text-white',
  },
};

function getTagStyle(tag: Tag, isSelected: boolean): string {
  const base = 'rounded-full px-3 py-1 text-xs font-medium transition-colors';
  const key = tag.type === 'emotion' ? (tag.category ?? 'neutral') : 'context';
  const styles = CATEGORY_STYLES[key] ?? CATEGORY_STYLES.context;
  return `${base} ${isSelected ? styles.selected : styles.normal}`;
}

export function TagFilter({
  tags,
  selectedTagIds,
  onChange,
}: TagFilterProps) {
  // sort_order → name 順にソート（tagRepo と同じ並び）
  const sortedTags = useMemo(
    () =>
      [...tags].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name);
      }),
    [tags]
  );

  // Unit-03: タグをグループ分け（emotion: category 別、context: 1グループ）
  const emotionGroups = useMemo(() => {
    const emotions = sortedTags.filter((t) => t.type === 'emotion');
    const grouped: Record<string, Tag[]> = {};
    for (const tag of emotions) {
      const cat = tag.category ?? 'neutral';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tag);
    }
    return grouped;
  }, [sortedTags]);

  const contextTags = useMemo(
    () => sortedTags.filter((t) => t.type === 'context'),
    [sortedTags]
  );

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  const renderTagButton = (tag: Tag) => {
    const isSelected = selectedTagIds.includes(tag.id);
    return (
      <button
        key={tag.id}
        type="button"
        onClick={() => toggleTag(tag.id)}
        className={getTagStyle(tag, isSelected)}
        data-testid={`tag-filter-${tag.id}`}
      >
        {tag.name}
      </button>
    );
  };

  return (
    <div data-testid="tag-filter">
      {/* 感情タグ */}
      {Object.keys(emotionGroups).length > 0 && (
        <div className="mb-3" data-testid="entry-form-emotion-tags">
          <p className="mb-1 text-xs font-semibold text-gray-500">感情タグ</p>
          {(['positive', 'negative', 'neutral'] as const).map((cat) => {
            const group = emotionGroups[cat];
            if (!group || group.length === 0) return null;
            return (
              <div key={cat} className="mb-2">
                <p className="mb-1 text-xs text-gray-400">
                  {CATEGORY_LABELS[cat]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.map(renderTagButton)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* コンテキストタグ */}
      {contextTags.length > 0 && (
        <div data-testid="entry-form-context-tags">
          <p className="mb-1 text-xs font-semibold text-gray-500">
            コンテキストタグ
          </p>
          <div className="flex flex-wrap gap-2">
            {contextTags.map(renderTagButton)}
          </div>
        </div>
      )}

      {sortedTags.length === 0 && (
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
