-- ============================================================
-- 0053: journal_entry_kind enum に 'note' を追加
--
-- kind モデル再設計 (chimo 2026-06-16・範囲=中): 公開/私的は is_public に一本化し、
-- kind は「意図 (どの箱へ)」だけ持つ。私的側 diary/tweet/knowledge を 'note' に畳む。
--   note    = ただのメモ (is_public=false なら倉庫 / true なら一般の職員室ノート)
-- 残す kind: note / help / thanks / keep / concern (help/thanks=共有意図, keep/concern=生徒ノート)。
--
-- ⚠️ ADD VALUE 単独ファイル: 本番 db-migrator は各 migration を BEGIN…COMMIT で 1 トランザクションに
--   包む。PostgreSQL は ADD VALUE で追加した enum 値を同一トランザクション内で使えない。
--   よって 'note' の追加を先にコミットし、データ移行 (UPDATE) は 0054 に分離する (0050/0051 と同じ規律)。
--
-- ロールバック: enum からの値削除は非対応のため 'note' は残置 (未使用なら無害)。
--   データ移行のロールバックは 0054 ヘッダ参照。
-- ============================================================

ALTER TYPE journal_entry_kind ADD VALUE IF NOT EXISTS 'note';
