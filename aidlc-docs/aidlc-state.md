# AI-DLC State Tracking

## Project Information
- **Project Type**: Greenfield
- **Start Date**: 2026-04-12T00:00:00Z
- **Current Stage**: INCEPTION - Workspace Detection

## Workspace State
- **Existing Code**: No
- **Reverse Engineering Needed**: No
- **Workspace Root**: /Users/chimo/vitanota

## Code Location Rules
- **Application Code**: Workspace root (NEVER in aidlc-docs/)
- **Documentation**: aidlc-docs/ only
- **Structure patterns**: See code-generation.md Critical Rules

## Extension Configuration
| Extension | Enabled | Decided At |
|---|---|---|
| Security Baseline | Yes | Requirements Analysis |
| Property-Based Testing | No | Requirements Analysis |

## 実行プランサマリー
- **実行ステージ数**: 9（ワークフロープランニング含む）
- **スキップステージ**: リバースエンジニアリング（グリーンフィールド）・オペレーションズ（プレースホルダー）
- **想定ユニット数**: 4（Unit-01〜04、ユニット生成ステージで確定）

## ステージ進捗

### 🔵 インセプションフェーズ
- [x] ワークスペース検出 — 完了（2026-04-12T00:00:00Z）
- [x] リバースエンジニアリング — スキップ（グリーンフィールド）
- [x] 要件分析 — 完了（2026-04-12T00:02:00Z）
- [x] ユーザーストーリー — 完了（2026-04-12T00:16:00Z）
- [x] ワークフロープランニング — 完了（2026-04-12T00:18:00Z）
- [x] アプリケーション設計 — 完了（2026-04-12T00:21:00Z）
- [x] ユニット生成 — 完了（2026-04-12T00:23:00Z）

### 🟢 コンストラクションフェーズ（ユニットごと）

#### Unit-01：認証・テナント基盤
- [x] 機能設計 — 完了（2026-04-14T00:00:00Z）
- [x] NFR要件 — 完了（2026-04-14T00:30:00Z）
- [x] NFR設計 — 完了（2026-04-14T01:30:00Z）
- [x] インフラ設計 — 完了（2026-04-14T02:30:00Z）
- [x] コード生成 — 完了（2026-04-14T03:30:00Z）

#### Unit-02：日誌・感情記録コア
- [x] 機能設計 — 完了（2026-04-15T00:00:00Z）
- [x] NFR要件 — 完了（2026-04-15T00:40:00Z）
- [x] NFR設計 — 完了（2026-04-15T01:30:00Z）
- [x] インフラ設計 — 完了（2026-04-15T03:50:00Z）
- [x] コード生成 — 全 Step 完了（Step 1-20 + RLS セキュリティ修正）

**完了済み Step (Unit-02 コード生成)**:
- [x] Step 1-7: Backend 基盤・API 実装
- [x] Step 8: Auth.js database セッション戦略 (SP-07・論点 C 対応)
- [x] Step 9: Tenant 作成時デフォルトタグシード (NFR-U02-03)
- [x] Step 10: Frontend Components + ページ + ユニットテスト 32 件
- [x] Step 11: ログイベント型定義 (log-events.ts)
- [x] Step 16a: 統合テスト 44 件 (8 Suite・CI 初実行待ち)
- [x] Step 16b: Playwright E2E 26 件 (CI 初実行待ち)
- [x] Step 17: サプライチェーン対策 CI (OSV-Scanner・gitleaks・SHA 固定)
- [x] Step 17.5: Claude Code Review CI (Phase 1 最小構成)
- [x] Step 18: OpenAPI 自動生成 + ドキュメント整備
- [x] Step 19: Lambda db-migrator 参考実装 + デプロイ手順書
- [x] 論点 M Phase 1: ユーザーライフサイクル設計 + スキーマ修正 + 横断仕様書
- [x] Phase 1/2 デプロイメントフェーズ設計 (MVP / 本格稼働の 2 段階)
- [x] ローカル開発環境 (Docker Compose + PostgreSQL + Adminer + seed スクリプト)

**追加完了 Step (Unit-02 コード生成 — セキュリティ修正)**:
- [x] RLS 4ロール体制 + 非特権DBロール + middleware (クロステナント漏洩修正)

**完了 Step (Unit-02 コード生成 — CDK)**:
- [x] Step 20: AWS CDK Phase 1 実装 (5 スタック・903 LOC)

