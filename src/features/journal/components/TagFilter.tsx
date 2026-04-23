// PP-U02-01: クライアントサイドタグフィルタ (useMemo + includes)
// 感情タグ (emotion_tags) を category (positive/negative/neutral) でグループ表示
// 0016 で context は廃止、task_categories に役割移譲
import { useMemo } from 'react';
import type { EmotionTag } from '@/db/schema';

interface TagFilterProps {
  tags: EmotionTag[];
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
};

function getTagStyle(tag: EmotionTag, isSelected: boolean): string {
  const base = 'rounded-full px-3 py-1 text-xs font-medium transition-colors';
  const styles = CATEGORY_STYLES[tag.category] ?? CATEGORY_STYLES.neutral;
  return `${base} ${isSelected ? styles.selected : styles.normal}`;
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

  const emotionGroups = useMemo(() => {
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

  const renderTagButton = (tag: EmotionTag) => {
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
