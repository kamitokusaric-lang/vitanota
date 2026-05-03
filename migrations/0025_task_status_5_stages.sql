-- ============================================================
-- 0025: task_status enum を 5 段階に拡張
--
-- 旧 3 値 (todo / in_progress / done) を 5 値に拡張:
--   backlog       未着手 (まだ手をつけてない)
--   todo          今週やる (近日中の予定)
--   in_progress   進行中 (Doing)            ← 既存値を温存
--   review        確認・調整中 (Review)
--   done          完了
--
-- 既存データは 'todo' / 'in_progress' / 'done' のまま維持される (in_progress を
-- 'doing' に rename する案も検討したが、PostgreSQL の enum rename はオペレーション
-- が複雑なため、UI 表示だけ「進行中 (Doing)」にして value 名は据え置く)。
--
-- PostgreSQL 12+ では同一 transaction 内で ALTER TYPE ADD VALUE が許可される
-- (追加した値を同 transaction で使用しない限り)。本 migration は ADD VALUE のみ。
-- ============================================================

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'backlog' BEFORE 'todo';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'review' AFTER 'in_progress';
