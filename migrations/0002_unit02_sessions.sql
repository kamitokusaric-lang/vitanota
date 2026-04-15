-- Unit-02 マイグレーション 0002: Auth.js database セッション戦略
-- SP-07 論点C対応: JWT 失効不可問題を解決
-- 既存の JWT セッションから DB セッションに切替

-- ── sessions テーブル ──────────────────────────────────────
CREATE TABLE sessions (
  session_token VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_tenant_id_idx ON sessions(active_tenant_id);
CREATE INDEX sessions_expires_idx ON sessions(expires);

-- ── verification_tokens テーブル（Auth.js 標準） ───────────
CREATE TABLE verification_tokens (
  identifier VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ── RLS: sessions テーブル ─────────────────────────────────
-- 所有者のみ自身のセッションを SELECT 可能
-- school_admin はテナント内の全セッションを参照・削除可能（将来の管理画面用）
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sessions_owner_read ON sessions
  AS PERMISSIVE
  FOR SELECT
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ── 期限切れセッションの日次クリーンアップ（運用 Runbook 参照） ──
-- DELETE FROM sessions WHERE expires < NOW() - INTERVAL '7 days';
