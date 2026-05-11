-- ============================================================
-- 0034: ユーザーごとフィルタ設定保存
--
-- ユースケース: 教員が TaskBoard で 担当者 / 期間 / タグ / カテゴリ / 依頼中
-- 表示 等のフィルタを自分用にカスタマイズし、「このフィルタを保存」ボタンで
-- デフォルトとして記憶。次回 TaskBoard 起動時に自動適用される。
--
-- context カラムで将来 journal フィルタ等にも横展開可能 (現状は 'tasks' のみ)。
-- settings JSONB の構造は context 別 (現状 'tasks' のみ):
--   { filterOwner, filterTagIds, filterCategoryIds, showDelegated, period }
-- ============================================================

CREATE TABLE user_filter_preferences (
  user_id    UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  context    TEXT         NOT NULL,
  settings   JSONB        NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tenant_id, context)
);

CREATE INDEX user_filter_preferences_user_tenant_idx
  ON user_filter_preferences(user_id, tenant_id);

-- ============================================================
-- RLS ポリシー
-- ============================================================

ALTER TABLE user_filter_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_filter_preferences FORCE ROW LEVEL SECURITY;

-- SELECT: 本人のみ (system_admin は管理用に全件可)
CREATE POLICY user_filter_preferences_read ON user_filter_preferences
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: 自分の user_id でテナント内のみ
CREATE POLICY user_filter_preferences_write ON user_filter_preferences
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
