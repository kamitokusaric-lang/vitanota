# 共有インフラ設計

## 概要

vitanota のすべてのユニット（Unit-01〜Unit-04）が共有する AWS インフラリソースを定義する。マルチテナント分離はアプリケーション層の PostgreSQL RLS（Row Level Security）で実現する。インフラ層では単一の App Runner + RDS を全テナントで共有する。

---

## マルチテナント分離方式

```
[全テナント共有]              [テナント分離]
App Runner (単一)    ---→    withTenant() による RLS
RDS PostgreSQL (単一) ---→   app.tenant_id SET CONFIG
RDS Proxy (単一)     ---→    各リクエストでテナント ID 付与
```

- **インフラ共有**: App Runner・RDS・RDS Proxy は全テナント共通
- **データ分離**: PostgreSQL の `SET CONFIG('app.tenant_id', ...)` + RLS ポリシーで行レベル分離
- **コスト効率**: 初期テナント数（MVP: 10〜50校）では単一 RDS で十分

---

## ユニット別インフラ利用状況

| インフラリソース | Unit-01 | Unit-02 | Unit-03 | Unit-04 |
|---|---|---|---|---|
| App Runner | 認証・テナント API | ウェルネス記録 API | - | - |
| RDS PostgreSQL | users / tenants / roles | wellness_records | - | - |
| RDS Proxy | IAM 認証接続 | IAM 認証接続 | - | - |
| Secrets Manager | NextAuth / OAuth | - | - | - |
| CloudWatch Logs | アプリログ | アプリログ | - | - |
| EventBridge + Lambda | - | - | - | バッチ処理 |

---

## 共有 AWS リソース一覧

### ネットワーク（VPC）

| リソース | 仕様 |
|---|---|
| VPC CIDR | 10.0.0.0/16 |
| プライベートサブネット A | 10.0.1.0/24（ap-northeast-1a） |
| プライベートサブネット C | 10.0.2.0/24（ap-northeast-1c） |
| VPC コネクター | apprunner-vpc-connector（全ユニット共有） |
| NAT ゲートウェイ | なし（App Runner はパブリック、RDS アクセスは VPC コネクター経由） |

### コンピューティング（App Runner）

| リソース | dev | prod |
|---|---|---|
| サービス名 | vitanota-dev | vitanota-prod |
| vCPU | 0.25 | 0.25 |
| メモリ | 0.5 GB | 0.5 GB |
| 最小インスタンス | 0 | 1 |
| 最大インスタンス | 3 | 5 |

**すべてのユニットの API は同一 App Runner サービス（Next.js）上で動作する。**

### コンテナレジストリ（ECR）

| リソース | 仕様 |
|---|---|
| リポジトリ名 | vitanota/app |
| イメージタグ形式 | `{env}-{git-sha}` |
| ライフサイクルポリシー | 30世代以上の古いイメージを削除 |
| スキャン設定 | プッシュ時に脆弱性スキャン実行 |

### データベース（RDS + RDS Proxy）

| リソース | dev | prod |
|---|---|---|
| RDS サービス名 | vitanota-db-dev | vitanota-db-prod |
| インスタンスタイプ | db.t4g.micro | db.t4g.micro |
| Multi-AZ | なし | あり |
| ストレージ | 20 GB gp3 | 20 GB gp3（Auto Scaling 有効） |
| 自動バックアップ保持 | 7日 | 7日 |
| RDS Proxy 名 | vitanota-proxy-dev | vitanota-proxy-prod |
| 認証 | IAM 認証 | IAM 認証 |

### シークレット管理（Secrets Manager）

| シークレット名 | ユニット | 内容 |
|---|---|---|
| `vitanota/nextauth-secret` | Unit-01 | NextAuth JWT 署名キー |
| `vitanota/google-client-id` | Unit-01 | Google OAuth ID |
| `vitanota/google-client-secret` | Unit-01 | Google OAuth シークレット |

### 監視（CloudWatch + SNS）

| リソース | 仕様 |
|---|---|
| SNS トピック | vitanota-alerts（全ユニット共通） |
| 通知先 | メール（管理者アドレス） |
| ロググループ（prod） | /vitanota/prod/app（90日保持） |
| ロググループ（dev） | /vitanota/dev/app（30日保持） |

---

## IAM ロール設計（共有）

### App Runner インスタンスロール

**ロール名**: `vitanota-apprunner-role`

全ユニットの App Runner コンテナが使用する共通ロール。ユニットが追加されるたびに必要な権限を追記する。

```
現在の権限（Unit-01 時点）:
- secretsmanager:GetSecretValue（vitanota/* のみ）
- rds-db:connect（vitanota_app ユーザーのみ）
- logs:CreateLogGroup / CreateLogStream / PutLogEvents
- ecr:GetAuthorizationToken / BatchCheckLayerAvailability
    / GetDownloadUrlForLayer / BatchGetImage
```

### GitHub Actions OIDC ロール

**ロール名**: `vitanota-github-actions-role`

CI/CD パイプライン専用ロール。全ユニット共通で使用。

```
権限:
- ecr:GetAuthorizationToken / BatchCheckLayerAvailability
    / PutImage / InitiateLayerUpload / UploadLayerPart / CompleteLayerUpload
- apprunner:UpdateService / DescribeService
```

---

## スケーリング指針

### スケールアップ判断基準

| メトリクス | 閾値 | アクション |
|---|---|---|
| App Runner MemoryUtilization | 80% 超過が継続 | 0.5 vCPU / 1 GB に変更 |
| RDS CPUCreditBalance | 50 未満が継続 | db.t4g.small に変更 |
| RDS CPUUtilization | 80% 超過が継続 | db.t4g.small に変更 |
| テナント数 | 100 校超過 | RDS インスタンスタイプ見直し |

### 将来的なスケーリングパス

```
MVP（〜50校）: db.t4g.micro / App Runner 0.25 vCPU×5
    ↓
成長期（50〜200校）: db.t4g.small / App Runner 0.5 vCPU×10
    ↓
拡大期（200校〜）: db.r8g.large / 読み取りレプリカ追加 / App Runner 1 vCPU×auto
```

---

## インフラプロビジョニング方針

MVP 段階では AWS コンソールおよび AWS CLI による手動プロビジョニングを採用する。IaC（Terraform / CDK）への移行は Phase 2 以降で検討する。

### 初期セットアップ順序

```
[1] VPC・サブネット・セキュリティグループ作成
[2] RDS PostgreSQL 作成（プライベートサブネット内）
[3] RDS Proxy 作成（IAM 認証設定）
[4] Secrets Manager シークレット作成
[5] IAM ロール作成（apprunner-role / github-actions-role）
[6] ECR リポジトリ作成
[7] App Runner VPC コネクター作成
[8] App Runner サービス作成（dev → prod）
[9] CloudWatch ロググループ・アラーム作成
[10] SNS トピック作成・メールサブスクリプション確認
[11] GitHub OIDC プロバイダー設定
[12] GitHub Secrets / Variables 設定
[13] 初回デプロイ実行・ヘルスチェック確認
```
