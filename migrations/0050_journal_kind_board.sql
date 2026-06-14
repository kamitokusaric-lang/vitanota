-- ============================================================
-- 0050: journal_entry_kind enum に職員室ボードのカテゴリを追加
--
-- H7-B 職員室ボード (staffroom / 学校知の循環の出口) のための前段。
-- 循環の正本: docs/proposal/h7-circulation.md / build spec: docs/staffroom/design.md
--
-- chimo 2026-06-10 確定: board は専用テーブルにも補助 enum 列にもせず、
-- journal_entry_kind の直値だけで持つ。板カテゴリ = kind:
--   keep    続けたい
--   concern 気になる
--   thanks  ありがとう
--   help    たすけて
-- (旧案の 'board' 単一値・board_type/kpt_label 列は廃止。Try / 共有 も持たない。)
--
-- ⚠️ なぜこのファイルを ADD VALUE 単独に切ったか:
--   本番 db-migrator (scripts/db-migrator/handler.ts) は各 migration ファイルを
--   BEGIN…COMMIT で 1 トランザクションに包む。PostgreSQL は「ALTER TYPE ADD VALUE で
--   追加した enum 値を同一トランザクション内で使用する」ことを禁止する
--   ("unsafe use of new value of enum type")。職員室ボードの index は述語に
--   kind IN (...) を含むため、ADD VALUE と同居させると本番適用で落ちる。
--   よって ADD VALUE を 0050 で先にコミットし、本体を 0051 に分離する (0025 と同じ規律)。
--
-- ロールバック: PostgreSQL は enum からの値削除を支持しないため追加値は残置
--   (未使用なら無害)。本体テーブル/列のロールバックは 0051 を参照。
-- ============================================================

ALTER TYPE journal_entry_kind ADD VALUE IF NOT EXISTS 'keep';
ALTER TYPE journal_entry_kind ADD VALUE IF NOT EXISTS 'concern';
ALTER TYPE journal_entry_kind ADD VALUE IF NOT EXISTS 'thanks';
ALTER TYPE journal_entry_kind ADD VALUE IF NOT EXISTS 'help';
