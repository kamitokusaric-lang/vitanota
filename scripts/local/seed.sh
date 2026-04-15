#!/bin/sh
# ローカル開発用シードデータ投入
# テナント 1 件 + 教員 1 名 + school_admin 1 名を作成
#
# 実行: pnpm run db:local:seed
# 事前に: docker compose up -d && ./scripts/local/migrate.sh

set -e

# マイグレーションが未適用なら先に実行
./scripts/local/migrate.sh

echo ""
echo "🌱 シードデータ投入中..."

docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev <<'SQL'
-- 既存のテストデータをクリア（冪等にするため）
TRUNCATE TABLE
  journal_entry_tags,
  journal_entries,
  tags,
  sessions,
  verification_tokens,
  accounts,
  user_tenant_roles,
  invitation_tokens,
  users,
  tenants
RESTART IDENTITY CASCADE;

-- テナント作成
INSERT INTO tenants (id, name, slug, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ローカル学校',
  'local-school',
  'active'
);

-- 教員ユーザー
INSERT INTO users (id, email, name, email_verified)
VALUES
  ('00000000-0000-0000-0000-000000000100', 'teacher@local.test', 'ローカル教員', NOW()),
  ('00000000-0000-0000-0000-000000000101', 'admin@local.test', 'ローカル管理者', NOW());

-- user_tenant_roles
INSERT INTO user_tenant_roles (user_id, tenant_id, role)
VALUES
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'school_admin');

-- RLS セッション変数を設定して tags INSERT (NFR-U02-03 シード相当)
BEGIN;
SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000001', true);
SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000101', true);

INSERT INTO tags (tenant_id, name, is_emotion, is_system_default, sort_order, created_by) VALUES
  ('00000000-0000-0000-0000-000000000001', 'うれしい',  true,  true, 1, NULL),
  ('00000000-0000-0000-0000-000000000001', 'つかれた',  true,  true, 2, NULL),
  ('00000000-0000-0000-0000-000000000001', 'やってみた', true,  true, 3, NULL),
  ('00000000-0000-0000-0000-000000000001', '行き詰まり', true,  true, 4, NULL),
  ('00000000-0000-0000-0000-000000000001', '相談したい', true,  true, 5, NULL),
  ('00000000-0000-0000-0000-000000000001', '授業準備',  false, true, 6, NULL),
  ('00000000-0000-0000-0000-000000000001', '保護者対応', false, true, 7, NULL),
  ('00000000-0000-0000-0000-000000000001', '行事準備',  false, true, 8, NULL);
COMMIT;
SQL

echo ""
echo "✅ シード完了"
echo ""
echo "作成されたデータ:"
echo "  テナント: ローカル学校 (id: 00000000-0000-0000-0000-000000000001)"
echo "  教員:     teacher@local.test (id: 00000000-0000-0000-0000-000000000100)"
echo "  管理者:   admin@local.test   (id: 00000000-0000-0000-0000-000000000101)"
echo "  タグ:     8 件 (システムデフォルト)"
echo ""
echo "次のステップ:"
echo "  1. pnpm dev で Next.js 起動"
echo "  2. E2E_TEST_MODE=true なので /api/test/_seed でセッション作成可能"
echo "  3. ブラウザの開発者ツールで Cookie 注入 or Playwright で自動ログイン"
