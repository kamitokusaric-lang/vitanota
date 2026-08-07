-- ============================================================
-- 0057: 研修 (workshop) — チェックイン回答と振り返り紐付け
--
-- 決め打ちワークショップの箱。箱メタ (タイトル・チェックインの問い) は
-- コード定数 (src/features/workshop/constants.ts)。DB は参加者の入力だけを持つ。
-- 箱本体テーブル・参加者テーブルは作らない (参加者 = テナント内の先生全員)。
--
--   workshop_checkins    : 研修前チェックインの回答。1人1回答・上書き可。
--                          journal に一切乗せない別テーブル →
--                          職員室/公開タイムライン/AI に構造的に漏れない (踏み絵 B案)。
--   workshop_reflections : 研修後の振り返り (既存 journal_entries) を箱に紐付ける
--                          中間テーブル。journal_entries を ALTER しない。
--                          紐付いた note は is_public=true で職員室に自動露出。
--
-- 複合 FK (journal_entry_id, tenant_id) でクロステナント参照を物理防止。
-- RLS は journal_comments (0056) パターンを踏襲。
-- ============================================================

-- ── workshop_checkins ───────────────────────────────────────
CREATE TABLE workshop_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workshop_id UUID NOT NULL,
  -- 退会・転勤時は SET NULL で匿名化 (回答自体は箱に残す)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 1人1回答 (上書き)。user_id NULL (退会後) は Postgres 上で複数許容される
  CONSTRAINT workshop_checkins_workshop_user_unique UNIQUE (workshop_id, user_id),
  CONSTRAINT workshop_checkins_answer_length CHECK (
    length(answer) > 0 AND length(answer) <= 2000
  )
);

CREATE INDEX workshop_checkins_tenant_idx   ON workshop_checkins(tenant_id);
CREATE INDEX workshop_checkins_workshop_idx ON workshop_checkins(workshop_id);

ALTER TABLE workshop_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_checkins FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内 (= 参加者。箱の中で参加者同士に見える)。
-- 職員室への非漏洩は「journal ではない別テーブル」で構造的に保証される。
CREATE POLICY workshop_checkins_tenant_read ON workshop_checkins
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

-- INSERT: テナント内の自分名義で
CREATE POLICY workshop_checkins_insert ON workshop_checkins
  FOR INSERT
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

-- UPDATE: 自分の回答のみ (上書き = ON CONFLICT DO UPDATE で使う)
CREATE POLICY workshop_checkins_update ON workshop_checkins
  FOR UPDATE
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

-- ── workshop_reflections ────────────────────────────────────
CREATE TABLE workshop_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workshop_id UUID NOT NULL,
  journal_entry_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- クロステナント参照防止 (複合 FK)。note 削除で紐付けも自動除去。
  CONSTRAINT workshop_reflections_entry_fk
    FOREIGN KEY (journal_entry_id, tenant_id)
    REFERENCES journal_entries(id, tenant_id)
    ON DELETE CASCADE,

  CONSTRAINT workshop_reflections_workshop_entry_unique
    UNIQUE (workshop_id, journal_entry_id)
);

CREATE INDEX workshop_reflections_tenant_idx   ON workshop_reflections(tenant_id);
CREATE INDEX workshop_reflections_workshop_idx ON workshop_reflections(workshop_id);

ALTER TABLE workshop_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_reflections FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内 (紐付いた journal 本体は is_public=true で既にテナント可視)
CREATE POLICY workshop_reflections_tenant_read ON workshop_reflections
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

-- INSERT: テナント内 (振り返り投稿トランザクションで、投稿者ロールで INSERT)
CREATE POLICY workshop_reflections_insert ON workshop_reflections
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
