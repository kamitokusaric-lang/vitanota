-- ============================================================
-- Unit-06: 週次レポート (今週のひとこと) 機能のための DB 変更
-- 設計書: aidlc-docs/construction/weekly-summary-design.md
--
-- 1. journal_entries.content_masked カラム追加
--    投稿時に正規表現マスキングを適用したテキスト。AI 入力に使用。
--    本人表示は content (原文) を引き続き使う。
--
-- 2. journal_weekly_summaries テーブル新規
--    AI が生成したねぎらい (週次) の保存先。
--    本人のみ閲覧可、1 ユーザー × 1 週 = 1 件 (PK で保証)。
-- ============================================================

-- ── Part 1: journal_entries.content_masked ──────────────────
ALTER TABLE journal_entries
  ADD COLUMN content_masked TEXT;

COMMENT ON COLUMN journal_entries.content_masked IS
  'マスキング済み本文 (AI 入力用)。本人表示は content (原文) を使う。新規投稿は API 側で生成、既存データは backfill で埋める。';

-- ── Part 2: journal_weekly_summaries ────────────────────────
-- 設計書 § 9
-- AI 出力 (summary) のみ保存。入力データ (集計内容) は保存しない。
CREATE TABLE journal_weekly_summaries (
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  week_start   DATE        NOT NULL,  -- 月曜日の日付 (週の始まり)
  summary      TEXT        NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);

COMMENT ON TABLE journal_weekly_summaries IS
  '週次レポート (今週のひとこと) AI 出力。本人のみ閲覧可、1 ユーザー × 1 週 = 1 件。';

CREATE INDEX journal_weekly_summaries_tenant_user_week_idx
  ON journal_weekly_summaries (tenant_id, user_id, week_start DESC);

-- ── Part 3: RLS for journal_weekly_summaries ────────────────
-- 本人のみアクセス可。school_admin にも他ユーザーのものは見せない。
-- system_admin は運用上必要に応じて bypass 可能。
-- 設計書 § 10「表示対象は本人のみ」を物理保証。
ALTER TABLE journal_weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_weekly_summaries FORCE ROW LEVEL SECURITY;

-- SELECT: 本人のみ
CREATE POLICY journal_weekly_summaries_owner_select ON journal_weekly_summaries
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() IS NULL          THEN false
      ELSE tenant_id = app_tenant_id() AND user_id = app_user_id()
    END
  );

-- INSERT: 本人のみ
CREATE POLICY journal_weekly_summaries_owner_insert ON journal_weekly_summaries
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() IS NULL          THEN false
      ELSE tenant_id = app_tenant_id() AND user_id = app_user_id()
    END
  );

-- UPDATE: 本人のみ (実質サーバー側でしか触らないが念のため)
CREATE POLICY journal_weekly_summaries_owner_update ON journal_weekly_summaries
  FOR UPDATE
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() IS NULL          THEN false
      ELSE tenant_id = app_tenant_id() AND user_id = app_user_id()
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() IS NULL          THEN false
      ELSE tenant_id = app_tenant_id() AND user_id = app_user_id()
    END
  );

-- DELETE: 本人のみ
CREATE POLICY journal_weekly_summaries_owner_delete ON journal_weekly_summaries
  FOR DELETE
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() IS NULL          THEN false
      ELSE tenant_id = app_tenant_id() AND user_id = app_user_id()
    END
  );
