#!/bin/sh
# ローカル Docker Compose の PostgreSQL にマイグレーションを適用する
# 実行: pnpm run db:local:migrate
#
# 前提: docker compose up -d で postgres が起動していること

set -e

DB_URL="${DATABASE_URL:-postgresql://vitanota:vitanota_local@localhost:5432/vitanota_dev}"
MIGRATIONS_DIR="migrations"

# pg_isready で疎通確認
if ! docker exec vitanota-postgres pg_isready -U vitanota -d vitanota_dev >/dev/null 2>&1; then
  echo "❌ PostgreSQL が起動していません"
  echo "   docker compose up -d で起動してください"
  exit 1
fi

echo "🔄 マイグレーション適用中..."

# マイグレーション履歴テーブルを作成（存在しなければ）
docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev <<'SQL'
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
  already=$(docker exec vitanota-postgres psql -U vitanota -d vitanota_dev -tAc \
    "SELECT 1 FROM _migrations WHERE filename = '$filename'")

  if [ "$already" = "1" ]; then
    echo "⏭️  skip:    $filename"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  echo "▶️  apply:   $filename"
  if ! docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev < "$file"; then
    echo "❌ $filename の適用に失敗しました"
    exit 1
  fi

  docker exec vitanota-postgres psql -U vitanota -d vitanota_dev -c \
    "INSERT INTO _migrations (filename) VALUES ('$filename')" > /dev/null

  APPLIED_COUNT=$((APPLIED_COUNT + 1))
done

echo ""
echo "✅ 完了: 新規適用 $APPLIED_COUNT 件 / スキップ $SKIPPED_COUNT 件"
