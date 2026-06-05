# Unit-04 コード生成サマリー

**生成日**: 2026-04-17
**対象ストーリー**: US-A-010・US-A-011・US-A-020・US-A-021
**テスト件数**: 186 件 GREEN

## 構造

```
src/features/admin-dashboard/         # 新規ディレクトリ (Unit-04)
├── schemas/
│   └── admin.ts                      # teacherIdParamSchema / alertIdParamSchema
├── lib/
│   ├── adminDashboardService.ts      # getTeacherStatuses() 全教員集計
│   ├── alertDetectionService.ts      # detectAll() / detectForTenant() 検知バッチ
│   └── alertService.ts              # getOpenAlerts() / closeAlert()
├── hooks/
│   ├── useTeacherStatuses.ts
│   ├── useAdminAlerts.ts
│   └── useTeacherEmotionTrend.ts
└── components/
    ├── EmotionRatioBar.tsx           # 感情カテゴリ比率の横棒グラフ
    ├── TeacherStatusCard.tsx         # 教員ステータスカード
    ├── TeacherStatusGrid.tsx         # カードグリッド
    ├── AlertBanner.tsx              # アラート件数バナー
    ├── AlertItem.tsx                # アラート1件の表示
    └── AlertList.tsx                # アラート一覧

src/features/teacher-dashboard/lib/
└── emotionTrendService.ts           # getEmotionTrendForTeacher() 追加 (Unit-04 拡張)

src/db/schema.ts                     # alertTypeEnum / alertStatusEnum / alerts テーブル追加

pages/api/admin/
├── teachers.ts                      # GET 全教員ステータス
├── teachers/[id]/emotion-trend.ts   # GET 特定教員の感情傾向
├── alerts.ts                        # GET アクティブアラート一覧
└── alerts/[id]/close.ts            # PUT アラートクローズ

pages/api/cron/
└── detect-alerts.ts                 # POST アラート検知バッチ（手動実行）

pages/dashboard/
├── admin.tsx                        # 管理者ダッシュボード（書き換え）
└── admin/
    ├── alerts.tsx                    # アラート一覧ページ
    └── teacher/[id].tsx             # 教員詳細ページ

migrations/
└── 0012_unit04_alerts.sql           # alerts テーブル + enum + RLS + GRANT

src/shared/components/
└── Layout.tsx                       # 管理者ナビに「アラート」リンク追加
```

## 主要な実装決定

### 1. alerts テーブル設計
- `alert_type` enum: negative_trend / recording_gap
- `alert_status` enum: open / closed
- `detection_context` JSONB: 検知時のコンテキスト（比率・件数・閾値等）
- CHECK 制約: open → closed_by/closed_at NULL、closed → 両方 NOT NULL

### 2. アラート検知閾値
- negative_trend: 直近7日の感情タグのうち negative 比率 >= 60%
- recording_gap: 最終記録日から 5日以上経過
- 重複防止: 同一教員 × 同一 type の open アラートがあればスキップ

### 3. RLS
- teacher: alerts テーブルにアクセス不可
- school_admin: 自テナントのみ
- system_admin: 全テナント（cron バッチ用）

### 4. 本文非返却保証
- 管理者 API の SELECT 句に content を含めない
- EmotionTrendService は集計データのみ返却（Unit-03 と同じ構造）

### 5. cron は MVP 手動実行
- session 認証（school_admin or system_admin）
- withSystemAdmin で全テナント一括
- 将来 EventBridge 連携時に API キー認証に切り替え可能
