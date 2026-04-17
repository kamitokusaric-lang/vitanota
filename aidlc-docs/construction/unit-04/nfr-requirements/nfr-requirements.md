# Unit-04 NFR要件

**作成日**: 2026-04-17
**対象ストーリー**: US-A-010・US-A-011・US-A-020・US-A-021

---

## 継承 NFR（Unit-01〜03 確定済み）

| NFR | 確定内容 |
|---|---|
| パフォーマンス | API レスポンス 500ms 以内（P95）、ページロード 3秒以内（P95） |
| セキュリテ��� | Security Baseline 全ルール適用（SECURITY-01〜15） |
| スケーラビリティ | RLS によるテナント隔離・RDS Proxy 接続プール |
| ログ | pino + redact（SP-01）・CloudWatch Logs 90日保持 |
| 認証 | Auth.js v4 database セッション・withTenantUser() パターン |
| テスト | ビジネスロジック 80% カバレッジ（Vitest） |
| バリデーション | Zod スキーマ共有（クライアント + API 二層） |

---

## Unit-04 固有 NFR

### NFR-U04-01: alerts テーブル RLS

**要件**: alerts テーブルに RLS を適用し、school_admin のみ自テナントのアラートを参照・更新可能とする。

**ポリシー設計**:
```sql
-- school_admin のみ SELECT/UPDATE 可能
CREATE POLICY alerts_admin_read ON alerts FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id()
      ELSE false
    END
  );

CREATE POLICY alerts_admin_write ON alerts
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id()
      ELSE false
    END
  );
```

- teacher ロールは alerts テーブルに一切アクセス不可
- cron バッチは system_admin ロールで実行（全テナントの alerts に INSERT 可能）

---

### NFR-U04-02: 管理者 API セキュリティ

| ルール | 適用内容 |
|---|---|
| SECURITY-05（入力検証） | teacherId・alertId のパスパラメータを Zod uuid で検証 |
| SECURITY-08（IDOR防止） | teacherId が自テナントの教員であることを API 層で検証 + RLS |
| SECURITY-11（多層防御） | API 層（school_admin ロールチェック）+ DB 層（RLS） |
| NFR-01-EX-1（情報分類） | 管理者 API は一切日誌本文を返却しない。SELECT 句に content を含めない |

---

### NFR-U04-03: cron API 認証

**要件**: `/api/cron/detect-alerts` は MVP では手動実行。通常の session 認証（school_admin or system_admin）で保護する。

**詳細**:
- `requireAuth()` で認証チェック
- school_admin または system_admin ロールのみ実行可能
- 将来の EventBridge 連携時に API キー認証に切り替え可能な構造にする（ただし MVP では実装しない）
- 全テナント一括で処理（`withSystemAdmin` で実行）

---

### NFR-U04-04: 全教員ステータス集計パフォーマンス

**要件**: `GET /api/admin/teachers` は 500ms 以内（P95）。

**詳細**:
- テナント内教員 50名×直近7日の集計
- 追加インデックス不要（既存の `journal_entries_user_created_idx` + alerts の `alerts_tenant_status_idx` で十分）
- キャッシュなし（手動リロード、Q7=C）

---

### NFR-U04-05: テスト要件

| テスト種別 | 対象 | 基準 |
|---|---|---|
| ユニットテスト | AlertDetectionService（negative_trend / recording_gap 検知ロジック） | 80% カバレッジ |
| ユニットテスト | AdminDashboardService（全教員集計ロジック） | 80% カバレッジ |
| コンポーネントテスト | TeacherStatusCard・AlertList・EmotionRatioBar | 描画確認 + props |
| 統合テスト | 全管理者 API（teacher ロールで 403 確認を含む） | 必須 |
| テナント隔離テスト | 他テナントの教員・アラートが見えないこと | 必須 |
| アクセス制御テスト | teacher → 管理者 API で 403、管理者 → 本文非取得 | 必須 |
