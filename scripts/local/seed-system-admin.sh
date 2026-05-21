#!/bin/sh
# システム管理者 (system_admin) ユーザーをローカル DB に追加
#
# 2026-05-21: 本番 (ニセコ中) で chimo が system_admin 兼 school_admin 運用しているのに
# 合わせて、ローカルでも同 user に school_admin ロール (ローカル中学校) を追加する。
# これにより AI 風投稿表示 (system_admin の投稿を AI 週次日誌として見せる機能) を
# ローカルで再現できる。
#
# 付与ロール:
#   - system_admin (tenant_id = NULL)  : テナント横断機能用
#   - school_admin (tenant_id = ローカル中学校) : 職員室ノート投稿 / AI 風表示テスト用
#
# 安全方針:
#   - DELETE は一切しない (既存データ破壊なし)
#   - 冪等: user / role が既に存在すれば skip (再実行で重複しない)
#
# 実行: pnpm db:local:seed:system-admin
#   または直接: ./scripts/local/seed-system-admin.sh

set -e

EMAIL='sysadmin@local.test'
NAME='ローカル システム管理者'
LOCAL_TENANT_ID='00000000-0000-0000-0000-000000000001'

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

# 2026-05-21: 本番運用 (system_admin 兼 school_admin) に合わせて、
# ローカル中学校に対しても school_admin ロールを冪等付与する。
EXISTING_TENANT=$(psql_q "SELECT COUNT(*) FROM user_tenant_roles WHERE user_id = '${USER_ID}' AND tenant_id = '${LOCAL_TENANT_ID}' AND role = 'school_admin';")
if [ "${EXISTING_TENANT:-0}" = "0" ]; then
  docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev -c \
    "INSERT INTO user_tenant_roles (user_id, tenant_id, role) VALUES ('${USER_ID}', '${LOCAL_TENANT_ID}', 'school_admin');" >/dev/null
  echo "  ロール付与: school_admin (tenant = ローカル中学校)"
else
  echo "  ロール既存: school_admin (tenant = ローカル中学校) — skip"
fi

echo ""
echo "✅ 完了"
echo ""
echo "作成内容:"
echo "  email:   ${EMAIL}"
echo "  user_id: ${USER_ID}"
echo "  roles:"
echo "    - system_admin (tenant_id = NULL)"
echo "    - school_admin (tenant = ${LOCAL_TENANT_ID} = ローカル中学校)"
echo ""
echo "ℹ️  このアカウントの職員室ノート投稿は AI 風表示 (AI 週次日誌 β) に切り替わる。"
echo "    通常の school_admin 投稿として見たい場合は admin@local.test を使用。"
echo ""
echo "ローカルログイン (next dev を E2E_TEST_MODE=true で起動した場合):"
echo "  curl -X POST http://localhost:3000/api/test/_seed \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"action\":\"createSession\",\"userId\":\"${USER_ID}\"}'"
echo "  → 返却された sessionToken を Cookie 'next-auth.session-token' に注入"
