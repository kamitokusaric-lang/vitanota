-- Unit-02 マイグレーション 0003: 日誌コアテーブル
-- US-T-010〜014・020〜022 対応
-- SP-U02-04 Layer 8 のための (id, tenant_id) UNIQUE 制約を含む

-- ── journal_entries ────────────────────────────────────────
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SP-U02-04 Layer 8: 複合 FK の参照先として必要な UNIQUE 制約
  CONSTRAINT journal_entries_id_tenant_unique UNIQUE (id, tenant_id)
);

CREATE INDEX journal_entries_tenant_created_idx
  ON journal_entries(tenant_id, created_at DESC);
CREATE INDEX journal_entries_user_created_idx
  ON journal_entries(user_id, created_at DESC);

-- ── tags ───────────────────────────────────────────────────
-- 感情タグ・業務タグを is_emotion フラグで統合
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  is_emotion BOOLEAN NOT NULL DEFAULT FALSE,
  is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- SP-U02-04 Layer 8: 複合 FK の参照先として必要な UNIQUE 制約
  CONSTRAINT tags_id_tenant_unique UNIQUE (id, tenant_id),
  -- テナント内でタグ名は一意（case-insensitive）
  CONSTRAINT tags_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE INDEX tags_tenant_emotion_idx ON tags(tenant_id, is_emotion);

-- Case-insensitive な一意性（case-insensitive な重複を防ぐ）
CREATE UNIQUE INDEX tags_tenant_name_lower_idx
  ON tags (tenant_id, lower(name));

-- ── journal_entry_tags（中間テーブル） ─────────────────────
-- SP-U02-04 Layer 8: 複合 FK でクロステナント参照を物理防止
-- tenant_id を冗長に持ち、entry_id と tag_id が同じテナントに属することを DB レベルで強制
CREATE TABLE journal_entry_tags (
  tenant_id UUID NOT NULL,
  entry_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  PRIMARY KEY (entry_id, tag_id),

  CONSTRAINT journal_entry_tags_entry_fk
    FOREIGN KEY (entry_id, tenant_id)
    REFERENCES journal_entries(id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT journal_entry_tags_tag_fk
    FOREIGN KEY (tag_id, tenant_id)
    REFERENCES tags(id, tenant_id)
    ON DELETE CASCADE
);

CREATE INDEX journal_entry_tags_tenant_idx ON journal_entry_tags(tenant_id);
CREATE INDEX journal_entry_tags_tag_idx ON journal_entry_tags(tag_id);
