# コンポーネントメソッド定義

## 凡例

- 詳細なビジネスロジック（アラート発火条件・集計アルゴリズム等）は **機能設計（Functional Design）** フェーズで定義する
- 本ドキュメントはメソッドシグネチャ・入出力の型・高レベルの目的を定義する

---

## 共通インフラ（src/shared/lib/）

### `db.ts`

```typescript
// Drizzle ORM クライアント（シングルトン）
export const db: DrizzleClient

// テナント隔離ラッパー
// 内部で BEGIN; SET LOCAL app.tenant_id = tenantId; を実行し RLS を有効化
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: DrizzleTransaction) => Promise<T>
): Promise<T>
```

### `auth.ts`

```typescript
// Auth.js 設定（NextAuth ハンドラー用）
export const authOptions: NextAuthOptions

// セッションからテナント・ロール情報を取得するヘルパー
export async function getServerSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null>
```

---

## FEATURE: auth

### `TenantService`

```typescript
// テナントを ID で取得（存在しない・停止中の場合は null）
getTenantById(tenantId: string): Promise<Tenant | null>

// ユーザーが指定テナントに所属しているか検証
validateUserTenant(userId: string, tenantId: string): Promise<boolean>

// テナント作成（システム管理者専用）
createTenant(input: CreateTenantInput): Promise<Tenant>
// CreateTenantInput: { name: string; adminEmail: string }

// テナント停止（システム管理者専用）
deactivateTenant(tenantId: string): Promise<void>
```

### `RoleService`

```typescript
// セッションのロールが teacher かを検証
isTeacher(session: Session): boolean

// セッションのロールが admin かを検証
isAdmin(session: Session): boolean

// セッションのロールが sysadmin かを検証
isSysAdmin(session: Session): boolean

// ロールに基づいてアクセスを検証（不正なら例外をスロー）
assertRole(session: Session, requiredRole: Role): void
// Role: 'teacher' | 'admin' | 'sysadmin'
```

---

## FEATURE: journal

### `JournalService`

```typescript
// 教員の日誌エントリ一覧を取得（タイムライン用）
getEntriesByTeacher(
  tenantId: string,
  teacherId: string,
  options?: { limit?: number; cursor?: string }
): Promise<JournalEntryPage>
// JournalEntryPage: { entries: JournalEntry[]; nextCursor: string | null }

// 日誌エントリを作成
createEntry(
  tenantId: string,
  teacherId: string,
  input: CreateJournalEntryInput
): Promise<JournalEntry>
// CreateJournalEntryInput: { content: string; tagIds?: string[] }

// 日誌エントリを更新（本人のみ）
updateEntry(
  tenantId: string,
  teacherId: string,
  entryId: string,
  input: UpdateJournalEntryInput
): Promise<JournalEntry>
// UpdateJournalEntryInput: { content?: string; tagIds?: string[] }

// 日誌エントリを削除（本人のみ）
deleteEntry(
  tenantId: string,
  teacherId: string,
  entryId: string
): Promise<void>
```

### `TagService`

```typescript
// テナント内のタグ一覧を取得
getTagsByTenant(tenantId: string): Promise<Tag[]>

// タグを作成（重複チェック付き）
createTag(tenantId: string, name: string): Promise<Tag>

// エントリにタグを紐づける
attachTagsToEntry(
  tenantId: string,
  entryId: string,
  tagIds: string[]
): Promise<void>
```

---

## FEATURE: emotion

### `EmotionService`

```typescript
// 感情データを記録（エントリに紐づけ）
recordEmotion(
  tenantId: string,
  teacherId: string,
  entryId: string,
  input: RecordEmotionInput
): Promise<EmotionRecord>
// RecordEmotionInput: { score: 1|2|3|4|5; categories: EmotionCategory[] }
// EmotionCategory: '喜び' | '充実' | '疲労' | '不安' | '怒り' | ...

// 感情データを更新
updateEmotion(
  tenantId: string,
  teacherId: string,
  emotionId: string,
  input: UpdateEmotionInput
): Promise<EmotionRecord>

// 教員個人の感情スコア時系列を取得（グラフ用）
getEmotionTimeSeries(
  tenantId: string,
  teacherId: string,
  period: 'week' | 'month'
): Promise<EmotionTimeSeriesPoint[]>
// EmotionTimeSeriesPoint: { date: string; score: number }

// 教員個人のタグ別記録頻度を取得（グラフ用）
getTagFrequency(
  tenantId: string,
  teacherId: string,
  period: 'week' | 'month'
): Promise<TagFrequencyPoint[]>
// TagFrequencyPoint: { tagName: string; count: number }

// 管理者向け：全教員の感情スコア平均を取得（本文非含）
getTeacherEmotionSummaries(
  tenantId: string
): Promise<TeacherEmotionSummary[]>
// TeacherEmotionSummary: { teacherId: string; avgScore: number; lastRecordedAt: Date | null }
```

