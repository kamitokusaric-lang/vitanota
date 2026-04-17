-- ============================================================
-- Unit-03: 新規システムデフォルトタグを全既存テナントにシード
-- 感情タグ 15個 + コンテキストタグ 8個 = 23個
-- ============================================================

-- 全テナントに新規タグを挿入（ON CONFLICT DO NOTHING で冪等）
INSERT INTO tags (tenant_id, name, type, category, is_system_default, sort_order)
SELECT t.id, v.name, v.type::tag_type, v.category::emotion_category, true, v.sort_order
FROM tenants t
CROSS JOIN (VALUES
  -- 感情タグ: positive
  ('喜び',     'emotion', 'positive', 1),
  ('達成感',   'emotion', 'positive', 2),
  ('充実',     'emotion', 'positive', 3),
  ('安心',     'emotion', 'positive', 4),
  ('感謝',     'emotion', 'positive', 5),
  -- 感情タグ: negative
  ('不安',     'emotion', 'negative', 6),
  ('ストレス', 'emotion', 'negative', 7),
  ('疲労',     'emotion', 'negative', 8),
  ('焦り',     'emotion', 'negative', 9),
  ('不満',     'emotion', 'negative', 10),
  -- 感情タグ: neutral
  ('忙しい',   'emotion', 'neutral',  11),
  ('混乱',     'emotion', 'neutral',  12),
  ('気づき',   'emotion', 'neutral',  13),
  ('無力感',   'emotion', 'neutral',  14),
  ('もやもや', 'emotion', 'neutral',  15),
  -- コンテキストタグ
  ('授業',     'context', NULL, 16),
  ('生徒対応', 'context', NULL, 17),
  ('保護者対応','context', NULL, 18),
  ('校務',     'context', NULL, 19),
  ('会議',     'context', NULL, 20),
  ('部活動',   'context', NULL, 21),
  ('事務作業', 'context', NULL, 22),
  ('その他',   'context', NULL, 23)
) AS v(name, type, category, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 旧システムデフォルトタグの整理
-- journal_entry_tags で使用されていない旧タグのみ削除
-- 「保護者対応」は新タグと重複するため ON CONFLICT DO NOTHING で保持済み
DELETE FROM tags
WHERE is_system_default = true
  AND name IN ('うれしい', 'つかれた', 'やってみた', '行き詰まり', '相談したい', '授業準備', '行事準備')
  AND id NOT IN (SELECT tag_id FROM journal_entry_tags);
