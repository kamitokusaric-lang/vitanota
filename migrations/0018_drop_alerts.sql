-- ============================================================
-- alerts テーブル廃止 (Phase 2 哲学判断)
--
-- 背景: 「管理者を監視装置にしない」という踏み絵に照らし、
-- 閾値超えアラート通知は vitanota の姿勢と合わない。
-- 稼働負荷の兆しは task ベースの可視化に統合する方針へ。
-- ============================================================

-- RLS ポリシーは DROP TABLE CASCADE で自動削除される
DROP TABLE IF EXISTS alerts;

-- 関連 enum を削除
DROP TYPE IF EXISTS alert_type;
DROP TYPE IF EXISTS alert_status;
