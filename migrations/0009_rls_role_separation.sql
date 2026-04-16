-- 0009: RLS ポリシーのロール分離 + ヘルパー関数 + CASE 式書き換え
--
-- 設計原則:
--   1. app.tenant_id に 'system_admin' 等の特別値を混ぜない（ロールとテナントの分離）
--   2. CASE 式で評価順序を保証する（PostgreSQL は OR/AND の短絡評価を保証しない）
--   3. NULL / 空文字を明示的にガードする（デフォルト拒否）
--   4. 4 ロール体制: teacher / school_admin / system_admin / bootstrap
--
-- セッション変数:
--   app.role      — 'teacher' | 'school_admin' | 'system_admin' | 'bootstrap'
--   app.tenant_id — uuid（teacher / school_admin のみ。system_admin / bootstrap では未設定 = NULL）
--   app.user_id   — uuid（全ロールで必須）

-- ============================================================
-- ヘルパー関数
-- ============================================================

-- app.role を読む（NULL / 空文字 → NULL）
CREATE OR REPLACE FUNCTION app_role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.role', true), '')
$$;

-- app.tenant_id を uuid で読む。未設定ならエラー（デフォルト拒否）。
-- system_admin / bootstrap 経路からは CASE で分岐するため呼ばれない前提。
-- 万が一呼ばれた場合は即座に例外を投げてトランザクションを中断する。
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v text := current_setting('app.tenant_id', true);
BEGIN
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'app.tenant_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v::uuid;
END;
$$;

-- app.user_id を uuid で読む。未設定ならエラー。
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v text := current_setting('app.user_id', true);
BEGIN
  IF v IS NULL OR v = '' THEN
    RAISE EXCEPTION 'app.user_id is not set'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v::uuid;
END;
$$;

-- ============================================================
-- 既存ポリシーの削除
-- ============================================================

DROP POLICY IF EXISTS journal_entry_owner_all   ON journal_entries;
DROP POLICY IF EXISTS journal_entry_public_read ON journal_entries;
DROP POLICY IF EXISTS journal_entry_tags_tenant ON journal_entry_tags;
DROP POLICY IF EXISTS sessions_owner_read       ON sessions;
DROP POLICY IF EXISTS sessions_write            ON sessions;
DROP POLICY IF EXISTS tags_tenant_read          ON tags;
DROP POLICY IF EXISTS tags_tenant_write         ON tags;
DROP POLICY IF EXISTS tenant_isolation          ON user_tenant_roles;

-- ============================================================
-- 新ポリシー（CASE 式）
-- ============================================================

-- journal_entries: オーナーによる全操作
CREATE POLICY journal_entry_owner_all ON journal_entries
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- journal_entries: テナント内公開エントリの閲覧
CREATE POLICY journal_entry_public_read ON journal_entries
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN is_public = true AND tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN is_public = true AND tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- journal_entry_tags: テナント内操作
CREATE POLICY journal_entry_tags_tenant ON journal_entry_tags
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- tags: テナント内閲覧
CREATE POLICY tags_tenant_read ON tags
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

-- tags: テナント内書き込み
CREATE POLICY tags_tenant_write ON tags
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- sessions: RLS を無効化
-- Auth.js DrizzleAdapter がセッショントークンで sessions を読み取る時点では
-- 認証コンテキスト（app.role 等）が存在しない（鶏卵問題）。
-- sessions テーブルは暗号学的ランダムトークンで保護されており、
-- テナントスコープのデータではないため、RLS は不要。
ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions NO FORCE ROW LEVEL SECURITY;

-- user_tenant_roles: テナント内操作
CREATE POLICY user_tenant_roles_access ON user_tenant_roles
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- user_tenant_roles: bootstrap 用（セッション解決時に自分の行だけ読める）
CREATE POLICY user_tenant_roles_bootstrap ON user_tenant_roles
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'bootstrap' THEN user_id = app_user_id()
      ELSE false
    END
  );

-- ============================================================
-- ビューの security_invoker 設定
-- ============================================================

-- public_journal_entries ビューのオーナーは vitanota (superuser) のため、
-- デフォルトではビュー経由のクエリでオーナー権限で RLS が評価される = バイパス。
-- security_invoker = true にすることで、呼び出し元 (vitanota_app) の権限で評価される。
ALTER VIEW public_journal_entries SET (security_invoker = true);