#### Unit-03：教員ダッシュボード
- [x] 機能設計 — 完了（2026-04-16T10:30:00Z）
- [x] NFR要件 — 完了（2026-04-16T11:15:00Z）
- [x] NFR設計 — 完了（2026-04-17T00:00:00Z）
- [x] インフラ設計 — 完了（2026-04-17T00:10:00Z）
- [x] コード生成 — 全 Step 完了（Step 1-18）

#### Unit-04：管理者ダッシュボード・アラート
- [x] 機能設計 — 完了（2026-04-17T02:30:00Z）
- [x] NFR要件 — 完了（2026-04-17T03:00:00Z）
- [x] NFR設計 — 完了（2026-04-17T03:10:00Z）
- [x] インフラ設計 — 完了（2026-04-17T03:20:00Z）
- [x] コード生成 — 全 Step 完了（Step 1-17）

#### 全ユニット完了後
- [x] ビルドとテスト — 完了（2026-04-17T04:30:00Z）

### 🟡 オペレーションズフェーズ — Phase 1 MVP デプロイ進行中

#### Step 1: Foundation / DataShared / DataCore
- [x] ドメイン NS 反映確認（2026-04-18・vitanota.io → Route53 委譲完了）
- [x] Route53 連携を EdgeStack に実装（HostedZone.fromLookup + ACM DNS 検証 + apex A/AAAA Alias）
- [x] FoundationStack の ghActionsRole に ECR 権限付与（公開 construct として AppStack へ渡す）
- [x] AppStack から AppRunner 権限を iam.Policy で付与（循環参照回避）
- [x] `cdk deploy vitanota-prod-data-shared vitanota-prod-foundation` 成功（2026-04-18T07:22Z 前後）
- [x] RDS バックアップ戦略を Free Tier 対応へ変更（backupRetention 1 日 + SnapshotManager Lambda で manual snapshot 7 日保持）
- [x] `cdk deploy vitanota-prod-data-core` 再デプロイ成功（2026-04-18T08:35Z 頃・424s）
- [x] SnapshotManager Lambda スモークテスト（invoke 成功・冪等性 OK・EventBridge ENABLED）

#### Step 2: GitHub リポジトリ変数設定（次）
- [ ] `gh variable set ECR_REPOSITORY --body "vitanota/app"`
- [ ] `gh variable set AWS_ACCOUNT_ID --body "107094297297"`

#### Step 3: CI deploy.yml 改修
- [ ] `:latest` タグ push の追加
- [ ] `deploy-dev` / `deploy-prod` に APPRUNNER_SERVICE_ARN 未設定時の skip 条件追加
- [ ] commit & push main → CI が初回 Docker build + ECR push を実行

#### Step 4: AppStack デプロイ
- [ ] `cdk deploy vitanota-prod-app`（AppRunner が `:latest` を pull して起動）

#### Step 5: AppRunner ARN の GitHub variables 登録
- [ ] `gh variable set APPRUNNER_SERVICE_ARN_PROD --body "<ARN>"`（以降は main push で full pipeline）

#### Step 6: EdgeStack デプロイ
- [ ] `cdk deploy vitanota-prod-edge`（ACM DNS 検証 5-30 分 + CloudFront 作成 + Route53 Alias 投入）

#### Step 7: 本番 DB マイグレーション
- [ ] `aws lambda invoke --function-name vitanota-prod-db-migrator --payload '{"command":"migrate"}'`

#### Step 8: Google OAuth 設定
- [ ] Google Cloud Console で OAuth Client ID/Secret 発行
- [ ] Secrets Manager `vitanota/google-client-id` / `vitanota/google-client-secret` に投入
- [ ] AppRunner サービス再起動で反映

#### Step 9: CloudFront シークレットヘッダー置換
- [ ] `edge-stack.ts:136` の PLACEHOLDER_REPLACE_AFTER_DEPLOY を Secrets Manager `cloudfront-secret` 値に置き換え

#### Step 10: CI/CD 動作確認
- [ ] main への push で build → ECR push → AppRunner update-service → health check GREEN

## 現在のステータス
- **ライフサイクルフェーズ**: オペレーションズ - Phase 1 MVP デプロイ
- **現在のステージ**: Step 2（GitHub variables 設定）
- **次のステージ**: Step 3 - CI deploy.yml 改修
- **ステータス**: 2026-04-18・Step 1 完了（VPC + RDS + ECR + Secrets + OIDC Role + SnapshotManager）
- **ユーザー運用開始予定**: 5 日以内（2026-04-23 頃）

