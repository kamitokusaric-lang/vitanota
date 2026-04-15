# vitanota-db-migrator Lambda

DB マイグレーション専用 Lambda 関数の参考実装。
詳細仕様は `aidlc-docs/construction/unit-01/infrastructure-design/infrastructure-design.md` の「DB マイグレーション: AWS Lambda」セクションを参照。

## 役割

- VPC プライベートサブネット内から RDS Proxy 経由で PostgreSQL に接続
- IAM 認証トークンを動的生成（`@aws-sdk/rds-signer`）
- `migrations/` ディレクトリの SQL ファイルを順次適用
- 適用済み履歴を `_migrations` テーブルで管理

## サポートコマンド

| command | 動作 | 環境制限 |
|---|---|---|
| `migrate` | 未適用マイグレーションを順次実行 | 全環境 |
| `status` | 適用済み・未適用一覧を返却 | 全環境 |
| `drop` | `DROP SCHEMA public CASCADE`（全テーブル削除） | dev のみ（prod ではエラー） |

## 環境変数

| 変数 | 用途 |
|---|---|
| `RDS_PROXY_ENDPOINT` | RDS Proxy ホスト名 |
| `RDS_PROXY_PORT` | デフォルト 5432 |
| `DB_USER` | DB ユーザー名（dev: vitanota_dev・prod: vitanota_app） |
| `DB_NAME` | DB 名 |
| `AWS_REGION` | デフォルト ap-northeast-1 |
| `ENV` | `dev` or `prod`（drop コマンドの保護判定） |

## ビルドとデプロイ

```bash
cd scripts/db-migrator
pnpm install
pnpm build
pnpm package  # function.zip を生成

aws lambda update-function-code \
  --function-name vitanota-db-migrator-dev \
  --zip-file fileb://function.zip
```

## 呼び出し例

```bash
# 状態確認
aws lambda invoke \
  --function-name vitanota-db-migrator-dev \
  --payload '{"command":"status"}' \
  --cli-binary-format raw-in-base64-out \
  response.json
cat response.json

# マイグレーション実行
aws lambda invoke \
  --function-name vitanota-db-migrator-dev \
  --payload '{"command":"migrate"}' \
  --cli-binary-format raw-in-base64-out \
  response.json

# dev のみ: 全テーブル削除（再構築時）
aws lambda invoke \
  --function-name vitanota-db-migrator-dev \
  --payload '{"command":"drop"}' \
  --cli-binary-format raw-in-base64-out \
  response.json
```

## IAM 設定

3 つのロールに権限分離（論点 G・P1-G）:

| ロール | 用途 | 権限 |
|---|---|---|
| `vitanota-db-migrator-execute-role` | Lambda 実行 | `rds-db:connect` / `secretsmanager:GetSecretValue` / VPC ENI / Logs |
| `vitanota-db-migrator-deploy-role` | コードデプロイ | `lambda:UpdateFunctionCode` / GitHub Actions OIDC（main ブランチのみ） |
| `vitanota-db-migrator-invoke-role` | 実行呼び出し | `lambda:InvokeFunction` / 特定 IAM ユーザー |

## prod での保護

- `ENV=prod` で `drop` コマンドはハードコードで拒否
- `lambda:Invoke` 権限は特定 IAM ユーザーのホワイトリスト方式
- CloudTrail で全 invoke を記録
- `ProdMigratorInvoked` CloudWatch アラームで管理者通知

## デプロイ後の運用

### Phase 1（手動運用）

開発者が手動で `aws lambda invoke` を実行。手順は本 README の「呼び出し例」参照。

### Phase 2（CI/CD 自動化）

GitHub Actions の `deploy.yml` に invoke ステップを追加:

```yaml
- name: Run DB migration (dev)
  run: |
    aws lambda invoke --function-name vitanota-db-migrator-dev \
      --payload '{"command":"migrate"}' \
      --cli-binary-format raw-in-base64-out response.json
    cat response.json
    if grep -q '"errorMessage"' response.json; then exit 1; fi
```

詳細は `aidlc-docs/construction/unit-02/infrastructure-design/deployment-architecture.md` 参照。

## トラブルシューティング

| エラー | 原因 | 対処 |
|---|---|---|
| `DatabaseConnectionsCurrentlySessionPinned` 上昇 | RDS Proxy ピンニング（R1） | マイグレーションのトランザクション境界を見直す |
| Lambda タイムアウト | 大規模マイグレーション | Lambda タイムアウトを 15 分まで延長 |
| `permission denied for table` | RLS 適用済みテーブル | マイグレーションは superuser 権限で実行する想定 |
| FK violation | 後方互換性のない変更 | マイグレーションを段階分割（NOT NULL 追加は CHECK + COPY 方式） |

## 注意事項

- このディレクトリは Next.js アプリと**独立した依存関係**を持つ（`pg` と `@aws-sdk/rds-signer` のみ）
- ビルド成果物 `dist/`・`function.zip` は git 管理外（.gitignore で除外）
- `migrations/` シンボリックリンクまたはビルド時にコピーする運用
