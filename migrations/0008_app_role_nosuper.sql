-- 0008: 非特権アプリ接続ロール vitanota_app を作成
--
-- 問題: アプリが PostgreSQL の bootstrap superuser (vitanota) で接続しており、
-- RLS が完全にバイパスされていた（クロステナント漏洩の根本原因）。
-- スーパーユーザーが存在すること自体は問題ではなく、
-- アプリがそのロールで接続していたことが問題。
--
-- 解決: 非特権ロール vitanota_app を作成し、アプリはこのロールで接続する。
--
-- ロール分離:
--   vitanota     = マイグレーション専用。スーパーユーザー（DDL 実行可）。
--   vitanota_app = アプリ専用。NOSUPERUSER NOBYPASSRLS（RLS に従う）。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vitanota_app') THEN
    CREATE ROLE vitanota_app LOGIN PASSWORD 'vitanota_app_local'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO vitanota_app;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO vitanota_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vitanota_app;

-- 今後 vitanota (superuser) が作成するテーブルにも自動で権限付与
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO vitanota_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO vitanota_app;
