# ローカル開発環境セットアップ

**対象**: 開発者（ローカルで vitanota を動かす場合）
**位置づけ**: CDK (Phase 1) デプロイ前の動作確認・日常の機能開発・マイグレーション事前検証

## 前提

- Docker Desktop または OrbStack または Colima（`docker compose` コマンドが動く）
- Node.js 20+
- pnpm 10+

## クイックスタート（3 分）

```bash
# 1. 環境変数ファイル作成（初回のみ）
cp .env.local.example .env.local

# 2. PostgreSQL 起動
pnpm db:local:up

# 3. マイグレーション + シード（初回 or リセット時）
pnpm db:local:seed

# 4. Next.js 起動
pnpm dev
```

http://localhost:3000 でアプリにアクセス。
http://localhost:8080 で Adminer（DB 管理 UI）にアクセス。

## スクリプト一覧

| コマンド | 動作 |
|---|---|
| `pnpm db:local:up` | PostgreSQL + Adminer 起動 |
| `pnpm db:local:down` | コンテナ停止（データは保持） |
| `pnpm db:local:reset` | コンテナ + ボリューム削除（**データ消失**）|
| `pnpm db:local:migrate` | マイグレーション適用（冪等）|
| `pnpm db:local:seed` | マイグレーション + 初期データ投入 |
| `pnpm dev` | Next.js 開発サーバー起動 |
| `pnpm test` | ユニットテスト実行 |
| `pnpm test:integration` | 統合テスト実行（PostgreSQL 必要） |
| `pnpm test:e2e` | E2E テスト実行（PostgreSQL + Next.js 必要） |

## シードデータ

`pnpm db:local:seed` で以下が作成される:

| リソース | 値 |
|---|---|
| テナント | `ローカル学校`（id: `00000000-0000-0000-0000-000000000001`） |
| 教員 | `teacher@local.test`（id: `...100`） |
| 管理者 | `admin@local.test`（id: `...101`） |
| システムタグ | 8 件（うれしい・つかれた・やってみた・...） |

## ログインのテスト方法

`.env.local` で `E2E_TEST_MODE=true` に設定済みなので、`/api/test/_seed` エンドポイントが有効になっています。

### 方法 1: curl でセッション作成 → ブラウザに Cookie 手動設定

```bash
# セッション作成
curl -X POST http://localhost:3000/api/test/_seed \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "createSession",
    "userId": "00000000-0000-0000-0000-000000000100",
    "tenantId": "00000000-0000-0000-0000-000000000001"
  }'

# レスポンス例: {"sessionToken":"abc123...","expires":"2026-04-16T..."}
```

ブラウザの開発者ツールで Cookie を手動設定:
- Name: `next-auth.session-token`
- Value: (取得した sessionToken)
- Domain: `localhost`
- Path: `/`
- HttpOnly: checked

### 方法 2: Playwright で自動ログイン

```bash
pnpm test:e2e:ui
```

Playwright が自動で `/api/test/_seed` を呼んでログイン状態を作成してテストする。

### 方法 3: Google OAuth で実ログイン

ローカルで実 OAuth を試したい場合:

1. [Google Cloud Console](https://console.cloud.google.com/) で OAuth 2.0 クライアント ID 作成
2. 承認済みリダイレクト URI: `http://localhost:3000/api/auth/callback/google`
3. `.env.local` に `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を設定
4. `E2E_TEST_MODE=false` に変更
5. シードで作成済みの `teacher@local.test` のメールアドレスで登録した Google アカウントが必要

通常は方法 1 or 2 で十分です。

## マイグレーション事前検証

本番デプロイ前にマイグレーションをローカルで必ずテスト:

```bash
# 新しいマイグレーションファイルを migrations/ に追加後
pnpm db:local:migrate

# 問題があれば完全リセット
pnpm db:local:reset
pnpm db:local:seed
```

## トラブルシューティング

### ポート 5432 が既に使用されている

ローカルで別の PostgreSQL が稼働中:
```bash
# macOS
brew services stop postgresql
# または docker-compose.yml のポートを 5433:5432 に変更
```

### Next.js が DB に接続できない

`.env.local` の `DATABASE_URL` を確認:
```
DATABASE_URL=postgresql://vitanota:vitanota_local@localhost:5432/vitanota_dev
```

docker-compose が起動しているか:
```bash
docker compose ps
```

### マイグレーション失敗

完全リセット:
```bash
pnpm db:local:reset
pnpm db:local:seed
```

### Adminer で接続できない

Adminer の接続情報:
- System: `PostgreSQL`
- Server: `postgres` (Docker ネットワーク内の名前)
- Username: `vitanota`
- Password: `vitanota_local`
- Database: `vitanota_dev`

## 本番環境との差異

| 項目 | ローカル | Phase 1 (MVP) | Phase 2 (本格稼働) |
|---|---|---|---|
| PostgreSQL | Docker 16-alpine | RDS t4g.micro | RDS Multi-AZ |
| DB 認証 | パスワード（ハードコード）| Secrets Manager | IAM 認証 (RDS Proxy) |
| HTTPS | なし | CloudFront | CloudFront |
| Auth.js | test seed API | Google OAuth | Google OAuth |
| 監視 | 手動確認 | CloudWatch 5 alarms | CloudWatch 12+ alarms |
| ログ | コンソール | CloudWatch Logs + S3 | 同左 + 7 年保持 |

**注意**: ローカルは**認証を test seed でバイパス**しているため、実際の Google OAuth フローは検証されない。OAuth 周りの変更は dev/prod 環境で確認すること。

## 関連ドキュメント

- デプロイメントフェーズ: `aidlc-docs/construction/deployment-phases.md`
- インフラ設計: `aidlc-docs/construction/unit-01/infrastructure-design/infrastructure-design.md`
- ER 図: `aidlc-docs/construction/er-diagram.md`
- シーケンス図: `aidlc-docs/construction/sequence-diagrams.md`
