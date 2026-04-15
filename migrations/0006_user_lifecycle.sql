-- 論点 M: ユーザーライフサイクル対応
-- Phase 1: スキーマレベルの是正のみ（API は次 Unit で実装）
-- 参照: aidlc-docs/inception/requirements/security-review.md 論点 M

-- ─────────────────────────────────────────────────────────────
-- 1. FK 制約の修正: 退会・転勤時に既存行を保持できるよう SET NULL に
-- ─────────────────────────────────────────────────────────────

-- tags.created_by: 教員退会時に作成タグは残し、作成者を匿名化
ALTER TABLE tags
  DROP CONSTRAINT IF EXISTS tags_created_by_users_id_fk;
ALTER TABLE tags
  ADD CONSTRAINT tags_created_by_users_id_fk
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- invitation_tokens.invited_by: 招待者退会後も招待履歴を監査証跡として保持
ALTER TABLE invitation_tokens
  DROP CONSTRAINT IF EXISTS invitation_tokens_invited_by_users_id_fk;
ALTER TABLE invitation_tokens
  ADD CONSTRAINT invitation_tokens_invited_by_users_id_fk
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

-- journal_entries.user_id: 退会・転勤時の匿名化（Q1-B / Q2-A 決定）
-- Phase 1 ではカラムを NULLABLE 化し、FK を SET NULL に変更するのみ
-- 実際の匿名化処理（user_id を NULL に更新）は次 Unit の API 実装時
ALTER TABLE journal_entries
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_user_id_users_id_fk;
ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. ユーザーソフトデリート列の追加
-- ─────────────────────────────────────────────────────────────

-- users.deleted_at: 退会済みフラグ（30日 grace period 後にバッチで物理削除）
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- 部分インデックス: deleted_at IS NOT NULL のユーザーのみインデックス対象
-- 物理削除バッチで使用、平常時のクエリには影響なし
CREATE INDEX users_deleted_at_idx ON users(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. RLS への影響に関する注記
-- ─────────────────────────────────────────────────────────────
-- journal_entries.user_id が NULL の行（匿名化済み）は:
-- - public_read ポリシーで is_public=true なら引き続き表示される
-- - owner_all ポリシーは user_id = NULL 比較が偽になり、誰も所有者ではない
--   → 編集・削除は不可（既に元所有者は離脱しているため正しい挙動）
-- - public_journal_entries VIEW は WHERE is_public=true で引き続き機能
-- これらは現在のポリシー定義でそのまま動作するため、追加の RLS 変更は不要
