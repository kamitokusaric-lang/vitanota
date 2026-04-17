# Unit-04 コード生成プラン：管理者ダッシュボード・アラート

**作成日**: 2026-04-17
**対象ストーリー**: US-A-010（全教員ステータス）・US-A-011（教員感情傾向）・US-A-020（アラート検知）・US-A-021（アラートクローズ）
**このプランがコード生成の単一真実源（Single Source of Truth��である**

---

## ユニットコンテキスト

- **依存**: Unit-01（認証）、Unit-02（日誌）、Unit-03（感情タグ + EmotionTrendService）
- **スキーマ変更**: alerts テーブ��新規作成
- **新規 API**: 管理者 API 4本 + cron API 1本
- **新規ページ**: 3ページ（管理者ダッシュボード書き換え + 教員詳細 + アラート一覧）
- **Unit-03 再利用**: EmotionTrendChart・PeriodSelector・EmptyStateGuide

---

## コード生成ステップ

### Step 1: DB マイグレーション — alerts テーブル + RLS
- [x] `migrations/0012_unit04_alerts.sql` を作成
  - alert_type / alert_status enum
  - alerts テーブル + CHECK 制約 + インデックス
  - RLS 有効化 + ポリシー（school_admin / system_admin）
  - GRANT to vitanota_app
- **ストーリー**: US-A-020 の基盤

### Step 2: Drizzle スキ��マ更新
- [x] `src/db/schema.ts` に alerts テーブル + enum 追加
- **ストーリー**: US-A-020

### Step 3: EmotionTrendService 管理者向け拡張
- [x] `src/features/teacher-dashboard/lib/emotionTrendService.ts` に `getEmotionTrendForTeacher()` メソッド追加
  - school_admin が指定した教員のデータを取得
  - userId を WHERE で明示（RLS は tenant_id のみ）
- **ストーリー**: US-A-011

### Step 4: AdminDashboardService 作成
- [x] `src/features/admin-dashboard/lib/adminDashboardService.ts` を新規作成
  - `getTeacherStatuses(db, tenantId)`: 全教員の感情集計 + 最終記録日 + アラート件数
- **ストーリー**: US-A-010

### Step 5: AlertDetectionService 作成
- [x] `src/features/admin-dashboard/lib/alertDetectionService.ts` を新規作成
  - `detectAll(db)`: 全テナント一括検知
  - `detectForTenant(db, tenantId)`: テナント単位検���
  - negative_trend: 直近7日 negative 比率 >= 60%
  - recording_gap: 最終記録日から5日以上
  - 重複防止（同一教員 × type の open アラートスキップ）
- **ストーリー**: US-A-020

### Step 6: AlertService 作成
- [x] `src/features/admin-dashboard/lib/alertService.ts` を新規作成
  - `getOpenAlerts(db, tenantId)`: アクティブアラート一覧
  - `closeAlert(db, alertId, closedByUserId, tenantId)`: アラートクローズ
- **ストーリー**: US-A-020・US-A-021

### Step 7: Zod スキーマ作成
- [x] `src/features/admin-dashboard/schemas/admin.ts` を新規作成
  - teacherIdParamSchema, alertIdParamSchema, emotionTrendQuerySchema (再利用)
- **ストーリー**: US-A-010〜021

### Step 8: 管理者 API Route — teachers
- [x] `pages/api/admin/teachers.ts` を新規作成（GET: ��教員ステータス）
- [x] `pages/api/admin/teachers/[id]/emotion-trend.ts` を新規作成（GET: 特定教員感情傾向）
- **ストーリー**: US-A-010・US-A-011

### Step 9: 管理者 API Route — alerts
- [x] `pages/api/admin/alerts.ts` を新規作成（GET: アクティブアラート一覧）
- [x] `pages/api/admin/alerts/[id]/close.ts` を新規作成（PUT: アラートクローズ）
- **ストーリー**: US-A-020・US-A-021

### Step 10: cron API Route
- [x] `pages/api/cron/detect-alerts.ts` を新規作成（POST: アラート検知バッチ）
  - session 認証（school_admin or system_admin）
  - withSystemAdmin で全テナント一括実行
- **ストーリー**: US-A-020

### Step 11: カスタムフック作成
- [x] `src/features/admin-dashboard/hooks/useTeacherStatuses.ts`
- [x] `src/features/admin-dashboard/hooks/useAdminAlerts.ts`
- [x] `src/features/admin-dashboard/hooks/useTeacherEmotionTrend.ts`
- **ストーリー**: US-A-010〜021

### Step 12: フロントエンドコンポーネント作成
- [x] `src/features/admin-dashboard/components/EmotionRatioBar.tsx`
- [x] `src/features/admin-dashboard/components/TeacherStatusCard.tsx`
- [x] `src/features/admin-dashboard/components/TeacherStatusGrid.tsx`
- [x] `src/features/admin-dashboard/components/AlertBanner.tsx`
- [x] `src/features/admin-dashboard/components/AlertItem.tsx`
- [x] `src/features/admin-dashboard/components/AlertList.tsx`
- **ストーリー**: US-A-010・US-A-020・US-A-021

### Step 13: ページ作成・更新
- [x] `pages/dashboard/admin.tsx` を書き換え（管理者ダッシュボード）
- [x] `pages/dashboard/admin/teacher/[id].tsx` を新規作成（教員詳細）
- [x] `pages/dashboard/admin/alerts.tsx` を新規作成（アラート一覧）
- [x] `src/shared/components/Layout.tsx` にアラートリンク追加
- **ストーリー**: US-A-010〜021

### Step 14: ユニットテスト — サービス層
- [x] `src/features/admin-dashboard/lib/__tests__/alertDetectionService.test.ts`
  - negative_trend 検知ロジック
  - recording_gap 検知ロジック
  - 重複防止
  - 閾値未満はスキップ
- [x] `src/features/admin-dashboard/lib/__tests__/adminDashboardService.test.ts`
- [x] `src/features/admin-dashboard/lib/__tests__/alertService.test.ts`
- **ストーリー**: US-A-010〜021

### Step 15: コンポーネントテスト
- [x] EmotionRatioBar・TeacherStatusCard・AlertBanner・AlertItem のテスト
- **ストーリー**: US-A-010〜021

### Step 16: 統合テスト
- [x] 管理者 API 統合テスト（teacher → 403、school_admin → 200、本文非含有確認）
- **ストーリー**: US-A-010〜021

### Step 17: コード生成サマリー
- [x] `aidlc-docs/construction/unit-04/code/code-summary.md` を作成

---

## ストーリートレーサビリティ

| ストーリー | 対応 Step |
|---|---|
| US-A-010（全教員ステータス） | Step 1-2, 4, 7-8, 11-13 |
| US-A-011（教員感情傾向） | Step 3, 7-8, 11, 13 |
| US-A-020（アラート検知） | Step 1-2, 5-7, 9-13 |
| US-A-021（アラートクローズ） | Step 6-7, 9, 11-13 |
