# コンポーネント依存関係

## 依存関係マトリクス

### ページ → サービス依存

| ページ（Pages Router） | 依存サービス | データ取得方法 |
|---|---|---|
| `/pages/dashboard/teacher.tsx` | `JournalService`・`EmotionService`・`TagService` | `getServerSideProps`（初期）+ SWR（更新） |
| `/pages/dashboard/admin.tsx` | `AdminDashboardService`・`AlertService` | `getServerSideProps`（初期）+ SWR 30秒ポーリング |
| `/pages/auth/signin.tsx` | Auth.js（NextAuth） | NextAuth 標準 |
| `/pages/api/*` | 各 Service | サーバーサイドのみ |

---

### サービス → 共通インフラ依存

```
すべてのサービス
  └─── withTenant()       RLS によるテナント隔離（必須）
         └─── Drizzle ORM → PostgreSQL（RLS ポリシーが自動適用）

すべての API Route
  └─── getServerSession() セッション・ロール取得
         └─── Auth.js → JWT / Session Store
```

---

### コンポーネント → サービス依存（クライアントサイド）

```
TeacherDashboardPage
  ├─ getServerSideProps
  │    └─ JournalService.getEntriesByTeacher()
  │    └─ EmotionService.getEmotionTimeSeries()
  └─ (クライアント) SWR → /api/journal → JournalService

AdminDashboardPage
  ├─ getServerSideProps
  │    └─ AdminDashboardService.getTeacherStatusList()
  │    └─ AlertService.getActiveAlerts()
  └─ (クライアント) SWR 30秒ポーリング → /api/admin/dashboard
                                       → /api/admin/alerts
```

---

### データフロー図

```
ブラウザ（教員）
  │
  ├─ [初期表示] GET /dashboard/teacher
  │     └─ getServerSideProps
  │           ├─ TenantGuard（テナント検証）
  │           ├─ RoleGuard（teacher ロール検証）
  │           └─ JournalService / EmotionService
  │                 └─ withTenant() → PostgreSQL + RLS
  │
  └─ [操作] POST /api/journal（日誌作成）
        ├─ 認証チェック（getServerSession）
        ├─ ロール検証（RoleService）
        ├─ 入力バリデーション（SECURITY-05）
        └─ JournalService.createEntry()
              └─ withTenant() → PostgreSQL + RLS


ブラウザ（管理者）
  │
  ├─ [初期表示] GET /dashboard/admin
  │     └─ getServerSideProps
  │           ├─ TenantGuard
  │           ├─ RoleGuard（admin ロール検証）
  │           └─ AdminDashboardService / AlertService
  │                 └─ withTenant() → PostgreSQL + RLS
  │                 ※ 返却データに日誌本文は含まない
  │
  └─ [SWR ポーリング 30秒] GET /api/admin/dashboard
        └─ AdminDashboardService.getTeacherStatusList()
              └─ withTenant() → PostgreSQL + RLS


Vercel Cron（毎日深夜）
  │
  └─ POST /api/cron/detect-alerts
        ├─ Cron Secret 検証（SECURITY-11）
        └─ AlertDetectionJob.runAlertDetection()
              └─ 全テナントを順次処理
                    └─ AlertService.evaluateAlerts(tenantId)
                          └─ withTenant() → PostgreSQL + RLS
```

---

### 機能間の依存関係

```
auth ◄──────────────── すべての機能が依存（認証・テナント検証）
  │
  ├─ journal ◄─────── emotion が依存（エントリに感情データを紐づける）
  │     └─ TagService
  │
  ├─ emotion ◄──────── admin-dashboard が依存（感情スコア集計）
  │
  └─ admin-dashboard
        ├─ AdminDashboardService（emotion の集計を利用）
        └─ AlertService（journal / emotion の記録状況を評価）
              └─ AlertDetectionJob
```

---

### テナント隔離レイヤー構造

```
リクエスト
  │
  ├─ Layer 1: Auth.js セッション検証（未認証を拒否）
  │
  ├─ Layer 2: TenantGuard（セッションの tenantId を検証）
  │
  ├─ Layer 3: RoleGuard（ロールを検証）
  │
  ├─ Layer 4: サービス層の所有権チェック（teacherId の一致確認・IDOR 防止）
  │
  └─ Layer 5: PostgreSQL RLS（DB 層で tenant_id を自動フィルタ）
               ← withTenant() がセッション変数をセット
               ← アプリ層を迂回しても DB 層でブロック
```