---

## FEATURE: admin-dashboard

### `AdminDashboardService`

```typescript
// テナント内全教員のステータスサマリーを取得
getTeacherStatusList(tenantId: string): Promise<TeacherStatus[]>
// TeacherStatus: {
//   teacherId: string; name: string;
//   avgScore7d: number | null;   // 直近7日の平均スコア
//   lastRecordedAt: Date | null; // 最終記録日時
//   hasActiveAlert: boolean;     // 未対応アラートの有無
//   watchFlag: boolean;          // 要注意フラグ
// }

// 特定教員の感情スコア推移を取得（管理者向け・本文非含）
getTeacherEmotionHistory(
  tenantId: string,
  teacherId: string,
  period: 'week' | 'month'
): Promise<EmotionTimeSeriesPoint[]>

// 要注意フラグを設定
setWatchFlag(
  tenantId: string,
  adminId: string,
  teacherId: string,
  input: WatchFlagInput
): Promise<void>
// WatchFlagInput: { flagged: boolean; memo?: string }
```

### `AlertService`

```typescript
// 未対応アラート一覧を取得
getActiveAlerts(tenantId: string): Promise<Alert[]>
// Alert: { id: string; teacherId: string; type: AlertType; occurredAt: Date }
// AlertType: 'low_score_consecutive' | 'no_record'

// アラート履歴を取得
getAlertHistory(tenantId: string): Promise<AlertHistory[]>
// AlertHistory: Alert & { closedAt: Date; closedById: string }

// アラートをクローズ（対応済みに移行）
closeAlert(
  tenantId: string,
  adminId: string,
  alertId: string
): Promise<void>

// アラート条件を評価して新規アラートを生成（バッチから呼び出し）
// 詳細なビジネスロジックは Functional Design で定義
evaluateAlerts(tenantId: string): Promise<number>
// 戻り値: 生成されたアラート件数
```

### `AlertDetectionJob`

```typescript
// 全テナントのアラート検知を実行（Cron エンドポイントから呼び出し）
runAlertDetection(): Promise<AlertDetectionResult>
// AlertDetectionResult: {
//   tenantsProcessed: number;
//   alertsCreated: number;
//   errors: string[];
// }
```

---

## Pages（API Routes）

### `pages/api/journal/index.ts`

```typescript
// GET  /api/journal       教員の日誌エントリ一覧取得
// POST /api/journal       日誌エントリ作成
// 認証・ロール検証 → withTenant() → JournalService
```

### `pages/api/journal/[id].ts`

```typescript
// PUT    /api/journal/:id  日誌エントリ更新（本人のみ）
// DELETE /api/journal/:id  日誌エントリ削除（本人のみ）
```

### `pages/api/emotion/index.ts`

```typescript
// POST /api/emotion       感情データ記録
// PUT  /api/emotion/:id   感情データ更新
```

### `pages/api/admin/dashboard.ts`

```typescript
// GET /api/admin/dashboard  全教員ステータス一覧取得（管理者ロール必須）
```

### `pages/api/admin/alerts/index.ts`

```typescript
// GET /api/admin/alerts     未対応アラート一覧取得（管理者ロール必須）
```

### `pages/api/admin/alerts/[id]/close.ts`

```typescript
// POST /api/admin/alerts/:id/close  アラートクローズ（管理者ロール必須）
```

### `pages/api/cron/detect-alerts.ts`

```typescript
// POST /api/cron/detect-alerts  アラート検知バッチ（Cron Secret で保護）
```
