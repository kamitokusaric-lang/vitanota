-- ============================================================
-- user_tenant_profiles: tenant 別ユーザープロフィール
-- 主用途: ニックネーム (tenant 内 unique)
-- 将来的に自己紹介・アバター等を同テーブルで拡張可能
-- ============================================================

CREATE TABLE user_tenant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_tenant_profiles_user_tenant_unique UNIQUE (user_id, tenant_id),
  -- nickname は tenant 内で unique、NULL は複数許容 (PostgreSQL 標準)
  CONSTRAINT user_tenant_profiles_tenant_nickname_unique UNIQUE (tenant_id, nickname)
);

CREATE INDEX user_tenant_profiles_tenant_idx ON user_tenant_profiles(tenant_id);
CREATE INDEX user_tenant_profiles_user_idx ON user_tenant_profiles(user_id);

-- ── RLS (0009 パターン) ─────────────────────────────────────
ALTER TABLE user_tenant_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenant_profiles FORCE ROW LEVEL SECURITY;

-- SELECT: tenant 内全員が閲覧可 (タイムライン・タスク等で表示するため)
CREATE POLICY user_tenant_profiles_read ON user_tenant_profiles
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: 自分のプロフィールのみ
CREATE POLICY user_tenant_profiles_own_write ON user_tenant_profiles
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
