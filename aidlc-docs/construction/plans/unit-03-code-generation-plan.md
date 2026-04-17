# Unit-03 コード生成プラン：教員ダッシュボード

**作成日**: 2026-04-17
**対象ストーリー**: US-T-020（感情タグ記録）・US-T-030（感情傾向グラフ）
**このプランがコード生成の単一真実源（Single Source of Truth）である**

---

## ユニットコンテキスト

- **ユニット**: Unit-03 教員ダッシュボード
- **依存**: Unit-01（認証・テナント基盤）、Unit-02（日誌・感情記録コア）
- **スキーマ変更**: tags テーブルに type/category enum 追加、is_emotion 削除
- **新規 API**: GET /api/private/dashboard/emotion-trend
- **新規ページ**: /dashboard/teacher
- **既存変更**: /journal（サマリーカード追加）、EntryForm、TagFilter、Layout
- **グラフ**: Recharts（recharts パッケージ追加）

---

## コード生成ステップ

### Step 1: Recharts パッケージ追加
- [x] `pnpm add recharts` を実行 — recharts 3.8.1 インストール完了
- **ストーリー**: US-T-030 の前提

### Step 2: DB マイグレーション — tags type/category enum
- [x] `migrations/0010_unit03_tag_type_category.sql` を作成
  - `tag_type` enum 作成 (emotion/context)
  - `emotion_category` enum 作成 (positive/negative/neutral)
  - tags テーブルに `type`・`category` カラム追加
  - `is_emotion = true` → `type = 'emotion'` データ移行
  - 既存感情タグに category 設定
  - CHECK 制約追加
  - `is_emotion` カラム削除
  - インデックス更新
- **ストーリー**: US-T-020 の基盤

### Step 3: DB マイグレーション — 新デフォルトタグシード
- [x] `migrations/0011_unit03_default_tags_v2.sql` を作成
  - 全既存テナントに感情タグ 15個 + コンテキストタグ 8個を挿入
  - `ON CONFLICT DO NOTHING` で冪等
  - 旧タグの整理（未使用の旧タグを削除）
- **ストーリー**: US-T-020 の基盤

### Step 4: Drizzle スキーマ更新
- [x] `src/db/schema.ts` を更新
  - `pgEnum` で `tagTypeEnum`・`emotionCategoryEnum` を定義
  - tags テーブルから `isEmotion` を削除、`type`・`category` を追加
  - インデックス名を `tags_tenant_type_idx` に変更
  - 型エクスポートを更新
- **ストーリー**: US-T-020

### Step 5: タグリポジトリ更新
- [x] `src/features/journal/lib/tagRepository.ts` を更新
  - シードデータを新タグ 23個に変更（type・category 指定）
  - `is_emotion` 参照を `type` に置き換え
- **ストーリー**: US-T-020

### Step 6: タグ関連 Zod スキーマ更新
- [x] `src/features/journal/schemas/tag.ts` を更新
  - `createTagSchema` に `type`（enum）と `category`（optional enum）を追加
  - `is_emotion` 参照を削除
- **ストーリー**: US-T-020

### Step 7: EntryForm タグ UI グループ化
- [x] `src/features/journal/components/EntryForm.tsx` — 変更不要（TagFilter が内部でグループ化を処理）
  - タグ選択 UI で「感情タグ」と「コンテキストタグ」をセクション分け
  - 感情タグはカテゴリ（positive/negative/neutral）ごとにグループ表示
  - `data-testid` を追加（`entry-form-emotion-tags`、`entry-form-context-tags`）
- **ストーリー**: US-T-020

### Step 8: TagFilter グループ化
- [x] `src/features/journal/components/TagFilter.tsx` を更新（emotion/context グループ + category 別セクション + カテゴリ色分け）
  - フィルタ表示で type ごとにグループ分け
- **ストーリー**: US-T-020

### Step 9: EmotionTrendService 作成
- [x] `src/features/teacher-dashboard/lib/emotionTrendService.ts` を新規作成
  - `getEmotionTrend(tenantId, userId, period)` メソッド
  - `withTenantUser()` 経由で RLS 適用
  - 集計クエリ（journal_entries JOIN journal_entry_tags JOIN tags）
  - 日付を `Asia/Tokyo` タイムゾーンで GROUP BY
  - `EmotionTrendResponse` 型で返却
