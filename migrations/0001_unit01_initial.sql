-- Unit-01 初期マイグレーション
-- テナント・ユーザー・ロール・招待・OAuth アカウントテーブルの作成

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── tenants ───────────────────────────────────────────────────
CREATE TABLE tenants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(50)  NOT NULL UNIQUE,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_tenant_status CHECK (status IN ('active', 'suspended')),
  CONSTRAINT chk_tenant_slug   CHECK (slug ~ '^[a-z0-9-]+$')
);

-- ── users ─────────────────────────────────────────────────────
CREATE TABLE users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) NOT NULL UNIQUE,
  name           VARCHAR(100),
  image          TEXT,
  email_verified TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── user_tenant_roles ─────────────────────────────────────────
CREATE TABLE user_tenant_roles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  tenant_id  UUID                 REFERENCES tenants(id) ON DELETE CASCADE,
  role       VARCHAR(20)  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_role CHECK (role IN ('teacher', 'school_admin', 'system_admin')),
  CONSTRAINT uq_user_tenant_role UNIQUE (user_id, tenant_id, role)
);

-- ── invitation_tokens ─────────────────────────────────────────
CREATE TABLE invitation_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL,
  token       VARCHAR(64)  NOT NULL UNIQUE,
  invited_by  UUID        NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_invite_role CHECK (role IN ('teacher', 'school_admin'))
);

-- ── accounts（Auth.js OAuth） ──────────────────────────────────
CREATE TABLE accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                VARCHAR(50)  NOT NULL,
  provider            VARCHAR(50)  NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          INTEGER,
  token_type          VARCHAR(50),
  scope               TEXT,
  id_token            TEXT,
  CONSTRAINT uq_provider_account UNIQUE (provider, provider_account_id)
);

-- ── RLS 有効化 ────────────────────────────────────────────────
ALTER TABLE user_tenant_roles ENABLE ROW LEVEL SECURITY;

-- user_tenant_roles の RLS ポリシー
-- withTenant() が SET LOCAL app.tenant_id = '<tenantId>' を発行する
-- system_admin は 'system_admin' という特別な値を設定してバイパス
CREATE POLICY tenant_isolation ON user_tenant_roles
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.tenant_id', true) = 'system_admin'
  );

-- ── インデックス ──────────────────────────────────────────────
CREATE INDEX idx_user_tenant_roles_user_id   ON user_tenant_roles(user_id);
CREATE INDEX idx_user_tenant_roles_tenant_id ON user_tenant_roles(tenant_id);
CREATE INDEX idx_invitation_tokens_token     ON invitation_tokens(token);
CREATE INDEX idx_invitation_tokens_email     ON invitation_tokens(email);
CREATE INDEX idx_accounts_user_id            ON accounts(user_id);
