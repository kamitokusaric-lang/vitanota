-- ============================================================
-- 0060: 学年会 (grade-meeting) — クラス状況を持ち寄る同期 Orient の場
--
-- OODA の Orient (前提の問い直し) は構造的に1人でできない。
-- 学年団が集まった場で、1クラスずつ「事実 → 意味 → 次の一手」を出し合う。
-- 紙の OODA 記録シート (研修の配布物3) をクラスに当てたもの。
--
--   observe : 「事実として、何が見える?」  複数行
--   orient  : 「その事実は、何を意味する?」複数行 (1つに畳まない)
--   action  : 「次の一手」                 1クラス1行
--
-- ★ 判断 (orient) を複数のまま持つのが設計の核。
--   同じ事実でも意味づけは人によって違う。1つにまとめた瞬間に Orient は死ぬ。
--
-- ★ 無記名。author_user_id は持つが API では返さない
--   (自分の行を消す・直すためだけに使う)。
--   「誰がどの前提を出したか」を評価に使える形にした瞬間、次から本音が消える。
--   → 未提出者一覧・提出率も作らない (アプリ側の約束)。
--
-- 学年会の「回」は手で「学年会をはじめる」を押したときだけ作る (自動生成しない)。
-- RLS は 0056/0057/0058 の app_role() CASE パターンを踏襲。
-- ============================================================

-- ── grade_meetings (学年会の1回) ─────────────────────────────
CREATE TABLE grade_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL,
  held_on DATE NOT NULL,
  -- はじめた人。UI には出さない (会の持ち主を作らない)
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 同じ学年・同じ日の会は1つ (二度押しで増やさない)
  CONSTRAINT grade_meetings_tenant_grade_date_unique
    UNIQUE (tenant_id, grade, held_on),
  CONSTRAINT grade_meetings_grade_range CHECK (grade >= 1 AND grade <= 12),
  -- 複合 FK の参照先として必要
  CONSTRAINT grade_meetings_id_tenant_unique UNIQUE (id, tenant_id)
);

CREATE INDEX grade_meetings_tenant_grade_idx
  ON grade_meetings(tenant_id, grade, held_on DESC);

ALTER TABLE grade_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_meetings FORCE ROW LEVEL SECURITY;

CREATE POLICY grade_meetings_tenant_read ON grade_meetings
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

-- INSERT: テナント内の誰でも会をはじめられる (学年団に持ち主を作らない)
CREATE POLICY grade_meetings_insert ON grade_meetings
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND created_by = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND created_by = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- ── class_meeting_notes (観察 / 判断 / 一手) ──────────────────
CREATE TYPE class_meeting_note_kind AS ENUM ('observe', 'orient', 'action');

CREATE TABLE class_meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  class_id UUID NOT NULL,
  kind class_meeting_note_kind NOT NULL,
  content TEXT NOT NULL,
  -- 書いた人。UI にも API レスポンスにも出さない (無記名)。
  -- 自分の行だけ消す・直すための判定にのみ使う。
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- クロステナント参照の物理防止 (baton_notes と同型)
  CONSTRAINT class_meeting_notes_meeting_fk
    FOREIGN KEY (meeting_id, tenant_id)
    REFERENCES grade_meetings(id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT class_meeting_notes_class_fk
    FOREIGN KEY (class_id, tenant_id)
    REFERENCES classes(id, tenant_id)
    ON DELETE CASCADE,

  CONSTRAINT class_meeting_notes_content_length CHECK (
    length(content) > 0 AND length(content) <= 1000
  )
);

-- 「次の一手」だけは 1回 × 1クラスで1行 (クラスとして1つ決めるもの)。
-- observe / orient は何行でも入る。
CREATE UNIQUE INDEX class_meeting_notes_action_unique
  ON class_meeting_notes(meeting_id, class_id)
  WHERE kind = 'action';

CREATE INDEX class_meeting_notes_meeting_class_idx
  ON class_meeting_notes(meeting_id, class_id, kind, created_at);
CREATE INDEX class_meeting_notes_tenant_idx
  ON class_meeting_notes(tenant_id);

ALTER TABLE class_meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_meeting_notes FORCE ROW LEVEL SECURITY;

-- SELECT: テナント内 (学年会に集まった全員が卓上を見る)
CREATE POLICY class_meeting_notes_tenant_read ON class_meeting_notes
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
CREATE POLICY class_meeting_notes_insert ON class_meeting_notes
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND author_user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND author_user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- UPDATE: 観察・判断は本人のみ (出した事実は本人が引っ込められる)。
-- 「次の一手」だけはテナント内なら誰でも上書きできる (書記が誰でもよい・
-- 研修のチーム振り返りと同じ判断)。上書き時は author_user_id を自分に付け替える。
CREATE POLICY class_meeting_notes_update ON class_meeting_notes
  FOR UPDATE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND (kind = 'action'
                                                  OR author_user_id = app_user_id())
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND (kind = 'action'
                                                  OR author_user_id = app_user_id())
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND author_user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND author_user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- DELETE: 観察・判断は本人のみ。一手はテナント内なら誰でも (差し替えのため)。
CREATE POLICY class_meeting_notes_delete ON class_meeting_notes
  FOR DELETE
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id()
                                             AND (kind = 'action'
                                                  OR author_user_id = app_user_id())
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id()
                                             AND (kind = 'action'
                                                  OR author_user_id = app_user_id())
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );
