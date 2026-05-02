-- ============================================================
-- 0022: フィードバック (feedback_topics + feedback_submissions)
-- 5/7 教員向け説明会向け機能 B
--
-- 設計: aidlc-docs/inception/application-design/2026-05-07-meeting-features-design.md
-- 要件: aidlc-docs/inception/requirements/2026-05-07-meeting-features.md (機能 B)
--
-- ── RLS は適用しない (invitation_tokens と同じパターン) ──
-- 行レベル隔離の複雑さがシンプル (「教員 INSERT / system_admin SELECT」のみ) で、
-- API 層の権限チェック + tenant_id/user_id 強制注入で十分担保できるため。
--
-- 裏テーマ防御 (memory: 観測されてると思われた瞬間に壊れる):
--   要件レベルで以下を絶対不可侵とする:
--     1. 教員 UI に「自分の投稿履歴」を一切作らない
--     2. 「運営にだけ届きます」を投稿モーダルに必ず表示
--     3. /api/system/feedback* は session.roles に system_admin がない場合 403
--
-- 初期トピック seed: 含めない (chimo が CRUD UI から手動で 3 件登録する運用)
-- ============================================================

-- ── feedback_topics: 運営マスタ (テナント横断、全テナント共通) ──
CREATE TABLE feedback_topics (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(100) NOT NULL,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 教員 UI のトピック取得用 (is_active=true のみ + sort_order ソート)
CREATE INDEX feedback_topics_active_sort_idx
  ON feedback_topics(sort_order)
  WHERE is_active = true;

-- ── feedback_submissions: 教員 → 運営の一方向投稿 ──
CREATE TABLE feedback_submissions (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id   UUID         NOT NULL REFERENCES feedback_topics(id) ON DELETE RESTRICT,
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content    TEXT         NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 投稿一覧画面のトピック別フィルタ + 時系列降順
CREATE INDEX feedback_submissions_tenant_created_idx
  ON feedback_submissions(tenant_id, created_at DESC);

-- トピック削除可否判定 (投稿数 COUNT) 用
CREATE INDEX feedback_submissions_topic_idx
  ON feedback_submissions(topic_id);
