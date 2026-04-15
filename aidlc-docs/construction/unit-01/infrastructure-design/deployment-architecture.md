# Unit-01 デプロイメントアーキテクチャ

## 概要

Unit-01（認証・テナント基盤）の CI/CD パイプラインとデプロイメントフローを定義する。2環境（dev / prod）構成で GitHub Actions を使用する。

---

## 環境構成サマリー

| 項目 | dev | prod |
|---|---|---|
| 目的 | 開発・動作確認 | 本番稼働 |
| App Runner 最小インスタンス | 0（リクエストベース） | 1（常時起動） |
| App Runner 最大インスタンス | 3 | 5 |
| RDS Multi-AZ | なし | あり |
| CloudWatch Logs 保持期間 | 30日 | 90日 |
| 削除保護（RDS） | 無効 | 有効 |
| デプロイトリガー | `main` ブランチへの push | `main` ブランチへの push（手動承認あり） |

---

## CI/CD パイプライン（GitHub Actions）

### ブランチ戦略

```
feature/* ---> main (dev デプロイ) ---> (手動承認) ---> prod デプロイ
```

- `main` ブランチへのマージ → dev 環境に自動デプロイ
- prod デプロイは GitHub Actions の `environment: production` による手動承認が必要

### パイプラインフロー

```
[1] Checkout
    コードを取得

[1.5] Secret Scan (gitleaks) - P2-A-3
    gitleaks detect --source . --verbose --redact
    シークレット（API キー・パスワード・JWT 等）の混入を検知
    検出時は CI 即失敗、main ブランチマージ不可

[2] Setup Node.js + pnpm
    Node.js 20 / pnpm キャッシュ復元

[3] Install Dependencies
    pnpm install --frozen-lockfile

[4] Type Check
    pnpm tsc --noEmit

[5] Lint
    pnpm eslint

[6] Unit Test
    pnpm vitest run --coverage
    カバレッジ閾値: 80%（business logic）

[7] Build Docker Image
    docker build -t vitanota/app:{env}-{sha} .

[8] Push to ECR
    AWS OIDC 認証 → ECR ログイン → docker push

[9] Deploy to App Runner (dev)
    aws apprunner update-service --service-arn {dev-arn}
    最大待機: 10分（デプロイ完了を待機）

[10] Health Check
     /api/health が 200 を返すことを確認

[11] Deploy to App Runner (prod) ← 手動承認後
     aws apprunner update-service --service-arn {prod-arn}

[12] CloudFront Invalidation
     aws cloudfront create-invalidation --distribution-id {dist-id} --paths "/*"
     静的アセット・Next.js ビルド成果物のキャッシュを無効化
```

### GitHub Actions ワークフローファイル構成

```
.github/
  workflows/
    ci.yml         — Secret scan (gitleaks) / Lint / Type Check / Unit Test / Integration Test（PR 時）
    deploy.yml     — Build / Push / Deploy / Migration invoke（main merge 時）
.githooks/
  pre-commit     — gitleaks ローカル実行（開発者環境での早期検知）
```

**プリコミットフック（開発者環境）**:
```bash
#!/bin/sh
# .githooks/pre-commit
if ! command -v gitleaks &> /dev/null; then
  echo "gitleaks not installed, skipping secret scan"
  exit 0
fi
gitleaks protect --staged --verbose --redact
```
- `git config core.hooksPath .githooks` で開発者 PC に適用
- README でセットアップ手順を案内

### 認証方式（OIDC）

GitHub Actions から AWS への認証は OIDC（OpenID Connect）を使用する。長期的な AWS アクセスキーをシークレットに保存しない。

```yaml
# deploy.yml 抜粋
permissions:
  id-token: write
  contents: read

- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::ACCOUNT_ID:role/vitanota-github-actions-role
    aws-region: ap-northeast-1
```

---

## Dockerfile 設計方針

### マルチステージビルド

```
Stage 1: deps       — pnpm install（本番依存のみ）
Stage 2: builder    — next build
Stage 3: runner     — 最小イメージ（node:20-alpine）
```

### ポート設定

- App Runner はコンテナのポート `3000` を使用する（Next.js デフォルト）
- `EXPOSE 3000`・`CMD ["node", "server.js"]` を設定

---

## デプロイ時のゼロダウンタイム設計

App Runner はブルー/グリーン方式でデプロイする：

```
[旧バージョン稼働中]
         |
[新バージョンのコンテナ起動]
         |
[/api/health が 200 → ヘルスチェック通過]
         |
[トラフィックを新バージョンに切り替え]
         |
[旧バージョンを停止]
```

ヘルスチェック通過条件：
- `GET /api/health` → HTTP 200
- タイムアウト: 5秒
- 成功しきい値: 1回
- 間隔: 10秒

---

## ロールバック手順

自動ロールバックは設定しない（App Runner の制限）。障害発生時の手動ロールバック手順：

1. ECR から前のバージョンのイメージ URI を確認
2. App Runner サービスのイメージ URI を前バージョンに更新
3. デプロイ完了を待機（最大 10 分）
4. `/api/health` で復旧確認

```bash
# ロールバックコマンド例
aws apprunner update-service \
  --service-arn arn:aws:apprunner:ap-northeast-1:ACCOUNT:service/vitanota-prod/SERVICE_ID \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "ACCOUNT.dkr.ecr.ap-northeast-1.amazonaws.com/vitanota/app:prod-PREV_SHA",
      "ImageRepositoryType": "ECR"
    }
  }'
```

---

## 環境プロモーション戦略

```
開発作業
    |
    | feature ブランチで開発
    v
PR 作成 → ci.yml 実行（Lint / Type Check / Test）
    |
    | レビュー完了 → main マージ
    v
deploy.yml 実行 → dev デプロイ（自動）
    |
    | dev 動作確認完了 → prod デプロイ承認
    v
deploy.yml prod ジョブ → 手動承認 → prod デプロイ
```

### GitHub Environments 設定

| Environment | 承認者 | デプロイ保護ルール |
|---|---|---|
| `development` | なし（自動） | なし |
| `production` | リポジトリ管理者 | 手動承認必須 |

---

## GitHub Secrets / Variables 設定

| 名前 | 種別 | 用途 |
|---|---|---|
| `AWS_ACCOUNT_ID` | Variable | OIDC ロール ARN 構築 |
| `ECR_REPOSITORY` | Variable | `vitanota/app` |
| `APPRUNNER_SERVICE_ARN_DEV` | Variable | dev サービス ARN |
| `APPRUNNER_SERVICE_ARN_PROD` | Variable | prod サービス ARN |
| `CLOUDFRONT_DISTRIBUTION_ID_DEV` | Variable | dev CloudFront ディストリビューション ID |
| `CLOUDFRONT_DISTRIBUTION_ID_PROD` | Variable | prod CloudFront ディストリビューション ID |

**注記**: AWS 認証は OIDC を使用するため、`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` のシークレット保存は不要。
