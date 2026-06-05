# Unit-03 論理コンポーネント

**作成日**: 2026-04-16
**対象ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）

---

## コンポーネント構成

Unit-03 は新規の論理インフラコンポーネント（キュー・キャッシュ・サーキットブレーカー等）を追加しない。既存のコンポーネント構成の中に新しいサービスとページを追加する。

---

## 依存グラフ

```
pages/dashboard/teacher.tsx
  └── useEmotionTrend (SWR hook)
        └── GET /api/private/dashboard/emotion-trend
              └── requireAuth()
                    └── withTenantUser()
                          └── EmotionTrendService.getEmotionTrend()
                                └── DB: journal_entries
                                     JOIN journal_entry_tags
                                     JOIN tags (type='emotion')
                                     [RLS 適用]

pages/journal/index.tsx (既存・拡張)
  └── EmotionSummaryCard
        └── useEmotionTrend('week')  ← 同じフックを共有
```

---

## 新規コンポーネント一覧

| コンポーネント | 種別 | 配置先 |
|---|---|---|
| EmotionTrendService | バックエンド・サービス | `src/features/teacher-dashboard/lib/` |
| emotion-trend API | API Route | `pages/api/private/dashboard/` |
| EmotionTrendChart | フロントエンド | `src/features/teacher-dashboard/components/` |
| PeriodSelector | フロントエンド | `src/features/teacher-dashboard/components/` |
| EmotionSummaryCard | フロントエンド | `src/features/teacher-dashboard/components/` |
| EmptyStateGuide | フロントエンド | `src/features/teacher-dashboard/components/` |
| useEmotionTrend | カスタムフック | `src/features/teacher-dashboard/hooks/` |
| teacher.tsx | ページ | `pages/dashboard/` |

---

## 既存コンポーネントへの変更

| コンポーネント | 変更内容 |
|---|---|
| `src/db/schema.ts` | tags テーブルに `type` enum + `category` enum 追加、`is_emotion` 削除 |
| `src/features/journal/components/EntryForm.tsx` | タグ選択 UI でタグ type ごとにグループ分け表示 |
| `src/features/journal/components/TagFilter.tsx` | フィルタ表示でタグ type ごとにグループ分け |
| `src/features/journal/lib/tagRepository.ts` | シードデータを新タグ 23個に更新 |
| `pages/journal/index.tsx` | EmotionSummaryCard を上部に追加 |
| `src/shared/components/Layout.tsx` | ナビゲーションに「感情傾向」リンク追加 |

---

## インフラへの影響

Unit-03 はインフラ構成に変更を加えない。

| 項目 | 影響 |
|---|---|
| DB | マイグレーション追加のみ（enum 型 + カラム追加 + データ変換） |
| App Runner | 変更なし |
| RDS Proxy | 変更なし |
| CloudFront | 変更なし（`/dashboard/*` は既存パスパターンでカバー） |
| CDK | 変更なし |
