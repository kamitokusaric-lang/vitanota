# Unit-03 フロントエンドコンポーネント設計

**作成日**: 2026-04-16
**対象ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）
**グラフライブラリ**: Recharts

---

## ページ構成

### /journal（既存ページ拡張）

上部にサマリーカードを追加。既存のタイムライン表示はそのまま維持。

```
+-----------------------------------------------+
| EmotionSummaryCard                            |
| 「直近7日: positive 8 / negative 3 / neutral 2」 |
| [詳細を見る →]                                 |
+-----------------------------------------------+
| (既存) TimelineList / MyJournalList           |
+-----------------------------------------------+
```

### /dashboard/teacher（新規ページ）

```
+-----------------------------------------------+
| ページタイトル: 感情傾向                        |
+-----------------------------------------------+
| PeriodSelector [週] [月] [3ヶ月]               |
+-----------------------------------------------+
| EmotionTrendChart                              |
| (Recharts 折れ線グラフ)                         |
| positive=緑 / negative=赤 / neutral=灰         |
+-----------------------------------------------+
```

---

## コンポーネント一覧

### 1. EmotionTrendChart

**パス**: `src/features/teacher-dashboard/components/EmotionTrendChart.tsx`

**責務**: 感情カテゴリの時系列推移を折れ線グラフで表示

**Props**:
```typescript
type EmotionTrendChartProps = {
  data: EmotionTrendDataPoint[];
};
```

**実装方針**:
- Recharts の `LineChart` + `Line` x3（positive/negative/neutral）
- X軸: 日付（MM/DD 形式）
- Y軸: タグ使用回数
- データがない日は 0 で補完してから Recharts に渡す
- カラー: positive=#22c55e / negative=#ef4444 / neutral=#9ca3af
- Tooltip でホバー時に日付と各カテゴリの件数を表示

---

### 2. PeriodSelector

**パス**: `src/features/teacher-dashboard/components/PeriodSelector.tsx`

**責務**: 期間切り替え（週・月・3ヶ月）

**Props**:
```typescript
type PeriodSelectorProps = {
  value: 'week' | 'month' | 'quarter';
  onChange: (period: 'week' | 'month' | 'quarter') => void;
};
```

**実装方針**:
- ボタングループ（3つのトグルボタン）
- アクティブな期間はハイライト表示

---

### 3. EmotionSummaryCard

**パス**: `src/features/teacher-dashboard/components/EmotionSummaryCard.tsx`

**責務**: /journal ページ上部に配置するサマリーカード

**Props**:
```typescript
type EmotionSummaryCardProps = {
  data: EmotionTrendResponse | undefined;
  isLoading: boolean;
};
```

**実装方針**:
- 直近 week のデータで positive/negative/neutral の合計を表示
- 「詳細を見る」リンクで `/dashboard/teacher` に遷移
- ローディング中はスケルトン表示
- データ不足時（totalEntries < 3）は非表示

---

### 4. EmptyStateGuide

**パス**: `src/features/teacher-dashboard/components/EmptyStateGuide.tsx`

**責務**: データ不足時のガイドメッセージ

**Props**:
```typescript
type EmptyStateGuideProps = {
  currentCount: number;
  minRequired: number;  // = 3
};
```

**表示**: 「記録を続けるとグラフが表示されます（あと N 件）」

---

## カスタムフック

### useEmotionTrend

**パス**: `src/features/teacher-dashboard/hooks/useEmotionTrend.ts`

```typescript
function useEmotionTrend(period: 'week' | 'month' | 'quarter') {
  // SWR で GET /api/private/dashboard/emotion-trend?period=xxx
  // 返り値: { data, error, isLoading }
}
```

---

## 既存コンポーネントへの変更

### EntryForm.tsx（Unit-02 既存）

**変更内容**: タグ選択 UI で感情タグとコンテキストタグをグループ分け表示

- 感情タグ: カテゴリごとにセクション分け（positive / negative / neutral）
- コンテキストタグ: 1セクション
- `tags.type` でフィルタリングして表示を分離

### TagFilter.tsx（Unit-02 既存）

**変更内容**: フィルタ表示でもタグ type でグループ分け

---

## ディレクトリ構造

```
src/features/teacher-dashboard/
├── components/
│   ├── EmotionTrendChart.tsx
│   ├── PeriodSelector.tsx
│   ├── EmotionSummaryCard.tsx
│   └── EmptyStateGuide.tsx
├── hooks/
│   └── useEmotionTrend.ts
└── lib/
    └── emotionTrendService.ts

pages/
├── dashboard/
│   └── teacher.tsx               # 新規
└── journal/
    └── index.tsx                 # 既存（EmotionSummaryCard 追加）
```
