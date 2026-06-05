# Unit-03 コード生成サマリー

**生成日**: 2026-04-17
**対応ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）
**テスト件数**: 177 件 GREEN（Unit-01 22 + Unit-02 120 + Unit-03 17 + Layout 修正 18）

## 構造

```
src/
├── db/
│   └── schema.ts                     # tagTypeEnum / emotionCategoryEnum 追加、isEmotion 削除
├── features/
│   ├── journal/
│   │   ├── schemas/
│   │   │   └── tag.ts                # type enum + category enum + refine バリデーション
│   │   ├── lib/
│   │   │   └── tagRepository.ts      # SYSTEM_DEFAULT_TAGS 23個に更新、type/category 対応
│   │   └── components/
│   │       ├── TagFilter.tsx          # emotion/context グループ分け + カテゴリ別セクション + 色分け
│   │       └── EntryCard.tsx          # type/category 対応
│   └── teacher-dashboard/            # 新規ディレクトリ (Unit-03)
│       ├── schemas/
│       │   └── emotionTrend.ts       # EmotionTrendDataPoint / EmotionTrendResponse 型
│       ├── lib/
│       │   └── emotionTrendService.ts # getEmotionTrend() 集計クエリ + JST 日付処理
│       ├── hooks/
│       │   └── useEmotionTrend.ts    # SWR フック
│       └── components/
│           ├── EmotionTrendChart.tsx  # Recharts LineChart (positive/negative/neutral)
│           ├── PeriodSelector.tsx     # 週・月・3ヶ月トグル
│           ├── EmotionSummaryCard.tsx # /journal 上部のサマリーカード
│           └── EmptyStateGuide.tsx    # データ不足時ガイド
└── shared/
    └── components/
        └── Layout.tsx                # ナビに「タイムライン」「感情傾向」リンク追加

pages/
├── api/
│   └── private/
│       └── dashboard/
│           └── emotion-trend.ts      # GET /api/private/dashboard/emotion-trend
├── dashboard/
│   └── teacher.tsx                   # リダイレクト → 感情傾向ダッシュボードに変更
└── journal/
    └── index.tsx                     # EmotionSummaryCard 追加

migrations/
├── 0010_unit03_tag_type_category.sql # tag_type/emotion_category enum + カラム変更 + CHECK 制約
└── 0011_unit03_default_tags_v2.sql   # 全テナントに 23 タグをシード

__tests__/
├── unit/ (既存テスト修正)
│   ├── Layout.test.tsx               # ナビ変更に対応
│   ├── TagFilter.test.tsx            # type/category 対応
│   ├── tagRepository.test.ts         # SYSTEM_DEFAULT_TAGS 更新対応
│   ├── tagService.test.ts            # CreateTagParams 更新対応
│   ├── schemas/tag.test.ts           # createTagSchema 更新対応
│   └── EntryCard.test.tsx            # type/category 対応
└── integration/
    └── emotion-trend.test.ts         # 新規: 感情傾向 API 統合テスト (8 tests)
```

## 主要な実装決定

### 1. tags スキーマ変更

| 変更 | 詳細 |
|---|---|
| `is_emotion` boolean → `type` enum | `tag_type` enum ('emotion' / 'context') |
| 新規 `category` カラム | `emotion_category` enum ('positive' / 'negative' / 'neutral') |
| CHECK 制約 | emotion → category NOT NULL、context → category NULL |
| インデックス | `tags_tenant_emotion_idx` → `tags_tenant_type_idx` |

### 2. 感情傾向集計

- 3テーブル JOIN (journal_entries + journal_entry_tags + tags) + FILTER(WHERE) で category 別集計
- `AT TIME ZONE 'Asia/Tokyo'` で日本時間の日付に GROUP BY
- withTenantUser() 経由で RLS 適用（本人データのみ）

### 3. システムデフォルトタグ更新

旧 8個 → 新 23個（感情 15 + コンテキスト 8）。既存テナントへは `ON CONFLICT DO NOTHING` で冪等にシード。

### 4. UI グループ化

TagFilter コンポーネントで感情タグ（positive/negative/neutral セクション別）とコンテキストタグをグループ分け表示。カテゴリごとに色分け（green/red/gray/blue）。

## 関連ドキュメント

- 機能設計: `aidlc-docs/construction/unit-03/functional-design/`
- NFR要件: `aidlc-docs/construction/unit-03/nfr-requirements/`
- NFR設計: `aidlc-docs/construction/unit-03/nfr-design/`
- インフラ設計: `aidlc-docs/construction/unit-03/infrastructure-design/`
