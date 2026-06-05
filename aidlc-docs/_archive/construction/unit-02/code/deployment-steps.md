# Unit-02 デプロイ手順サマリー

**スコープ**: Unit-02 リリース時の手動・自動の運用手順
**詳細**: `aidlc-docs/construction/unit-02/infrastructure-design/deployment-architecture.md` 参照

## 前提

Unit-01 で以下が稼働済みであること:
- App Runner サービス（dev / prod）
- RDS PostgreSQL 16 + RDS Proxy
- CloudFront + WAF
- `vitanota-db-migrator` Lambda（Phase 1 で初回デプロイ済み）
- ECR リポジトリ `vitanota/app`

Unit-02 で追加されたものは Unit-01 のインフラ基盤に**設定追加**のみ。新しい AWS サービスはゼロ。

## デプロイ順序（Phase 1: 手動運用）

### Step A: dev 環境

```
[1] feature ブランチで Unit-02 実装
     git checkout -b feature/unit-02-journal
     # ... 実装 ...
     git push origin feature/unit-02-journal

[2] PR 作成 → CI (lint/type/test/secret-scan/dep-audit/openapi-check) GREEN
     → main マージ

[3] GitHub Actions deploy.yml が dev に App Runner デプロイ
     ECR push → App Runner update-service → ヘルスチェック

[4] dev DB マイグレーション適用
     aws lambda invoke \
       --function-name vitanota-db-migrator-dev \
       --payload '{"command":"status"}' \
       --cli-binary-format raw-in-base64-out response.json
     cat response.json
     # 未適用マイグレーション (0002〜0006) を確認

     aws lambda invoke \
       --function-name vitanota-db-migrator-dev \
       --payload '{"command":"migrate"}' \
       --cli-binary-format raw-in-base64-out response.json
     cat response.json
     # 0002〜0006 が applied される

[5] dev で動作確認
     curl https://dev.vitanota.example.com/api/health
     # ブラウザで /journal にアクセスして E2E チェックリスト

[6] dev CloudFront キャッシュビヘイビア追加
     - vitanota-timeline-cache カスタムキャッシュポリシーを作成
     - パスパターン: /api/public/journal/entries → vitanota-timeline-cache
     - パスパターン: /api/private/* → CachingDisabled
     - 詳細: infrastructure-design.md「2. CloudFront キャッシュビヘイビア」

[7] dev WAF スコープダウンルール追加
     - journal-entry-post-bodycheck-count-mode を Web ACL に追加
     - Action: Count
     - 詳細: infrastructure-design.md「3. WAF スコープダウンルール」
```

### Step B: prod 環境

```
[8] GitHub Environments の production で手動承認
     → deploy.yml の deploy-prod ジョブが起動
     → ECR push → App Runner update-service (prod)

[9] prod DB マイグレーション適用
     aws lambda invoke \
       --function-name vitanota-db-migrator-prod \
       --payload '{"command":"status"}' \
       --cli-binary-format raw-in-base64-out response.json

     # ⚠️ prod 適用前に必ずレビュー
     aws lambda invoke \
       --function-name vitanota-db-migrator-prod \
       --payload '{"command":"migrate"}' \
       --cli-binary-format raw-in-base64-out response.json

[10] prod CloudFront / WAF 設定を dev と同じ手順で適用

[11] prod 動作確認
     - https://vitanota.example.com/api/health
     - 管理者アカウントで /journal にログインして全機能確認
     - CloudWatch メトリクスで AppErrors / Http5xx を監視

[12] WAF Count モード監視期間開始
     - Day 0 を記録
     - 7 日後にレビュー会で Count → Block 切替を判断
```

## デプロイ順序（Phase 2: CI/CD 自動化後）

`deploy.yml` に以下のステップを追加すれば手動操作が不要になる:

```yaml
- name: Run DB migration (dev)
  run: |
    aws lambda invoke --function-name vitanota-db-migrator-dev \
      --payload '{"command":"migrate"}' \
      --cli-binary-format raw-in-base64-out response.json
    cat response.json
    if grep -q '"errorMessage"' response.json; then exit 1; fi

- name: Deploy to App Runner (dev)
  # 既存処理

- name: CloudFront invalidation
  run: |
    aws cloudfront create-invalidation \
      --distribution-id ${{ vars.CLOUDFRONT_DISTRIBUTION_ID_DEV }} \
      --paths "/*"
```

prod も同様。Phase 1 → Phase 2 への移行コストは workflow 修正のみ。

## ロールバック手順

### App Runner のロールバック

```
1. ECR から前の image tag を取得
   aws ecr describe-images --repository-name vitanota/app --query 'imageDetails[*].[imageTags[0],imagePushedAt]' --output table

2. App Runner サービスを前バージョンに戻す
   aws apprunner update-service \
     --service-arn ${APPRUNNER_PROD_ARN} \
     --source-configuration '{
       "ImageRepository": {
         "ImageIdentifier": "ACCOUNT.dkr.ecr.ap-northeast-1.amazonaws.com/vitanota/app:prod-PREV_SHA",
         "ImageRepositoryType": "ECR",
         "ImageConfiguration": {"Port": "3000"}
       }
     }'

3. ヘルスチェックで復旧確認
```

### マイグレーションのロールバック

Drizzle Kit 標準では down マイグレーションがないため、**手動で逆方向 SQL を作成して適用**:

```sql
-- 例: 0006_user_lifecycle.sql のロールバック
ALTER TABLE journal_entries ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE users DROP COLUMN deleted_at;
DROP INDEX users_deleted_at_idx;
-- ...
```

新しいマイグレーション番号で適用する（例: `0007_rollback_user_lifecycle.sql`）。

## リリースチェックリスト

`infrastructure-design.md` の 16 項目チェックリストを参照。

## 関連ドキュメント

- `aidlc-docs/construction/unit-02/infrastructure-design/infrastructure-design.md`
- `aidlc-docs/construction/unit-02/infrastructure-design/deployment-architecture.md`
- `aidlc-docs/construction/unit-01/infrastructure-design/infrastructure-design.md` （Lambda マイグレーター詳細）
- `scripts/db-migrator/README.md` （Lambda 関数ビルド・運用手順）
