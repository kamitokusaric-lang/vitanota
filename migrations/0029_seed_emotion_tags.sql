-- ============================================================
-- 全テナントに emotion_tags 15 個 (positive 5 / negative 5 / neutral 5) をシード
-- 0011 は当時 tags テーブル + 既存テナント前提で書かれており、0016 で
-- tags → emotion_tags にリネームされた後の新規テナントにはタグが届かなかった。
-- 本 migration で既存・将来テナント両方に対し idempotent に挿入する。
-- ============================================================

INSERT INTO emotion_tags (tenant_id, name, category, is_system_default, sort_order)
SELECT t.id, v.name, v.category::emotion_category, true, v.sort_order
FROM tenants t
CROSS JOIN (VALUES
  -- positive (UI: ポジティブ)
  ('喜び',     'positive', 1),
  ('達成感',   'positive', 2),
  ('充実',     'positive', 3),
  ('安心',     'positive', 4),
  ('感謝',     'positive', 5),
  -- negative (UI: ちょっと大変)
  ('不安',     'negative', 6),
  ('ストレス', 'negative', 7),
  ('疲労',     'negative', 8),
  ('焦り',     'negative', 9),
  ('不満',     'negative', 10),
  -- neutral (UI: 状態)
  ('忙しい',   'neutral',  11),
  ('混乱',     'neutral',  12),
  ('気づき',   'neutral',  13),
  ('無力感',   'neutral',  14),
  ('もやもや', 'neutral',  15)
) AS v(name, category, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;
