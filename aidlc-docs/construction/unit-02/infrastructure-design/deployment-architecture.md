# Unit-02 デプロイメントアーキテクチャ

## 概要

Unit-02（日誌・感情記録コア）のデプロイ手順。Unit-01 で確立した CI/CD パイプライン（GitHub Actions + OIDC + App Runner）をベースに、Unit-02 固有の手順（DB マイグレーション・CloudFront/WAF 設定変更・WAF ルール段階切替）を追加する。

---

## Unit-01 からの継承事項

- GitHub Actions による main ブランチ自動デプロイ（dev）+ 手動承認 prod
- OIDC 認証によるシークレットレス AWS アクセス
- ECR → App Runner ブルー/グリーンデプロイ
- CloudFront `/*` invalidation（デプロイパイプライン末尾）
- App Runner ヘルスチェック（`/api/health`）
- ロールバック手順（前バージョンの ECR イメージに切り戻し）

---

## Unit-02 追加：デプロイシーケンス

### Phase 1（Unit-02 初期リリース、手動マイグレーション期）

**開発者の操作手順**:

```bash
# [1] feature ブランチで Unit-02 実装
git checkout -b feature/unit-02-journal
# ... 実装 ...
git push origin feature/unit-02-journal

# [2] PR 作成・レビュー・main マージ
# → GitHub Actions が dev 環境にコンテナデプロイ（まだマイグレーションは走らない）

# [3] dev へマイグレーション手動適用
aws lambda invoke \
  --function-name vitanota-db-migrator-dev \
  --payload '{"command":"status"}' \
  --cli-binary-format raw-in-base64-out response.json
cat response.json  # 未適用マイグレーションを確認

aws lambda invoke \
  --function-name vitanota-db-migrator-dev \
  --payload '{"command":"migrate"}' \
  --cli-binary-format raw-in-base64-out response.json
cat response.json  # 0002_journal_core + 0003_journal_rls が適用されることを確認

# [4] dev 環境で動作確認
curl https://dev.vitanota.example.com/api/public/journal/entries

# [5] CloudFront キャッシュビヘイビア追加（dev）
# AWS Console または CLI で vitanota-timeline-cache ポリシー作成
# ディストリビューションにパスパターン追加

# [6] WAF スコープダウンルール追加（dev + prod 両方）
aws wafv2 update-web-acl --name vitanota-waf-prod ... (see runbook)

# [7] prod 承認 → GitHub Actions が prod コンテナデプロイ

# [8] prod へマイグレーション手動適用
aws lambda invoke \
  --function-name vitanota-db-migrator-prod \
  --payload '{"command":"migrate"}' \
  --cli-binary-format raw-in-base64-out response.json

# [9] prod CloudFront キャッシュビヘイビア追加
# [10] prod 動作確認
# [11] WAF Count モード監視期間開始（Day 0）
```

### Phase 2（自動化後）

GitHub Actions deploy.yml に以下のステップを追加：

```yaml
jobs:
  deploy-dev:
    steps:
      # ... 既存の Build / Push / Deploy ステップ ...

      - name: Run DB migration (dev)
        run: |
          aws lambda invoke --function-name vitanota-db-migrator-dev \
            --payload '{"command":"migrate"}' \
            --cli-binary-format raw-in-base64-out response.json
          cat response.json
          # 失敗時は exit 1 で後続ジョブを止める
          if grep -q '"errorMessage"' response.json; then exit 1; fi

      - name: Deploy to App Runner (dev)
        # 既存の処理

      - name: CloudFront Invalidation
        # 既存の処理

  deploy-prod:
    needs: deploy-dev
    environment: production  # 手動承認
    steps:
      - name: Run DB migration (prod)
        # 同じ invoke を prod 対象で
      - name: Deploy to App Runner (prod)
      - name: CloudFront Invalidation
```

**Phase 1 → Phase 2 への移行作業**: `aws lambda invoke` コマンドを workflow ファイルに追加するだけ。踏み台 EC2 切替などの複雑な作業は不要。

---

## マイグレーション失敗時の対応

1. **Lambda 実行ログを確認**
   ```bash
   aws logs tail /aws/lambda/vitanota-db-migrator-prod --follow
   ```
2. **原因特定**（構文エラー・制約違反・RLS 設定不足等）
3. **対応方針**:
   - a. 逆方向マイグレーション SQL を新規作成し、Lambda 経由で適用して手前の状態に戻す
   - b. 原因となったマイグレーション SQL を修正し、新しいマイグレーション番号で再適用
4. **App Runner の状態**: マイグレーション失敗時、App Runner はまだ旧バージョンのままなので**サービス停止には至らない**（Phase 2 CI/CD でも同様、マイグレーション失敗 → App Runner 更新スキップ）

---

## WAF ルール切替の運用（Day 7 タスク）

Unit-02 リリースから7日後、以下の作業を実施：

