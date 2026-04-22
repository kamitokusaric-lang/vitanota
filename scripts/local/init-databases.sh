#!/bin/bash
# Docker の postgres 初回起動時 (volume 未初期化時) にのみ実行される
# 複数 DB (vitanota_dev + vitanota_test) を作成する
#
# 既に volume が存在する場合は実行されないので、既存環境では
# 別途 `docker exec` で手動作成する必要がある

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE vitanota_test;
    GRANT ALL PRIVILEGES ON DATABASE vitanota_test TO $POSTGRES_USER;
EOSQL

echo "✅ vitanota_test DB を initdb で作成"
