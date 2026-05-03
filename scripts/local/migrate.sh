#!/bin/sh
# ローカル Docker Compose の PostgreSQL にマイグレーションを適用する
# 実行: pnpm run db:local:migrate
#
# 前提: docker compose up -d で postgres が起動していること

set -e

DB_NAME="${DB_NAME:-vitanota_dev}"
DB_URL="${DATABASE_URL:-postgresql://vitanota:vitanota_local@localhost:5432/${DB_NAME}}"
MIGRATIONS_DIR="migrations"

# pg_isready で疎通確認
if ! docker exec vitanota-postgres pg_isready -U vitanota -d ${DB_NAME} >/dev/null 2>&1; then
  echo "❌ PostgreSQL が起動していません"
  echo "   docker compose up -d で起動してください"
  exit 1
fi

echo "🔄 マイグレーション適用中 (DB: ${DB_NAME})..."

# psql は default だと SQL 文の途中で失敗してもベストエフォート実行を続け、
# 最終ステートメントの結果が exit code に反映される。これだと migration 内の
# 任意の文がエラーでも script 上は成功扱いとなり _migrations に false-positive
# レコードを残してしまう (0027 で実際に発生)。-v ON_ERROR_STOP=1 で最初の
# エラーで即停止 + 非ゼロ終了コードを返させる。
PSQL_FLAGS="-v ON_ERROR_STOP=1"

# マイグレーション履歴テーブルを作成（存在しなければ）
docker exec -i vitanota-postgres psql $PSQL_FLAGS -U vitanota -d ${DB_NAME} <<'SQL'
CREATE TABLE IF NOT EXISTS _migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

APPLIED_COUNT=0
SKIPPED_COUNT=0

for file in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  filename=$(basename "$file")

  # 既に適用済みか確認
  already=$(docker exec vitanota-postgres psql $PSQL_FLAGS -U vitanota -d ${DB_NAME} -tAc \
    "SELECT 1 FROM _migrations WHERE filename = '$filename'")

  if [ "$already" = "1" ]; then
    echo "⏭️  skip:    $filename"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  echo "▶️  apply:   $filename"
  if ! docker exec -i vitanota-postgres psql $PSQL_FLAGS -U vitanota -d ${DB_NAME} < "$file"; then
    echo "❌ $filename の適用に失敗しました"
    exit 1
  fi

  docker exec vitanota-postgres psql $PSQL_FLAGS -U vitanota -d ${DB_NAME} -c \
    "INSERT INTO _migrations (filename) VALUES ('$filename')" > /dev/null

  APPLIED_COUNT=$((APPLIED_COUNT + 1))
done

echo ""
echo "✅ 完了: 新規適用 $APPLIED_COUNT 件 / スキップ $SKIPPED_COUNT 件"
