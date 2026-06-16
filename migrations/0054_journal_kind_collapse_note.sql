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
-- ⚠️ 片道移行: tweet と knowledge と diary の kind 区別は失われる (どれも note になる)。
--   ただし is_public は保たれるので可視性は変わらない。
--   適用前に journal_entries の (id, kind, is_public) をバックアップしておくこと。
--   復元したいときは: バックアップから kind を id 一致で書き戻す。
--
-- 旧 enum 値 diary/tweet/knowledge は物理削除しない (Postgres は値削除に型再作成が必要)。
--   コード側で参照を停止する。掃除は後日の別 migration で。
-- ============================================================

UPDATE journal_entries
  SET kind = 'note'
  WHERE kind IN ('diary', 'tweet', 'knowledge');

ALTER TABLE journal_entries ALTER COLUMN kind SET DEFAULT 'note';
