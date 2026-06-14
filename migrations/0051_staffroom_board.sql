-- ============================================================
-- 0051: staffroom (職員室ボード / H7-B) データ基盤 — S3「出口データ基盤」スライス
--
-- 循環の正本: docs/proposal/h7-circulation.md / build spec: docs/staffroom/design.md
-- 前段: 0050 で journal_entry_kind に keep/concern/thanks/help を追加済み (別 tx)。
--
-- chimo 2026-06-10 確定モデル:
--   - 板の投稿は journal_entries(kind IN ('keep','concern','thanks','help')) として持つ。
--     補助 enum 列 (board_type / kpt_label) は持たない。kind 直値だけで分類する。
--   - is_public は全 kind 共通の「公開/非公開を本人選択」(default true)。
--     board も例外にしない (旧案の is_public=false 固定・CHECK・専用 RLS は廃止)。
--   - 可視性は既存 journal RLS で回す:
--       journal_entry_public_read : is_public=true をテナント内全教員に見せる (公開 board = 同僚可視)
--       journal_entry_owner_all   : 本人は自分の board を読み書き (非公開 board = 本人のみ)
--     → board 専用ポリシーは作らない。フィードは app 層で「公開 OR 自分」に絞る。
--   - 日々ノートのタイムラインとの分離 (kind 絞り込み) は後続スライスで行う (chimo: 今はやらない)。
--
-- このスライスがやること:
--   1. journal_entries に board 投稿用の軸を追加 (student_id / class_id) — A→B seam の受け口
--   2. board 投稿の一覧取得用 index
--
-- (コメント返信機構 staffroom_board_comments は chimo 2026-06-12 の入力一本化方針で不採用。
--  起票は右サイド入口に統一し、職員室ボードは読む・反応する出口に徹する。)
--
-- UI 画面・A→B/B→A seam の動線・ふりかえり画面は後続スライス。
-- 数値化・スコア化・ランキングはしない (踏み絵ガード 2/3/7)。
--
-- ロールバック:
--   DROP INDEX journal_entries_board_idx;
--   ALTER TABLE journal_entries
--     DROP CONSTRAINT journal_entries_class_fk,
--     DROP CONSTRAINT journal_entries_student_fk,
--     DROP COLUMN class_id, DROP COLUMN student_id;
--   (journal_entry_kind の追加値は 0050 のとおり残置)
-- ============================================================

-- ── journal_entries: board 投稿用の軸を追加 (A→B seam の受け口) ──
-- 既存 diary/knowledge/tweet 行は NULL のまま無破壊。
ALTER TABLE journal_entries
  ADD COLUMN student_id UUID,
  ADD COLUMN class_id   UUID;

-- 複合 FK: クロステナント参照の物理防止 (students/classes の (id,tenant_id) UNIQUE 参照)。
-- 生徒/クラスが消えても board 投稿 (教員の知) は残す → 列指定 SET NULL。
-- ⚠️ 複合 FK の素の SET NULL は FK 全列 (tenant_id 含む) を NULL にし NOT NULL 違反になる。
--    PG15+ の列指定 SET NULL (student_id) で「紐付け列だけ」を NULL にする (本番/ローカルとも PG16)。
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_student_fk
    FOREIGN KEY (student_id, tenant_id)
    REFERENCES students(id, tenant_id) ON DELETE SET NULL (student_id),
  ADD CONSTRAINT journal_entries_class_fk
    FOREIGN KEY (class_id, tenant_id)
    REFERENCES classes(id, tenant_id) ON DELETE SET NULL (class_id);

-- board 投稿の一覧取得用 (集計ではなく list 用途)。
CREATE INDEX journal_entries_board_idx
  ON journal_entries(tenant_id, created_at DESC)
  WHERE kind IN ('keep', 'concern', 'thanks', 'help');
