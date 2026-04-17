# ビルド手順

## 前提条件

- **Node.js**: 20+
- **pnpm**: 10+
- **Docker**: PostgreSQL ローカル環境用

## ビルドステップ

### 1. 依存パッケージインストール

```bash
pnpm install
```

### 2. 環境変数設定

```bash
cp .env.local.example .env.local
# .env.local を編集（DB 接続情報等）
```

### 3. TypeScript 型チェック

```bash
npx tsc --noEmit
```

**期待結果**: エラー 0

### 4. Next.js ビルド

```bash
pnpm build
```

**期待結果**: ビルド成功。`.next/` ディレクトリが生成される。

### 5. DB マイグレーション（ローカル）

```bash
pnpm db:local:up
cat migrations/0001_unit01_initial.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0002_unit02_sessions.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0003_unit02_journal_core.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0004_unit02_journal_rls.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0005_unit02_public_view.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0006_user_lifecycle.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0007_force_rls.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0008_app_role_nosuper.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0009_rls_role_separation.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0010_unit03_tag_type_category.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0011_unit03_default_tags_v2.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
cat migrations/0012_unit04_alerts.sql | docker exec -i vitanota-postgres psql -U vitanota -d vitanota_dev
```

## ビルド成果物

| 成果物 | パス |
|---|---|
| Next.js ビルド | `.next/` |
| 型チェック | `npx tsc --noEmit`（ファイル出力なし） |