## Phase 1 デプロイ済みリソース（参照用）

### ネットワーク（ap-northeast-1）
- VPC: `vpc-0b2efa917c1511b2a`（10.0.0.0/16、private isolated × 2 AZ）
- App SG: `sg-00fb261aea8b5a563`
- RDS SG: `sg-0aa19637091c2ec70`
- Subnet × 2: `subnet-01fd8c3e9036d560c`・`subnet-0e35485baea10c195`

### RDS（data-core）
- エンドポイント: `vitanota-prod-db.cdcegkgsqgbs.ap-northeast-1.rds.amazonaws.com:5432`
- インスタンス: `vitanota-prod-db`（db.t4g.micro 単一 AZ・storage GP3 20GB）
- マスターパスワード: Secrets Manager `vitanota-prod/rds-master-password`
- バックアップ: 自動 1 日 + 手動 snapshot 7 日（`vitanota-prod-manual-YYYYMMDD`）

### SnapshotManager
- Lambda ARN: `arn:aws:lambda:ap-northeast-1:107094297297:function:vitanota-prod-snapshot-manager`
- EventBridge Rule: `vitanota-prod-snapshot-daily`（cron 0 18 * * ? * UTC = JST 03:00 daily）
- CloudWatch Logs: `/aws/lambda/vitanota-prod-snapshot-manager`（保持 30 日）

### Shared（data-shared）
- ECR: `107094297297.dkr.ecr.ap-northeast-1.amazonaws.com/vitanota/app`
- Secrets: `vitanota/nextauth-secret`・`vitanota/google-client-id`・`vitanota/google-client-secret`・`vitanota/cloudfront-secret`
- Audit S3: `vitanota-prod-audit-logs`（Object Lock 90 日 + KMS 暗号化）
- KMS: Alias `vitanota-prod-audit-kms`

### IAM
- GitHub Actions Role: `arn:aws:iam::107094297297:role/vitanota-prod-github-actions-role`（ECR push/pull 権限付き・main ブランチ + production environment 限定）
- Permission Boundary: `arn:aws:iam::107094297297:policy/vitanota-prod-permission-boundary`

## 📝 再開ポイント (2026-04-16)

### 現在の状態
- ローカル Docker 環境構築完了・動作確認済み
- **クロステナント漏洩を検出・修正完了** (RLS 4ロール体制)
- アプリは非特権ロール `vitanota_app` (NOSUPERUSER NOBYPASSRLS) で DB 接続
- E2E: 21 passed / 5 failed (残り5件はタグUI + perPageバリデーション齟齬、セキュリティ問題なし)
- ユニットテスト: 142 件 GREEN
- `pnpm dev` + cookie 注入で /journal 表示確認済み

### セキュリティ修正の概要 (本セッション実施)
- migrations: 0007 (FORCE RLS) + 0008 (vitanota_app ロール) + 0009 (CASE ポリシー + bootstrap)
- 4ロール: teacher / school_admin / system_admin / bootstrap
- RLS DSL: `pnpm rls:generate` / `pnpm rls:check` (CI 統合済み)
- middleware.ts + withAuthSSR / withAuthApi 導入
- 詳細: `aidlc-docs/construction/security/role-definitions.md`

### 次のステップ
1. Unit-03 機能設計

### ローカルコミット数
0（全て push 済み・CI GREEN）

### 全テスト
- ユニットテスト: 142 件 GREEN
- 統合テスト: 44 件 (CI で初実行予定)
- E2E テスト: 21/26 passed (残り5件は非セキュリティ)
- 合計: 212 tests

### 主要ドキュメント (ナビゲーション)
- `aidlc-docs/construction/security/role-definitions.md` - RLS 4ロール設計
- `aidlc-docs/construction/deployment-phases.md` - Phase 1/2 構成図
- `aidlc-docs/construction/er-diagram.md` - DB 構造
- `aidlc-docs/construction/sequence-diagrams.md` - 14 ユースケースのフロー
- `aidlc-docs/construction/user-lifecycle-spec.md` - 退会・転勤・エクスポート設計
- `aidlc-docs/construction/local-development.md` - ローカル環境セットアップ
- `aidlc-docs/inception/requirements/security-review.md` - 論点 A-M 対応済み
- `aidlc-docs/construction/plans/unit-02-code-generation-plan.md` - 全 Step チェックリスト
