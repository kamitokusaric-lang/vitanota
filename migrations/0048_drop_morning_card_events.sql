-- ============================================================
-- 0048: おはようカード (H3-B 朝カード) の完全撤去
--
-- 背景 (chimo 2026-05-30):
--   calendar MVP (Unit-06) を本番投入 (PR #53)。 calendar が「タスクの
--   見通し」 を月単位でカバーするため、 朝カード (H3-B 来訪価値仮説) の
--   役割を calendar に統合する判断。 calendar 利用指標 (0047 calendar_events)
--   が朝カード指標の席を引き継ぐため、 morning_card_events を撤去する。
--
-- 踏み絵メモ: 「朝カードの来訪価値を calendar が代替できるか」 は未検証の
--   まま消す。 観測期間を置かない判断は chimo が下した。 本番の
--   morning_card_events 観測データはこの migration で破棄される。
--
-- ロールバック (再開時): 0045_morning_card_events.sql を再適用すれば
--   テーブル / 型 / RLS は復元できる (データは復元不可)。
-- ============================================================

DROP TABLE IF EXISTS morning_card_events;
DROP TYPE IF EXISTS morning_card_event_type;

-- 朝カードの dismiss 状態 row を削除 (context は text 型なので ALTER TYPE 不要)
DELETE FROM user_onboarding_states WHERE context = 'morning_card';
