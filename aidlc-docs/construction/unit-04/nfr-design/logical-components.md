# Unit-04 論理コンポーネント

**作成日**: 2026-04-17

---

## 依存グラフ

```
pages/dashboard/admin.tsx
  └── useTeacherStatuses (SWR hook)
        └── GET /api/admin/teachers
              └── requireAuth() → school_admin チェック
                    └── withTenantUser(school_admin)
                          └── AdminDashboardService.getTeacherStatuses()
                                └── DB: users JOIN journal_entries JOIN tags + alerts (RLS)

pages/dashboard/admin/teacher/[id].tsx
  └── useTeacherEmotionTrend (SWR hook)
        └── GET /api/admin/teachers/[id]/emotion-trend
              └── requireAuth() → school_admin チェック
                    └── withTenantUser(school_admin)
                          └── EmotionTrendService.getEmotionTrendForTeacher()
                                └── DB: journal_entries JOIN tags (RLS)

pages/dashboard/admin/alerts.tsx
  ├── useAdminAlerts (SWR hook)
  │     └── GET /api/admin/alerts
  │           └── requireAuth() → school_admin
  │                 └── withTenantUser(school_admin)
  │                       └── DB: alerts WHERE status='open' (RLS)
  └── closeAlert (mutation)
        └── PUT /api/admin/alerts/[id]/close
              └── requireAuth() → school_admin
                    └── withTenantUser(school_admin)
                          └── DB: UPDATE alerts SET status='closed' (RLS)

POST /api/cron/detect-alerts (手動実行)
  └── requireAuth() → school_admin or system_admin
        └── withSystemAdmin()
              └── AlertDetectionService.detectAll()
                    ├── 全テナント・全教員を列挙
                    ├── negative_trend チェック (感情タグ集計)
                    ├── recording_gap チェック (最終記録日)
                    └── alerts INSERT (重複スキップ)
```

---

## 新規コンポーネント一覧

| コンポーネント | 種別 | 配置先 |
|---|---|---|
| AdminDashboardService | バックエンド | `src/features/admin-dashboard/lib/` |
| AlertDetectionService | バックエンド | `src/features/admin-dashboard/lib/` |
| teachers API | API Route | `pages/api/admin/` |
| teachers/[id]/emotion-trend API | API Route | `pages/api/admin/teachers/[id]/` |
| alerts API | API Route | `pages/api/admin/` |
| alerts/[id]/close API | API Route | `pages/api/admin/alerts/[id]/` |
| detect-alerts API | API Route | `pages/api/cron/` |
| TeacherStatusCard | フロントエンド | `src/features/admin-dashboard/components/` |
| TeacherStatusGrid | フロントエンド | `src/features/admin-dashboard/components/` |
| EmotionRatioBar | フロントエンド | `src/features/admin-dashboard/components/` |
| AlertBanner | フロントエンド | `src/features/admin-dashboard/components/` |
| AlertList | フロントエンド | `src/features/admin-dashboard/components/` |
| AlertItem | フロントエンド | `src/features/admin-dashboard/components/` |
| useTeacherStatuses | フック | `src/features/admin-dashboard/hooks/` |
| useAdminAlerts | フック | `src/features/admin-dashboard/hooks/` |
| useTeacherEmotionTrend | フック | `src/features/admin-dashboard/hooks/` |

---

## 既存コンポーネントへの変更

| コンポーネント | 変更内容 |
|---|---|
| `src/db/schema.ts` | alerts テーブル + alert_type/alert_status enum 追加 |
| `src/features/teacher-dashboard/lib/emotionTrendService.ts` | `getEmotionTrendForTeacher()` メソッド追加 |
| `pages/dashboard/admin.tsx` | リダイレクト → 管理者ダッシュボード UI に書き換え |
| `src/shared/components/Layout.tsx` | 管理者ナビに「アラート」リンク追加 |

---

## Unit-03 コンポーネント再利用

| Unit-03 | Unit-04 での使用 |
|---|---|
| EmotionTrendChart | 教員詳細ページ（`/dashboard/admin/teacher/[id]`） |
| PeriodSelector | 教員詳細ページ |
| EmptyStateGuide | 教員詳細ページ（データ不足時） |

---

## インフラへの影響

| 項目 | 影響 |
|---|---|
| DB | マイグレーション追加（alerts テーブル + RLS） |
| App Runner | 変更なし |
| RDS Proxy | 変更なし |
| CloudFront | 変更なし |
| CDK | 変更なし |
