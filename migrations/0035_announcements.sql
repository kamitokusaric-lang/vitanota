-- ============================================================
-- 0035: 開発者からのお知らせ (announcements)
--
-- ユースケース: 運営 (system_admin = chimo) が教員に向けて発信する
-- お知らせを管理画面から CRUD する。全テナント共通 (tenant_id なし)。
--
-- 旧来は src/features/dashboard/lib/announcements.ts に静的配列で
-- 直書きしていた。本テーブルへ移行し、管理画面から運用できるようにする。
--
-- body は JSONB で string[] (行ごとの箱条書き)。
-- 公開期間制御 (from/to) は持たない: 作成したら即表示、不要なら削除。
-- ============================================================

CREATE TABLE announcements (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_date DATE         NOT NULL,
  title        TEXT         NOT NULL,
  body         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 新しい順 (publish_date 降順) の取得が主用途
CREATE INDEX announcements_publish_date_idx
  ON announcements(publish_date DESC, created_at DESC);

-- ============================================================
-- RLS ポリシー
-- ============================================================

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;

-- SELECT: 認証済み全ロール (教員にも見せる、テナント無関係)
CREATE POLICY announcements_read ON announcements
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

-- INSERT/UPDATE/DELETE: system_admin only
CREATE POLICY announcements_write ON announcements
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

-- ============================================================
-- 既存 announcements.ts の 2 件を seed (DB 化時の連続性)
-- ============================================================

INSERT INTO announcements (publish_date, title, body) VALUES
  (
    '2026-05-09',
    'タスクを全員分表示した時、自分のタスクカードの左横に赤線がつくように変更しました。',
    '[]'::jsonb
  ),
  (
    '2026-05-08',
    'たくさんのフィードバックをありがとうございます！',
    '["タスク担当者を選択する際に、下部が見切れてしまうバグを修正しました。","タスクを追加したのに見えないという声が多かったので、タスクボードの初期表示を今日以降のタスクに変更しました。"]'::jsonb
  );
