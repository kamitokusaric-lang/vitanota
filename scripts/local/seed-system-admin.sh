#!/bin/sh
# システム管理者 (system_admin) ユーザーをローカル DB に追加
#
# system_admin は tenant 横断ロール (tenant_id = NULL)。
# テナント管理画面など system_admin 専用機能のローカル確認用。
#
# ⚠️ 機能C (タスク複製) など tenant 内 RLS で動く機能は system_admin だと
#    requireAuth で tenantId 不在 → 403 になる。タスク系の確認は
#    admin@local.test (school_admin) を使うこと。
#
# 安全方針:
#   - DELETE は一切しない (既存データ破壊なし)
#   - 冪等: user / role が既に存在すれば skip (再実行で重複しない)
#   - tenant に紐付けない (system_admin はテナント非所属)
#
# 実行: pnpm db:local:seed:system-admin
#   または直接: ./scripts/local/seed-system-admin.sh

set -e

EMAIL='sysadmin@local.test'
NAME='ローカル システム管理者'

psql_q() {
  docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev -tA -c "$1" 2>/dev/null | head -1
}

echo "🛠  system_admin ユーザーをローカル DB に追加中..."

# user の get_or_create (既存があれば既存 id を尊重)
USER_ID=$(psql_q "SELECT id FROM users WHERE email = '${EMAIL}';")
if [ -z "$USER_ID" ]; then
  USER_ID=$(psql_q "INSERT INTO users (email, name, email_verified) VALUES ('${EMAIL}', '${NAME}', NOW()) RETURNING id;")
  echo "  user 新規作成: ${USER_ID}"
else
  echo "  user 既存利用: ${USER_ID}"
fi

# user_tenant_roles に system_admin を冪等 INSERT
# UNIQUE(user_id, tenant_id, role) は tenant_id=NULL 同士で衝突しない (PostgreSQL NULL 仕様) ため
# ON CONFLICT が効かない → COUNT で存在確認してから INSERT
EXISTING=$(psql_q "SELECT COUNT(*) FROM user_tenant_roles WHERE user_id = '${USER_ID}' AND tenant_id IS NULL AND role = 'system_admin';")
if [ "${EXISTING:-0}" = "0" ]; then
  docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev -c \
    "INSERT INTO user_tenant_roles (user_id, tenant_id, role) VALUES ('${USER_ID}', NULL, 'system_admin');" >/dev/null
  echo "  ロール付与: system_admin (tenant_id = NULL)"
else
  echo "  ロール既存: system_admin (tenant_id = NULL) — skip"
fi

echo ""
echo "✅ 完了"
echo ""
echo "作成内容:"
echo "  email:   ${EMAIL}"
echo "  user_id: ${USER_ID}"
echo "  role:    system_admin (tenant_id = NULL)"
echo ""
echo "⚠️  機能C (タスク複製) を確認したい場合は admin@local.test (school_admin) を使用"
echo "    system_admin は tenant 横断ロールのため tenant 内 RLS の機能では 403"
echo ""
echo "ローカルログイン (next dev を E2E_TEST_MODE=true で起動した場合):"
echo "  curl -X POST http://localhost:3000/api/test/_seed \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"action\":\"createSession\",\"userId\":\"${USER_ID}\"}'"
echo "  → 返却された sessionToken を Cookie 'next-auth.session-token' に注入"
