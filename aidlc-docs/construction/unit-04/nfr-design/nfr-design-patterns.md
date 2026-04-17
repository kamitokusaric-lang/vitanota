# Unit-04 NFR設計パターン

**作成日**: 2026-04-17

---

## 継承パターン（Unit-01〜03 で確立済み）

- SP-01: 構造化ログ（pino + redact）
- SP-02: 入力バリデーション（Zod）
- SP-03: RLS 多層防御（API 層 + DB 層）
- SP-04: HTTP セキュリティヘッダー

---

## Unit-04 固有パターン

### DP-U04-01: 管理者 API ロールゲート

全管理者 API に適用する共通パターン。

```typescript
// pages/api/admin/*.ts の先頭で実行
const ctx = await requireAuth(req, res);
if (!ctx) return;

if (!ctx.roles.includes('school_admin')) {
  return res.status(403).json({ error: 'FORBIDDEN', message: '管理者権限が必要です' });
}
```

- `requireAuth()` で認証チェック（401）
- `school_admin` ロールチェック（403）
- `withTenantUser()` で RLS 適用
- teacher ロールは全管理者 API で 403

### DP-U04-02: 本文非返却の物理保証

管理者向けサービス・リポジトリは日誌本文を一切 SELECT しない。

```typescript
// AdminDashboardService の集計クエリでは
// journal_entries からは created_at のみ参照（集計の日付基準）
// content 列は SELECT 句に含めない

// EmotionTrendService.getEmotionTrendForTeacher() は
// journal_entries + tags の JOIN で category を集計
// content は SELECT 句に含まれない（Unit-03 と同じ構造）
```

型レベルでも保証：返却型に `content` フィールドを持たない。

### DP-U04-03: アラート検知バッチの実行パターン

```typescript
// POST /api/cron/detect-alerts
// 1. requireAuth() で school_admin or system_admin を確認
// 2. withSystemAdmin() で全テナントにアクセス可能な状態で実行
// 3. 各テナントの教員を列挙
// 4. 検知ロジックを実行
// 5. アラートを INSERT（system_admin ロールで RLS 通過）
```

- `withSystemAdmin` で実行するため全テナントの alerts に INSERT 可能
- 各教員のデータ読み取りも system_admin の RLS ポリシーで許可
- 重複防止：同一教員 × 同一 type の open アラートがあればスキップ

### DP-U04-04: alerts RLS ポリシー設計

既存の CASE ベース RLS パターン（migration 0009 で確立）に従う。

```sql
-- teacher: アクセス不可
-- school_admin: 自テナントのみ
-- system_admin: 全テナント（cron バッチ用）
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;

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
```

### DP-U04-05: タイムゾーン処理

Unit-03 と同じ。集計クエリでは `AT TIME ZONE 'Asia/Tokyo'` で日本時間基準の日付に変換。
