-- ============================================================
-- 0055: journal_recommendations (ふりかえり → AIリコメンドの結果保持)
--
-- 設計: docs/proposal/retrospective.md / project_retro_recommend_20260630
-- マイノート(非公開 note)の「今日のふりかえり」を AI が読み、職員室ボード/ノートへの
-- 公開を区分つきでそっと提案する。その提案結果 (§6 出力スキーマ) と本人の対応状態を保持する。
--
-- 役割:
--   1. 計算↔表示の橋渡し: 保存起点で裏で計算した結果を、後でマイノート詳細に出すまで保持。
--   2. キャッシュ: entry あたり最大1回の Bedrock 呼び出しに抑える (journal_entry_id UNIQUE)。
--   3. 状態: proposed / published / dismissed。再ナッジ抑止 + §9 転換率/見送り率の計測の素。
--   4. entry と 1:1 + 連動削除 (ふりかえりを消したらリコメンドも消える)。
--
-- RLS 可視範囲 (ai_sessions 0036/0039 と同水準の踏み絵):
--   ✅ 本人 (teacher / school_admin で user_id = app_user_id() かつ tenant 一致)
--   ✅ system_admin (集計用、全件読取・書込不可)
--   ❌ school_admin が他人の中間状態を見ること (= 観測者原則)
--   ❌ 他テナント
--
-- 構造化ログ方針: output_json / 本文を構造化ログに流さない (個人情報混入前提)。
-- ============================================================

CREATE TYPE journal_recommendation_status AS ENUM ('proposed', 'published', 'dismissed');

CREATE TABLE journal_recommendations (
  id                UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID                          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           UUID                          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  journal_entry_id  UUID                          NOT NULL UNIQUE REFERENCES journal_entries(id) ON DELETE CASCADE,
  output_json       JSONB                         NOT NULL DEFAULT '{}'::jsonb,
  status            journal_recommendation_status NOT NULL DEFAULT 'proposed',
  -- プロンプト改善用のメタ (system_admin 匿名エクスポート/集計で使う。output_json とは分離して
  -- 保持し、契約スキーマ(retroRecommendResultSchema strict)を汚さない)。
  input_masked      TEXT,                          -- PII マスク済のふりかえり本文 (計算時)
  model_id          TEXT,                          -- 使用モデル (計算時。ローカル mock は 'mock')
  prompt_version    TEXT,                          -- プロンプト版 (計算時。バージョン間比較用)
  final_category    TEXT,                          -- 公開時に本人が選んだ最終区分 (公開時)
  body_changed      BOOLEAN,                       -- 公開時に本文を編集したか (公開時)
  created_at        TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);

CREATE INDEX journal_recommendations_user_idx ON journal_recommendations(user_id, created_at DESC);
CREATE INDEX journal_recommendations_tenant_idx ON journal_recommendations(tenant_id);

ALTER TABLE journal_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_recommendations FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin (集計) + 本人 (school_admin も自分の分のみ・他人不可)
CREATE POLICY journal_recommendations_read ON journal_recommendations
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin' THEN true
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );

-- INSERT/UPDATE/DELETE: 本人のみ (system_admin は読取のみ・書込権限なし)
CREATE POLICY journal_recommendations_write ON journal_recommendations
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'school_admin' THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'      THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL          THEN false
      ELSE false
    END
  );
