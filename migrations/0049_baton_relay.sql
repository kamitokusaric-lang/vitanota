-- ============================================================
-- 0049: baton-relay (H7 朝のバトンリレー / 学校知の循環の入口) データ基盤
--
-- 循環の正本: docs/proposal/h7-circulation.md
-- build spec: docs/baton-relay/design.md
--
-- 新規 4 テーブル + 2 enum:
--   classes           クラス (クラス目標の最小単位)
--   students          生徒 (最小 PII・在籍状態 active/archived)
--   baton_notes       生徒欄の一言 (append-only ログ・同著者同日複数行可)
--   student_reactions 印 = positive(ポジティブ)/concern(気になる) のトグル
--
-- RLS 可視範囲 (chimo 2026-06-08 確定: school_admin は teacher と同一権限):
--   ✅ teacher / school_admin  自テナントを読み書き (全教員可視・相互関心層)
--      - 小規模校では管理職も担任として見守りに参加するため行レベルは同一
--      - 踏み絵 §3 は admin 向けの集計・温度カード・ランキング俯瞰を作らないことで守る
--        (このスライスはそれを一切作らない)
--   ✅ system_admin            全件読取 (健全性監視)
--   ❌ 他テナント              不可視
--   書込はノート/リアクションとも著者本人の行のみ (app 層 + RLS の二重)
--
-- 数値化・スコア化・ランキングはしない (踏み絵ガード 2/3)。
-- 終端バッチ (猶予 1 年後の匿名化/purge)・journal 連携・UI は後続スライス。
--
-- ロールバック:
--   DROP TABLE student_reactions; DROP TABLE baton_notes;
--   DROP TABLE students; DROP TABLE classes;
--   DROP TYPE student_reaction_type; DROP TYPE student_status;
-- ============================================================

CREATE TYPE student_status AS ENUM ('active', 'archived');
CREATE TYPE student_reaction_type AS ENUM ('positive', 'concern');

-- ── classes ──────────────────────────────────────────────────
CREATE TABLE classes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  goal_text   TEXT,
  school_year TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT classes_id_tenant_unique UNIQUE (id, tenant_id)
);

CREATE INDEX classes_tenant_idx ON classes(tenant_id);

-- ── students ─────────────────────────────────────────────────
CREATE TABLE students (
  id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID            NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_id     UUID            NOT NULL,
  display_name TEXT            NOT NULL,
  grade_label  TEXT,
  status       student_status  NOT NULL DEFAULT 'active',
  enrolled_at  DATE,
  left_at      DATE,
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT students_id_tenant_unique UNIQUE (id, tenant_id),
  -- 複合 FK: クロステナント参照の物理防止
  CONSTRAINT students_class_fk
    FOREIGN KEY (class_id, tenant_id)
    REFERENCES classes(id, tenant_id)
    ON DELETE CASCADE
);

CREATE INDEX students_tenant_idx ON students(tenant_id);
CREATE INDEX students_class_idx ON students(class_id);

-- ── baton_notes (append-only) ────────────────────────────────
CREATE TABLE baton_notes (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id     UUID         NOT NULL,
  author_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
  note_date      DATE         NOT NULL,
  content        TEXT         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT baton_notes_id_tenant_unique UNIQUE (id, tenant_id),
  CONSTRAINT baton_notes_student_fk
    FOREIGN KEY (student_id, tenant_id)
    REFERENCES students(id, tenant_id)
    ON DELETE CASCADE
);

CREATE INDEX baton_notes_tenant_student_date_idx
  ON baton_notes(tenant_id, student_id, note_date);
CREATE INDEX baton_notes_student_created_idx
  ON baton_notes(student_id, created_at DESC);

-- ── student_reactions (印・トグル) ───────────────────────────
CREATE TABLE student_reactions (
  id            UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID                   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id    UUID                   NOT NULL,
  user_id       UUID                   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type student_reaction_type  NOT NULL,
  created_at    TIMESTAMPTZ            NOT NULL DEFAULT NOW(),

  -- 1 教員 1 生徒 1 種で 1 行 (トグル整合)
  CONSTRAINT student_reactions_uniq UNIQUE (tenant_id, student_id, user_id, reaction_type),
  CONSTRAINT student_reactions_student_fk
    FOREIGN KEY (student_id, tenant_id)
    REFERENCES students(id, tenant_id)
    ON DELETE CASCADE
);

CREATE INDEX student_reactions_tenant_student_idx
  ON student_reactions(tenant_id, student_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE classes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes           FORCE  ROW LEVEL SECURITY;
ALTER TABLE students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE students          FORCE  ROW LEVEL SECURITY;
ALTER TABLE baton_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE baton_notes       FORCE  ROW LEVEL SECURITY;
ALTER TABLE student_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_reactions FORCE  ROW LEVEL SECURITY;

-- classes: 全教員 (teacher / school_admin) が自テナント読み書き
CREATE POLICY classes_member_all ON classes
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

-- students: 同上
CREATE POLICY students_member_all ON students
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

-- baton_notes: 読みは全教員可視 (相互関心層)、書きは著者本人の行のみ
CREATE POLICY baton_notes_member_read ON baton_notes
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

CREATE POLICY baton_notes_author_write ON baton_notes
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND author_user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND author_user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND author_user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND author_user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- student_reactions: 読みは全教員可視、書きは本人のリアクションのみ (トグル)
CREATE POLICY student_reactions_member_read ON student_reactions
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

CREATE POLICY student_reactions_owner_write ON student_reactions
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
