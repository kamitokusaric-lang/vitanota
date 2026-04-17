# Unit-04 ドメインエンティティ

**作成日**: 2026-04-17
**対象ストーリー**: US-A-010・US-A-011・US-A-020・US-A-021

---

## 新規テーブル: alerts

```sql
CREATE TYPE alert_type AS ENUM ('negative_trend', 'recording_gap');
CREATE TYPE alert_status AS ENUM ('open', 'closed');

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  status alert_status NOT NULL DEFAULT 'open',
  -- 検知時のコンテキスト（JSON）
  detection_context JSONB NOT NULL DEFAULT '{}',
  -- クローズ情報
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMP WITH TIME ZONE,
  -- タイムスタンプ
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT alerts_closed_check CHECK (
    (status = 'open' AND closed_by IS NULL AND closed_at IS NULL) OR
    (status = 'closed' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
  )
);

CREATE INDEX alerts_tenant_status_idx ON alerts (tenant_id, status);
CREATE INDEX alerts_teacher_idx ON alerts (teacher_user_id);
```

### Drizzle スキーマ

```typescript
export const alertTypeEnum = pgEnum('alert_type', ['negative_trend', 'recording_gap']);
export const alertStatusEnum = pgEnum('alert_status', ['open', 'closed']);

export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  teacherUserId: uuid('teacher_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: alertTypeEnum('type').notNull(),
  status: alertStatusEnum('status').notNull().default('open'),
  detectionContext: jsonb('detection_context').notNull().default({}),
  closedBy: uuid('closed_by').references(() => users.id),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tenantStatusIdx: index('alerts_tenant_status_idx').on(table.tenantId, table.status),
  teacherIdx: index('alerts_teacher_idx').on(table.teacherUserId),
}));
```

### detection_context の構造

**negative_trend:**
```json
{
  "period_days": 7,
  "negative_ratio": 0.67,
  "negative_count": 4,
  "total_emotion_tags": 6,
  "threshold": 0.6
}
```

**recording_gap:**
```json
{
  "last_entry_date": "2026-04-10",
  "gap_days": 7,
  "threshold_days": 5
}
```

---

## 型定義

### TeacherStatusCard

管理者ダッシュボードの教員カード用。

```typescript
type TeacherStatusCard = {
  userId: string;
  name: string;
  email: string;
  lastEntryDate: string | null;   // ISO date or null (記録なし)
  emotionSummary: {
    positive: number;
    negative: number;
    neutral: number;
    total: number;
  };
  openAlertCount: number;
};
```

### AlertListItem

アラート一覧用。

```typescript
type AlertListItem = {
  id: string;
  teacherUserId: string;
  teacherName: string;
  type: 'negative_trend' | 'recording_gap';
  status: 'open' | 'closed';
  detectionContext: Record<string, unknown>;
  createdAt: string;
};
```

---

## 不要になったテーブル

| テーブル | 理由 |
|---|---|
| `watch_flags` | US-A-012（要注意フラグ）が Should 落としで MVP スコープ外 |
