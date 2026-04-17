# Unit-04 インフラ設計

**作成日**: 2026-04-17

---

## インフラ変更サマリー

Unit-04 は **インフラ構成の変更なし**。DB マイグレーション（alerts テーブル + RLS）のみ。

| コンポーネント | 変更 |
|---|---|
| App Runner | なし |
| RDS PostgreSQL | マイグレーション追加（alerts テーブル + enum + RLS） |
| RDS Proxy | なし |
| CloudFront | なし |
| WAF | なし |
| Secrets Manager | なし |
| CloudWatch | なし |
| EventBridge | なし（MVP は手動実行） |
| Lambda | なし |
| CDK | なし |

---

## DB マイグレーション設計

### マイグレーション: `0012_unit04_alerts.sql`

```sql
-- ============================================================
-- Unit-04: alerts テーブル + RLS
-- ============================================================

-- Step 1: enum 型の作成
CREATE TYPE alert_type AS ENUM ('negative_trend', 'recording_gap');
CREATE TYPE alert_status AS ENUM ('open', 'closed');

-- Step 2: alerts テーブル作成
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type alert_type NOT NULL,
  status alert_status NOT NULL DEFAULT 'open',
  detection_context JSONB NOT NULL DEFAULT '{}',
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT alerts_closed_check CHECK (
    (status = 'open' AND closed_by IS NULL AND closed_at IS NULL) OR
    (status = 'closed' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
  )
);

-- Step 3: インデックス
CREATE INDEX alerts_tenant_status_idx ON alerts (tenant_id, status);
CREATE INDEX alerts_teacher_idx ON alerts (teacher_user_id);

-- Step 4: RLS 有効化
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;

-- Step 5: RLS ポリシー（school_admin + system_admin のみ）
CREATE POLICY alerts_admin_read ON alerts FOR SELECT USING (
  CASE
    WHEN app_role() = 'system_admin' THEN true
    WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id()
    ELSE false
  END
);

CREATE POLICY alerts_admin_write ON alerts USING (
  CASE
    WHEN app_role() = 'system_admin' THEN true
    WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id()
    ELSE false
  END
) WITH CHECK (
  CASE
    WHEN app_role() = 'system_admin' THEN true
    WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id()
    ELSE false
  END
);

-- vitanota_app ロールに権限付与
GRANT SELECT, INSERT, UPDATE ON alerts TO vitanota_app;
```

---

## RLS への影響

新規テーブルのため、既存テーブルの RLS に影響なし。

| テーブル | ポリシー | teacher | school_admin | system_admin |
|---|---|---|---|---|
| alerts | alerts_admin_read (SELECT) | 不可 | 自テナントのみ | 全テナント |
| alerts | alerts_admin_write (ALL) | 不可 | 自テナントのみ | 全テナント |
