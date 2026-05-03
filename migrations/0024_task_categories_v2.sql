-- ============================================================
-- 0024: task_categories のシステムデフォルトを新 9 体系に置き換え
--
-- 旧 4 カテゴリ (クラス業務 / 教科業務 / イベント業務 / 事務業務) は
-- migration 0014 で全テナントに投入していたが、現場校長との対話を経て
-- より教育現場の業務分類に近い 9 カテゴリ体系へ刷新する:
--   教務 / 生徒指導 / 進路指導 / 学級運営 / 特別活動 /
--   保健安全指導 / 学校運営 / 渉外 / 雑務
--
-- 移行方針 (FK 違反回避):
--   1. 旧 4 カテゴリのうち「タスクで参照されていない」 system_default 行を DELETE
--   2. 全 既存テナントに新 9 カテゴリを INSERT (冪等)
-- タスクが残っている旧カテゴリは安全のため残置、運用で chimo が個別対応。
-- ============================================================

DELETE FROM task_categories
WHERE name IN ('クラス業務', '教科業務', 'イベント業務', '事務業務')
  AND is_system_default = true
  AND NOT EXISTS (
    SELECT 1 FROM tasks WHERE tasks.category_id = task_categories.id
  );

INSERT INTO task_categories (tenant_id, name, is_system_default, sort_order)
SELECT t.id, v.name, true, v.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('教務',         1),
  ('生徒指導',     2),
  ('進路指導',     3),
  ('学級運営',     4),
  ('特別活動',     5),
  ('保健安全指導', 6),
  ('学校運営',     7),
  ('渉外',         8),
  ('雑務',         9)
) AS v(name, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;