---

### ディレクトリ構造（機能別）

```
vitanota/                          ← アプリケーションルート
├── src/
│   ├── features/
│   │   ├── auth/
│   │   │   ├── services/
│   │   │   │   ├── tenant.service.ts
│   │   │   │   └── role.service.ts
│   │   │   └── types/
│   │   │       └── auth.types.ts
│   │   ├── journal/
│   │   │   ├── components/
│   │   │   │   ├── JournalTimeline.tsx
│   │   │   │   ├── JournalEntryCard.tsx
│   │   │   │   ├── JournalEntryForm.tsx
│   │   │   │   ├── DeleteConfirmDialog.tsx
│   │   │   │   └── TagSelector.tsx
│   │   │   ├── services/
│   │   │   │   ├── journal.service.ts
│   │   │   │   └── tag.service.ts
│   │   │   ├── hooks/
│   │   │   │   └── useJournal.ts        (SWR フック)
│   │   │   └── types/
│   │   │       └── journal.types.ts
│   │   ├── emotion/
│   │   │   ├── components/
│   │   │   │   ├── EmotionScoreSelector.tsx
│   │   │   │   ├── EmotionCategorySelector.tsx
│   │   │   │   ├── EmotionScoreGraph.tsx
│   │   │   │   └── TagFrequencyChart.tsx
│   │   │   ├── services/
│   │   │   │   └── emotion.service.ts
│   │   │   └── types/
│   │   │       └── emotion.types.ts
│   │   ├── teacher-dashboard/
│   │   │   ├── components/
│   │   │   │   ├── TeacherDashboardHeader.tsx
│   │   │   │   ├── MonthlySummary.tsx
│   │   │   │   └── DashboardGraphSection.tsx
│   │   │   └── hooks/
│   │   │       └── useTeacherDashboard.ts
│   │   └── admin-dashboard/
│   │       ├── components/
│   │       │   ├── TeacherStatusGrid.tsx
│   │       │   ├── TeacherStatusCard.tsx
│   │       │   ├── TeacherDetailPanel.tsx
│   │       │   ├── AlertBadge.tsx
│   │       │   ├── AlertList.tsx
│   │       │   ├── AlertItem.tsx
│   │       │   ├── AlertHistoryList.tsx
│   │       │   └── WatchFlagForm.tsx
│   │       ├── services/
│   │       │   ├── admin-dashboard.service.ts
│   │       │   ├── alert.service.ts
│   │       │   └── alert-detection.job.ts
│   │       └── hooks/
│   │           └── useAdminDashboard.ts  (SWR ポーリングフック)
│   └── shared/
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── Button.tsx
│       │   ├── Modal.tsx
│       │   ├── LoadingSpinner.tsx
│       │   ├── ErrorMessage.tsx
│       │   └── EmptyState.tsx
│       ├── lib/
│       │   ├── db.ts                    (Drizzle + withTenant)
│       │   └── auth.ts                  (Auth.js 設定)
│       └── types/
│           └── common.types.ts
├── pages/
│   ├── _app.tsx                         (SessionProvider)
│   ├── auth/
│   │   └── signin.tsx
│   ├── dashboard/
│   │   ├── teacher.tsx                  (getServerSideProps + SWR)
│   │   └── admin.tsx                    (getServerSideProps + SWR ポーリング)
│   └── api/
│       ├── auth/
│       │   └── [...nextauth].ts
│       ├── journal/
│       │   ├── index.ts                 (GET 一覧 / POST 作成)
│       │   └── [id].ts                  (PUT 更新 / DELETE 削除)
│       ├── emotion/
│       │   └── index.ts                 (POST 記録 / PUT 更新)
│       ├── admin/
│       │   ├── dashboard.ts             (GET 全教員ステータス)
│       │   ├── teachers/
│       │   │   └── [id]/
│       │   │       ├── emotion.ts       (GET 感情推移)
│       │   │       └── watch-flag.ts    (PUT 要注意フラグ)
│       │   └── alerts/
│       │       ├── index.ts             (GET 一覧 / GET 履歴)
│       │       └── [id]/
│       │           └── close.ts         (POST クローズ)
│       └── cron/
│           └── detect-alerts.ts         (POST バッチ実行)
├── db/
│   ├── schema.ts                        (Drizzle スキーマ定義)
│   └── migrations/                      (Drizzle Kit 生成マイグレーション)
└── drizzle.config.ts
```
