-- ============================================================
-- 0052: announcements (機能追加ログ / お知らせ管理) の廃止
--
-- 機能不要となったため、テーブルをまるごと削除する (chimo 2026-06-15)。
-- 関連 RLS ポリシー (announcements_read / announcements_write) と
-- インデックス (announcements_publish_date_idx) は DROP TABLE で
-- 自動的に消える。CASCADE は依存オブジェクトが無いため保険。
--
-- 0035_announcements.sql は履歴として残す (append-only)。本 migration が
-- 実体を落とす。新規 DB では 0035 で作成 → 0052 で削除、の順で no-op に収束。
-- ============================================================

DROP TABLE IF EXISTS announcements CASCADE;
