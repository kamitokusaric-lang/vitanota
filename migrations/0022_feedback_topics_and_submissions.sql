-- ============================================================
-- 0022: フィードバック (feedback_topics + feedback_submissions)
-- 5/7 教員向け説明会向け機能 B
--
-- 設計: aidlc-docs/inception/application-design/2026-05-07-meeting-features-design.md
-- 要件: aidlc-docs/inception/requirements/2026-05-07-meeting-features.md (機能 B)
--
-- 裏テーマ防御の核心 (memory: 観測されてると思われた瞬間に壊れる):
--   feedback_submissions は SELECT を system_admin のみに絞ることで、教員の投稿を
--   同校の他教員 / school_admin から DB レベルで物理的に不可視にする。
--   「同僚に見られてるかも」という心理が湧いた瞬間に投稿が嘘データ化するため、
--   アプリ層の隠蔽だけでは不十分。RLS で物理保証する。
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

-- ============================================================
-- RLS ポリシー (0009 の CASE 式パターンを踏襲)
-- ヘルパー関数: app_role() / app_tenant_id() / app_user_id()
-- ============================================================

-- ── feedback_topics ──
ALTER TABLE feedback_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_topics FORCE ROW LEVEL SECURITY;

-- SELECT: 全認証ロール可 (教員も active トピック取得が必要)
CREATE POLICY feedback_topics_read ON feedback_topics
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN true
      WHEN app_role() = 'teacher'       THEN true
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- INSERT / UPDATE / DELETE: system_admin のみ
CREATE POLICY feedback_topics_write ON feedback_topics
  FOR ALL
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      ELSE false
    END
  )
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      ELSE false
    END
  );

-- ── feedback_submissions ──
ALTER TABLE feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_submissions FORCE ROW LEVEL SECURITY;

-- SELECT: system_admin のみ (裏テーマ防御の核)
-- teacher / school_admin は自分の投稿すら DB から取れない。
-- アプリ UI 側にも「自分の投稿履歴」を見せない設計と整合する。
CREATE POLICY feedback_submissions_read ON feedback_submissions
  FOR SELECT
  USING (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      ELSE false
    END
  );

-- INSERT: teacher / school_admin / system_admin
-- WITH CHECK で tenant_id と user_id を session 値と一致させ、なりすましを物理拒否
CREATE POLICY feedback_submissions_insert ON feedback_submissions
  FOR INSERT
  WITH CHECK (
    CASE
      WHEN app_role() = 'system_admin'  THEN true
      WHEN app_role() = 'school_admin'  THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() = 'teacher'       THEN tenant_id = app_tenant_id() AND user_id = app_user_id()
      WHEN app_role() IS NULL           THEN false
      ELSE false
    END
  );

-- UPDATE / DELETE: ポリシー未定義 = デフォルト拒否
-- 「投稿の編集 / 削除」は Out of scope (要件で明示、教員にも system_admin にも操作不可)
