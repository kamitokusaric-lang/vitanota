-- ============================================================
-- 0037: tasks.source_chat_snippet
--
-- AI チャット (ai_sessions 経由) から作成された tasks の source 文脈を
-- optional に保持。永続的なチャット履歴ページは作らない方針だが、
-- タスクから「どんな入力から生まれたか」を遡れる UX のための短い snippet。
--
-- 既存タスク INSERT 経路は影響なし (NULL 許可)。
-- 既存 RLS (tasks_* policies) でそのまま保護される。
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN source_chat_snippet TEXT NULL;
