-- 0007: FORCE ROW LEVEL SECURITY
-- テーブルオーナーは RLS をバイパスするのがデフォルト。
-- 本プロジェクトではアプリ接続ロールがテーブルオーナーと同一のケースが
-- あり得るため、FORCE を付与してオーナーに対しても RLS を強制する。
-- これが無いとクロステナント漏洩が発生する（E2E 03-timeline で検知）。

ALTER TABLE journal_entries    FORCE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_tags FORCE ROW LEVEL SECURITY;
ALTER TABLE tags               FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions           FORCE ROW LEVEL SECURITY;
ALTER TABLE user_tenant_roles  FORCE ROW LEVEL SECURITY;