- **ストーリー**: US-T-030

### Step 10: emotion-trend Zod スキーマ + API Route
- [x] `src/features/teacher-dashboard/schemas/emotionTrend.ts` を新規作成
- [x] `pages/api/private/dashboard/emotion-trend.ts` を新規作成
- **ストーリー**: US-T-030

### Step 11: useEmotionTrend フック
- [x] `src/features/teacher-dashboard/hooks/useEmotionTrend.ts` を新規作成
  - SWR で `/api/private/dashboard/emotion-trend?period=xxx` をフェッチ
  - `{ data, error, isLoading }` を返却
- **ストーリー**: US-T-030

### Step 12: フロントエンドコンポーネント作成
- [x] `src/features/teacher-dashboard/components/PeriodSelector.tsx` を新規作成
  - 週・月・3ヶ月のトグルボタン
  - `data-testid="period-selector"`
- [x] `src/features/teacher-dashboard/components/EmotionTrendChart.tsx` を新規作成
  - Recharts `LineChart` で positive/negative/neutral の折れ線
  - データない日を 0 で補完
  - `data-testid="emotion-trend-chart"`
- [x] `src/features/teacher-dashboard/components/EmptyStateGuide.tsx` を新規作成
  - データ不足時のガイドメッセージ
  - `data-testid="empty-state-guide"`
- [x] `src/features/teacher-dashboard/components/EmotionSummaryCard.tsx` を新規作成
  - 直近 week の positive/negative/neutral 合計 + 「詳細を見る」リンク
  - `data-testid="emotion-summary-card"`
- **ストーリー**: US-T-030

### Step 13: /dashboard/teacher ページ作成
- [x] `pages/dashboard/teacher.tsx` を更新（リダイレクト → ダッシュボード UI に書き換え）
  - PeriodSelector + EmotionTrendChart (or EmptyStateGuide)
  - useEmotionTrend フック使用
  - `requireAuth()` で認証チェック（getServerSideProps）
  - `data-testid="teacher-dashboard-page"`
- **ストーリー**: US-T-030

### Step 14: 既存ページ更新
- [x] `pages/journal/index.tsx` を更新（EmotionSummaryCard 追加）
- [x] `src/shared/components/Layout.tsx` を更新（ナビに「感情傾向」リンク追加）
- **ストーリー**: US-T-030

### Step 15: ユニットテスト — EmotionTrendService
- [x] `src/features/teacher-dashboard/lib/__tests__/emotionTrendService.test.ts` を新規作成
  - 集計ロジックのテスト
  - 日付補完ロジックのテスト
  - 期間パラメータのバリデーション
  - 空データ時の挙動
- **ストーリー**: US-T-030

### Step 16: コンポーネントテスト
- [x] `src/features/teacher-dashboard/components/__tests__/EmotionTrendChart.test.tsx`
- [x] `src/features/teacher-dashboard/components/__tests__/PeriodSelector.test.tsx`
- [x] `src/features/teacher-dashboard/components/__tests__/EmptyStateGuide.test.tsx`
- [x] `src/features/teacher-dashboard/components/__tests__/EmotionSummaryCard.test.tsx`
  - 各コンポーネントの描画確認 + props バリエーション
  - データ不足時のガイドメッセージ表示
- **ストーリー**: US-T-030

### Step 17: 統合テスト — emotion-trend API
- [x] `__tests__/integration/emotion-trend.test.ts` を新規作成
  - 認証なしで 401
  - 有効な period で 200 + 正しい集計結果
  - 不正な period で 400
  - 他教員のデータが含まれないこと
  - テナント隔離テスト
- **ストーリー**: US-T-030・NFR-U03-05

### Step 18: コード生成サマリー
- [x] `aidlc-docs/construction/unit-03/code/code-summary.md` を作成

---

## ストーリートレーサビリティ

| ストーリー | 対応 Step |
|---|---|
| US-T-020（感情タグ記録） | Step 2〜8 |
| US-T-030（感情傾向グラフ） | Step 1, 9〜17 |
