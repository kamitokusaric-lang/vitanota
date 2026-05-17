-- ============================================================
-- 0042: フィードバック返信 (feedback_replies) - F3
--
-- 設計: aidlc-docs/operations/post-mvp-backlog.md (F3 行)
-- ブランチ: feature/2026-05-17-feedback-reply
--
-- 片方向スレッド (system_admin の複数返信、教員 read-only):
--   - 教員に問い返し/圧を出さない (feedback_observed_moment_broken)
--   - 教員は自分の submission に紐づく replies のみ取得可
--   - school_admin/teacher の RLS は 0039 の「own row 可」パターン踏襲
--   - 内部 status enum は持たない (語彙踏み絵 feedback_design_vocab 回避)
--   - 返信者は「運営より」固定 (replier_user_id は表示しない、UI 層で吸収)
-- ============================================================

-- ── 複合 FK 用 UNIQUE (tasks 等で踏襲、migrations/0014 §52 / 0017 §19) ──
ALTER TABLE feedback_submissions
  ADD CONSTRAINT feedback_submissions_id_tenant_uniq UNIQUE (id, tenant_id);

-- ── 教員の既読時刻 (FAB モーダル accordion 展開時に NOW() 更新、null=未読扱い) ──
ALTER TABLE feedback_submissions
  ADD COLUMN last_read_by_submitter_at TIMESTAMPTZ;

-- ── feedback_replies: system_admin → 教員の片方向返信 ──
CREATE TABLE feedback_replies (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id      UUID         NOT NULL,
  tenant_id          UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- 親 submission の user_id を非正規化 (RLS で EXISTS subquery を避けるため)。
  -- PostgreSQL の RLS USING CASE 内で EXISTS + STABLE 関数を使うと、planner が
  -- 全 branch を pre-evaluate して app_tenant_id() が想定外に呼ばれて RAISE する罠を回避。
  submitter_user_id  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 退会時匿名化 (返信本体は残す)、 UI 層では一律「運営より」表記
  replier_user_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
  body               TEXT         NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- SP-U02-04 Layer 8: cross-tenant 参照防止 (taskComments と同パターン)
  CONSTRAINT feedback_replies_submission_fk
    FOREIGN KEY (submission_id, tenant_id)
    REFERENCES feedback_submissions(id, tenant_id)
    ON DELETE CASCADE
);

CREATE INDEX feedback_replies_submission_idx
  ON feedback_replies(submission_id, created_at ASC);
CREATE INDEX feedback_replies_tenant_idx
  ON feedback_replies(tenant_id);

-- ── RLS (0039 パターン: school_admin は自分の行は可) ──
-- 親 feedback_submissions は API 層保護のみ (0022 設計踏襲) だが、
-- 子 feedback_replies は二重防御で RLS を入れる。
-- feedback_replies に触る endpoint は必ず withTenantUser/withSystemAdmin
-- (src/shared/lib/db.ts) でラップする。さもなくば app_role() IS NULL で
-- 全件 0 行になる。
ALTER TABLE feedback_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_replies FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin 全件 / teacher は自分の submission への返信のみ
-- school_admin は完全不可視 (踏み絵: feedback_observed_moment_broken)
-- EXISTS subquery を使わず、submitter_user_id 列の直接比較で表現
-- (ai_sessions 0036 と同パターン、CASE 短絡保証)
CREATE POLICY feedback_replies_read ON feedback_replies
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN false
      WHEN app_role() = 'teacher'      THEN
        submitter_user_id = app_user_id()
        AND tenant_id = app_tenant_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: system_admin のみ (MVP は POST のみだが ALL で定義しておく)
CREATE POLICY feedback_replies_write ON feedback_replies
  FOR ALL
  USING (
    CASE WHEN app_role() = 'system_admin' THEN true ELSE false END
  )
  WITH CHECK (
    CASE WHEN app_role() = 'system_admin' THEN true ELSE false END
  );