1. **CloudWatch Logs Insights で誤検知レビュー**
   ```
   fields @timestamp, action, terminatingRuleId, httpRequest.uri
   | filter httpRequest.uri = "/api/private/journal/entries" and httpRequest.method = "POST"
   | filter action = "COUNT"
   | stats count() by terminatingRuleId
   ```

2. **誤検知の判定**:
   - **誤検知ゼロの場合**: スコープダウンルール `journal-entry-post-bodycheck-count-mode` を削除 → 既存 CommonRuleSet の Block が有効化される
   - **誤検知ありの場合**: 該当ルールに除外条件を追加、または WAF ルールのラベル/スコープを調整

3. **切替コマンド**:
   ```bash
   aws wafv2 update-web-acl \
     --name vitanota-waf-prod \
     --scope CLOUDFRONT \
     --id <web-acl-id> \
     --lock-token <token> \
     --default-action '{"Block":{}}' \
     --rules file://updated-rules.json
   ```

4. **切替後の監視**:
   - 最初の24時間は `BlockedRequests` メトリクスを注視
   - アラーム `WafBlockedRequestsHigh` が発報した場合、誤検知の可能性を再調査

---

## Unit-01 遡及：Lambda マイグレーター初回デプロイ

Unit-02 リリースに先立ち、Unit-01 に対して Lambda マイグレーターをデプロイする必要がある。

### 初回デプロイ手順（一度限り）

1. **Lambda 関数パッケージの作成**
   ```bash
   cd lambda/db-migrator
   pnpm install --prod
   zip -r function.zip node_modules drizzle handler.js
   ```

2. **IAM ロール作成** `vitanota-db-migrator-role`
   - `rds-db:connect`
   - `secretsmanager:GetSecretValue`
   - CloudWatch Logs 書き込み
   - VPC Lambda 用の `ec2:*NetworkInterface*`

3. **Lambda 関数作成（dev / prod それぞれ）**
   ```bash
   aws lambda create-function \
     --function-name vitanota-db-migrator-dev \
     --runtime nodejs20.x \
     --architectures arm64 \
     --role arn:aws:iam::ACCOUNT:role/vitanota-db-migrator-role \
     --handler handler.handler \
     --vpc-config SubnetIds=subnet-xxx,subnet-yyy,SecurityGroupIds=sg-db-migrator \
     --zip-file fileb://function.zip \
     --memory-size 512 \
     --timeout 300
   ```

4. **RDS Proxy セキュリティグループ更新**
   `sg-rds-proxy` の Inbound に `sg-db-migrator` を追加

5. **Unit-01 の既存マイグレーション（0000_initial.sql・0001_auth.sql 等）を dev に適用**
   ```bash
   aws lambda invoke --function-name vitanota-db-migrator-dev \
     --payload '{"command":"migrate"}' \
     --cli-binary-format raw-in-base64-out response.json
   ```
   - **注**: Unit-01 のコード生成時点で既に何らかの手段でマイグレーション済みの場合、`drizzle-kit status` で状態確認後に差分のみ適用

---

## Unit-02 リリースチェックリスト

| # | 項目 | 担当 | 確認 |
|---|---|---|---|
| 1 | Unit-01 Lambda マイグレーター初回デプロイ完了 | 開発者 | [ ] |
| 2 | Unit-02 機能設計と NFR設計のレビュー完了 | アーキテクト | [ ] |
| 3 | feature ブランチ実装・PR レビュー | 開発者 | [ ] |
| 4 | dev へ App Runner コンテナデプロイ成功 | CI/CD | [ ] |
| 5 | dev へ DB マイグレーション適用成功（0002・0003） | 開発者 | [ ] |
| 6 | dev で `GET /api/public/journal/entries` 動作確認 | QA | [ ] |
| 7 | dev で `POST /api/private/journal/entries` 動作確認 | QA | [ ] |
| 8 | dev で RLS テナント隔離テスト（NFR-U02-07 の4パターン） | QA | [ ] |
| 9 | dev CloudFront キャッシュビヘイビア追加 | インフラ | [ ] |
| 10 | dev WAF スコープダウンルール追加（Count モード） | インフラ | [ ] |
| 11 | prod へ手動承認デプロイ | 管理者 | [ ] |
| 12 | prod DB マイグレーション適用 | 開発者 | [ ] |
| 13 | prod CloudFront / WAF 設定適用 | インフラ | [ ] |
| 14 | prod 動作確認 | 管理者 | [ ] |
| 15 | WAF Count モード監視開始（Day 0 記録） | インフラ | [ ] |
| 16 | Day 7: WAF 誤検知レビュー・Block 切替判断 | インフラ | [ ] |

---

## 関連ドキュメント

- `./infrastructure-design.md` - Unit-02 インフラ詳細
- `../nfr-design/nfr-design-patterns.md` - NFR 設計パターン
- `../nfr-design/operational-risks.md` - 運用リスクレジスタ
- `../../unit-01/infrastructure-design/infrastructure-design.md` - 継承元インフラ（Lambda マイグレーター含む）
- `../../unit-01/infrastructure-design/deployment-architecture.md` - 継承元デプロイメント
