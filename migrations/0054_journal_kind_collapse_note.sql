-- ============================================================
-- 0054: 私的側 kind (diary/tweet/knowledge) を 'note' に集約 + default を note に
--
-- 0053 で追加した 'note' を使う (別ファイル = 別トランザクションなので安全)。
-- diary/tweet/knowledge はいずれも「ただのメモ」に畳む。
--
-- ★ is_public は一切触らない (chimo 2026-06-16 死守ルール)。
--   今 公開のもの (tweet/knowledge) は公開 note、今 非公開のもの (diary) は非公開 note。
--   ユーザーから見た公開/非公開ステータスを移行前後で完全に保つ。
--
-- 【保険】移行直前に (id, kind, is_public) を退避テーブルへバックアップする。
--   collapse は片道 (tweet/knowledge/diary の区別が失われる) ため。
--   ▼戻し方 (kind だけ書き戻せば十分・is_public は本 migration で不変):
--     UPDATE journal_entries je
--       SET kind = b.kind
--       FROM journal_entries_kind_backup_0054 b
--       WHERE je.id = b.id AND je.kind <> b.kind;
--   問題なしを確認したら別 migration で DROP TABLE journal_entries_kind_backup_0054 して掃除。
--
-- 旧 enum 値 diary/tweet/knowledge は物理削除しない (Postgres は値削除に型再作成が必要)。
--   コード側で参照を停止する。掃除は後日の別 migration で。
-- ============================================================

-- 移行直前バックアップ (同一トランザクション内なので collapse と原子的)。
CREATE TABLE IF NOT EXISTS journal_entries_kind_backup_0054 AS
  SELECT id, kind, is_public FROM journal_entries;

UPDATE journal_entries
  SET kind = 'note'
  WHERE kind IN ('diary', 'tweet', 'knowledge');

ALTER TABLE journal_entries ALTER COLUMN kind SET DEFAULT 'note';
