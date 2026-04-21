-- 0013: vitanota_app に rds_iam ロールを付与して IAM 認証を有効化
--
-- 前提: 0008 で vitanota_app (NOSUPERUSER NOBYPASSRLS) は作成済み。
-- 本マイグレーションは AWS RDS 上でのみ有効な rds_iam ロールを付与する。
-- rds_iam は RDS 管理の事前定義ロールで、ローカル PostgreSQL には存在しない
-- ため、ロールの存在を確認して条件付き実行する。
--
-- 適用後、App Runner 側の getDbAuthToken() で発行した IAM 認証トークンを
-- 使って vitanota_app として接続できるようになる。

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rds_iam') THEN
    GRANT rds_iam TO vitanota_app;
  END IF;
END
$$;
