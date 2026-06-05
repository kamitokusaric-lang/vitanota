# Unit-04 フロントエンド��ンポーネント設計

**作成日**: 2026-04-17
**対象ストーリー**: US-A-010・US-A-011・US-A-020・US-A-021

---

## ページ構成

### /dashboard/admin（既存ページ書き換え）

```
+-----------------------------------------------+
| ページタイトル: 管理者ダッシュボード            |
+-----------------------------------------------+
| AlertBanner (アクティブアラート件数)            |
| [アラート一覧を見る →]                         |
+-----------------------------------------------+
| TeacherStatusGrid                              |
| +----------+ +----------+ +----------+         |
| |教員カード| |教員カード| |教員カード|          |
| |名前      | |名前      | |名前      |          |
| |感情バー  | |感情バー  | |感情バー  |          |
| |最終記録日| |最終記録日| |最終記録日|          |
| +----------+ +----------+ +----------+         |
+-----------------------------------------------+
```

### /dashboard/admin/teacher/[id]（新規ページ）

```
+-----------------------------------------------+
| ← 一覧に戻る                                   |
| 教員名: ○○ さんの感情傾向                      |
+-----------------------------------------------+
| PeriodSelector [週] [月] [3ヶ月]               |
+-----------------------------------------------+
| EmotionTrendChart (Unit-03 コンポーネント再利用) |
+-----------------------------------------------+
```

### /dashboard/admin/alerts（新規ページ）

```
+-----------------------------------------------+
| ページタイトル: アラート                        |
+-----------------------------------------------+
| AlertList                                      |
| +-------------------------------------------+ |
| | 🔴 田中さん | negative_trend | 4/15 |[対応]| |
| | 🟡 佐藤さん | recording_gap  | 4/14 |[対応]| |
| +-------------------------------------------+ |
+-----------------------------------------------+
```

---

## コンポーネント一覧

### 1. TeacherStatusCard

**パス**: `src/features/admin-dashboard/components/TeacherStatusCard.tsx`

**Props**:
```typescript
type TeacherStatusCardProps = {
  teacher: TeacherStatusCard;
  onClick: (userId: string) => void;
};
```

**表示**:
- 教員名
- 感情カテゴリ比率バー（positive=緑 / negative=赤 / neutral=灰）
- 最終記録日（「記録なし」or 「N日前」）
- アクティブアラート件数バッジ（0件なら非表示）
- `data-testid="teacher-status-card-{userId}"`

### 2. TeacherStatusGrid

**パス**: `src/features/admin-dashboard/components/TeacherStatusGrid.tsx`

**Props**:
```typescript
type TeacherStatusGridProps = {
  teachers: TeacherStatusCard[];
  onTeacherClick: (userId: string) => void;
};
```

### 3. EmotionRatioBar

**パス**: `src/features/admin-dashboard/components/EmotionRatioBar.tsx`

**Props**:
```typescript
type EmotionRatioBarProps = {
  positive: number;
  negative: number;
  neutral: number;
};
```

**表示**: 横棒グラフ（3色セグメント）。total=0 の場合は灰色バー。

### 4. AlertBanner

**パス**: `src/features/admin-dashboard/components/AlertBanner.tsx`

**Props**:
```typescript
type AlertBannerProps = {
  openCount: number;
};
```

**表示**: 「N 件のアラートがあります」+ リンク。0件なら非表示。

### 5. AlertList

**パス**: `src/features/admin-dashboard/components/AlertList.tsx`

**Props**:
```typescript
type AlertListProps = {
  alerts: AlertListItem[];
  onClose: (alertId: string) => void;
  isClosing: string | null;
};
```

### 6. AlertItem

**パス**: `src/features/admin-dashboard/components/AlertItem.tsx`

**表示**: 教員名・アラート種別・発生日時・「対応済みにする」ボタン。

---

## カスタムフック

### useTeacherStatuses

```typescript
function useTeacherStatuses() {
  // SWR で GET /api/admin/teachers
  // 手動リロード（refreshInterval なし）
}
```

### useAdminAlerts

```typescript
function useAdminAlerts() {
  // SWR で GET /api/admin/alerts
}
```

### useTeacherEmotionTrend

```typescript
function useTeacherEmotionTrend(teacherId: string, period: 'week' | 'month' | 'quarter') {
  // SWR で GET /api/admin/teachers/[id]/emotion-trend?period=xxx
}
```

---

## Unit-03 コンポーネントの再利用

| Unit-03 コンポーネント | Unit-04 での使用 |
|---|---|
| EmotionTrendChart | 教員詳細ページでそのまま使用 |
| PeriodSelector | 教員詳細ページでそのまま使用 |
| EmptyStateGuide | 教員詳細ページでデータ不足時に使用 |

---

## ディレクトリ構造

```
src/features/admin-dashboard/
├── components/
│   ├── TeacherStatusCard.tsx
│   ├── TeacherStatusGrid.tsx
│   ├── EmotionRatioBar.tsx
│   ├── AlertBanner.tsx
│   ├── AlertList.tsx
���   └── AlertItem.tsx
├── hooks/
│   ├─�� useTeacherStatuses.ts
│   ├── useAdminAlerts.ts
│   └── useTeacherEmotionTrend.ts
└── lib/
    ├── adminDashboardService.ts
    └── alertDetectionService.ts

pages/
├── api/
│   ├── admin/
│   │   ├── teachers.ts
│   │   ├── teachers/[id]/emotion-trend.ts
│   │   ├── alerts.ts
│   │   └── alerts/[id]/close.ts
│   └── cron/
│       └── detect-alerts.ts
└── dashboard/
    ├── admin.tsx                    # 既存（書き換え）
    └── admin/
        ├── alerts.tsx               # 新規
        └── teacher/[id].tsx         # 新規
```
