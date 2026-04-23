-- ============================================================
-- Unit-05: タスク管理機能 (稼働負荷の素材を実体として持つ)
-- task_categories (業務の大分類) + tasks (個別 To-Do)
-- SP-U02-04 Layer 8 準拠: (id, tenant_id) UNIQUE + 複合 FK
-- ============================================================

-- ── task_categories ────────────────────────────────────────
-- 業務分類マスタ。is_system_default で恒常カテゴリを識別、
-- テナントごとの時限カテゴリ (文化祭 2026 等) も追加可能
CREATE TABLE task_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SP-U02-04 Layer 8: 複合 FK の参照先として必要な UNIQUE 制約
  CONSTRAINT task_categories_id_tenant_unique UNIQUE (id, tenant_id),
  -- テナント内で名前は一意
  CONSTRAINT task_categories_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX task_categories_tenant_idx ON task_categories(tenant_id);
-- Case-insensitive な一意性 (tags と同等の扱い)
CREATE UNIQUE INDEX task_categories_tenant_name_lower_idx
  ON task_categories (tenant_id, lower(name));

-- ── task_status enum ───────────────────────────────────────
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done');

-- ── tasks ──────────────────────────────────────────────────
-- owner_user_id: 担当者 (誰のタスクか)
-- created_by: 作成者 (自分で作成 = owner と同じ / アサイン = 別)
-- description: タスク詳細 (tenant 内全員が閲覧可、哲学「構造的に詳細比較不可」はフィールド設計でなく運用で担保)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  due_date DATE,
  status task_status NOT NULL DEFAULT 'todo',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SP-U02-04 Layer 8: (id, tenant_id) UNIQUE
  CONSTRAINT tasks_id_tenant_unique UNIQUE (id, tenant_id),

  -- SP-U02-04 Layer 8: category への複合 FK でクロステナント参照を物理防止
  CONSTRAINT tasks_category_fk
    FOREIGN KEY (category_id, tenant_id)
    REFERENCES task_categories(id, tenant_id)
    ON DELETE RESTRICT,

  -- status=done の場合は completed_at を必須に、それ以外は NULL に
  CONSTRAINT tasks_completed_at_consistency CHECK (
    (status = 'done' AND completed_at IS NOT NULL) OR
    (status <> 'done' AND completed_at IS NULL)
  )
);

CREATE INDEX tasks_tenant_idx ON tasks(tenant_id);
CREATE INDEX tasks_owner_created_idx ON tasks(owner_user_id, created_at DESC);
CREATE INDEX tasks_tenant_status_idx ON tasks(tenant_id, status);
CREATE INDEX tasks_tenant_due_date_idx ON tasks(tenant_id, due_date) WHERE status <> 'done';
CREATE INDEX tasks_category_idx ON tasks(category_id);

-- ── 初期 system_default task_categories を全テナントに投入 ────
-- 冪等: (tenant_id, name) UNIQUE で再実行 safe
INSERT INTO task_categories (tenant_id, name, is_system_default, sort_order)
SELECT t.id, v.name, true, v.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('クラス業務',   1),
  ('教科業務',     2),
  ('イベント業務', 3),
  ('事務業務',     4)
) AS v(name, sort_order)
ON CONFLICT (tenant_id, name) DO NOTHING;
