# App Runner → Amazon ECS Express Mode 移行計画

**作成日**: 2026-04-19
**背景**: AWS から App Runner の新規受付停止通知（2026-04-30）を受領。既存ユーザーは継続利用可能だが、新機能追加なし。MVP β ローンチ（2026-04-23 頃）前に ECS Express Mode へ移行することを決定。
**関連ドキュメント**:
- `aidlc-docs/construction/deployment-phases.md` — Phase 1 As-Built 構成
- AWS: [ECS Express Mode Overview](https://docs.aws.amazon.com/ja_jp/AmazonECS/latest/developerguide/express-service-overview.html)
- AWS: [App Runner 提供終了](https://docs.aws.amazon.com/ja_jp/apprunner/latest/dg/apprunner-availability-change.html)

---

## 決定事項（2026-04-19 時点）

| 項目 | 決定 |
|---|---|
| 移行タイミング | **β ローンチ前に完了**（AppRunner での運用は行わない） |
| NAT 方針 | **NAT Gateway へ切替**（+$27/月、NAT Instance は廃止） |
| 切替方式 | **一発切替**（Route 53 加重ルーティング不使用・CloudFront origin を一度に変更） |
| X-CloudFront-Secret | **Secrets Manager 値へ置換**（この機会に PLACEHOLDER を解消） |

---

## 【移行前】現状構成（2026-04-19）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ エッジ層 (Global / us-east-1)                                            │
│                                                                          │
│   Route 53 vitanota.io ─ A/AAAA Alias ──┐                                │
│   ACM (us-east-1・vitanota.io) ─────────┼─┐                              │
│   WAF v2 Web ACL ───────────────────────┼─┼─┐                            │
│                                         ▼ ▼ ▼                            │
│                                    CloudFront                            │
│                         Origin: hacunxtx9p.ap-northeast-1                │
│                                  .awsapprunner.com (HTTPS)               │
│                         Custom Header:                                    │
│                                X-CloudFront-Secret=PLACEHOLDER ⚠️        │
│                         Origin Request Policy:                           │
│                                ALL_VIEWER_EXCEPT_HOST_HEADER             │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ HTTPS
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ ap-northeast-1                                                           │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │ 🔴 App Runner Service vitanota-prod-app                        │    │
│   │    - Instance: 0.25 vCPU / 0.5 GB・min=1 max=3                 │    │
│   │    - runtimeEnv: HOSTNAME=0.0.0.0 (quirk 回避)                 │    │
│   │                 NEXTAUTH_URL_INTERNAL=http://localhost:3000    │    │
│   │    - VPC Connector: vpc-connector-egress                       │    │
│   │    - 廃止サービス (2026-04-30 新規受付停止)                    │    │
│   └───────────────┬────────────────────────────────────────────────┘    │
│                   │ 全外向き通信                                         │
│                   ▼                                                      │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │ VPC 10.0.0.0/16                                                  │  │
│   │                                                                  │  │
│   │   PUBLIC × 2    PRIVATE_WITH_EGRESS × 2   PRIVATE_ISOLATED × 2  │  │
│   │   ┌─────┐      ┌─────────────────────┐   ┌─────────────────┐   │  │
│   │   │ 🔴 │      │ AppRunner Connector │   │ RDS             │   │  │
│   │   │ NAT │◄─────┤ ENI (appEgressSG)   │   │ (PostgreSQL 16) │   │  │
│   │   │ Inst│      │                     │   │                 │   │  │
│   │   │t4g  │      │ (動作確認取れず)    │   │ db-migrator λ   │   │  │
│   │   │.nano│      │                     │   │                 │   │  │
│   │   │ ⚠️  │      │         route: 0/0  │   │ VPC Endpoint:   │   │  │
│   │   └──┬──┘      │            → NAT    │   │ Secrets Manager │   │  │
│   │      │         └─────────────┬───────┘   └───────┬─────────┘   │  │
│   │      │                       │                   │             │  │
│   │   IGW│                       └──── 5432 ─────────┤             │  │
│   │      │                                                         │  │
│   └──────┼─────────────────────────────────────────────────────────┘  │
│          ▼                                                             │
│   インターネット (Google OAuth 等) ← NAT 動作疑義で 🔴 到達不可        │
└──────────────────────────────────────────────────────────────────────┘

共通サービス (VPC 外):
  ECR vitanota/app
  Secrets Manager × 5 (nextauth・google×2・cloudfront-secret⚠️未反映・rds-password)
  S3 audit bucket (Object Lock 90 日)
  KMS audit key
  SNS vitanota-prod-alerts
  snapshot-manager Lambda + EventBridge (daily)
  CloudWatch Alarms × 4 (AWS/AppRunner metrics)

CI/CD:
  GitHub kamitokusaric-lang/vitanota
    → Actions deploy.yml
      (OIDC → ECR push → aws apprunner update-service → polling)
  Vars: ECR_REPOSITORY, AWS_ACCOUNT_ID, APPRUNNER_SERVICE_ARN_PROD
```

---

## 【移行後】目標構成（2026-04-23 予定）

```
┌──────────────────────────────────────────────────────────────────────────┐
│ エッジ層 (Global / us-east-1)                                            │
│                                                                          │
│   Route 53 vitanota.io ─ A/AAAA Alias ──┐                                │
│   ACM (us-east-1・vitanota.io) ─────────┼─┐                              │
│   WAF v2 Web ACL ───────────────────────┼─┼─┐                            │
│                                         ▼ ▼ ▼                            │
│                                    CloudFront                            │
│                         Origin: vitanota-prod-alb-XXXX.                  │
│                                  ap-northeast-1.elb.amazonaws.com (HTTPS)│
│                         Custom Header:                                    │
│                                X-CloudFront-Secret=<Secrets Manager 値> ✅│
│                         Origin Request Policy:                           │
│                                ALL_VIEWER_EXCEPT_HOST_HEADER             │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ HTTPS
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ ap-northeast-1                                                           │
│                                                                          │
│   🆕 ACM (ap-northeast-1・vitanota.io) ──┐                               │
│                                           ▼                              │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │ 🆕 Application Load Balancer (public, 2 AZ)                    │    │
│   │    vitanota-prod-alb                                           │    │
│   │    HTTPS 443 Listener:                                         │    │
│   │      - Rule 1: if X-CloudFront-Secret != 有効値 → 403 ✅       │    │
│   │      - Rule 2: forward → Target Group                          │    │
│   │    HTTP 80 Listener: redirect to 443                           │    │
│   │    Target Group (type=ip): Fargate Task ENI                    │    │
│   │    Security Group: Ingress 443 from 0.0.0.0/0                  │    │
│   └───────────────┬────────────────────────────────────────────────┘    │
│                   │ HTTP 3000 (または HTTPS)                             │
│                   ▼                                                      │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │ 🆕 ECS Service (Express Mode)  vitanota-prod-service           │    │
│   │    Cluster: vitanota-prod-cluster                              │    │
│   │    Task Definition: vitanota-prod-task (Fargate・ARM64)        │    │
│   │      Container: ECR vitanota/app:latest                        │    │
│   │      CPU: 256 / Memory: 512 (要検討: 512/1024 推奨)            │    │
│   │      desiredCount: 1 (0 も可能)                                │    │
│   │      Env: NODE_ENV, NEXTAUTH_URL, NEXTAUTH_URL_INTERNAL,       │    │
│   │           RDS_PROXY_ENDPOINT, DB_USER, DB_NAME, DB_SSL,        │    │
│   │           PORT=3000                                            │    │
│   │      Secrets (runtime から取得): 4 件                          │    │
│   │    Task Role: vitanota-prod-task-role                          │    │
│   │    Task Execution Role: vitanota-prod-task-execution-role      │    │
│   │    Log Group: /ecs/vitanota-prod                               │    │
│   └───────────────┬────────────────────────────────────────────────┘    │
│                   │ 全外向き通信                                         │
│                   ▼                                                      │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │ VPC 10.0.0.0/16 (既存・無変更)                                    │  │
│   │                                                                  │  │
│   │   PUBLIC × 2    PRIVATE_WITH_EGRESS × 2   PRIVATE_ISOLATED × 2  │  │
│   │   ┌─────┐      ┌─────────────────────┐   ┌─────────────────┐   │  │
│   │   │🆕   │      │ Fargate Task ENI    │   │ RDS             │   │  │
│   │   │ NAT │◄─────┤ (taskSG)            │   │ (PostgreSQL 16) │   │  │
│   │   │Gate-│      │                     │   │                 │   │  │
│   │   │way  │      │                     │   │ db-migrator λ   │   │  │
│   │   │ ✅  │      │         route: 0/0  │   │                 │   │  │
│   │   └──┬──┘      │            → NAT GW │   │ VPC Endpoint:   │   │  │
│   │      │         └─────────────┬───────┘   │ Secrets Manager │   │  │
│   │      │                       │           └───────┬─────────┘   │  │
│   │      │                       │                   │             │  │
│   │   IGW│                       └──── 5432 ─────────┤             │  │
│   │      │                                                         │  │
│   │   ┌──┴──────────────┐                                          │  │
│   │   │ 🆕 ALB          │                                          │  │
│   │   │ (public subnet) │                                          │  │
│   │   └─────────────────┘                                          │  │
│   └────────────────────────────────────────────────────────────────┘   │
│          ▼                                                             │
│   インターネット (Google OAuth 等) ← NAT Gateway 経由で ✅ 到達可能    │
└──────────────────────────────────────────────────────────────────────┘

共通サービス (VPC 外): 【無変更】
  ECR vitanota/app
  Secrets Manager × 5 (cloudfront-secret ✅値反映済)
  S3 audit bucket (Object Lock 90 日)
  KMS audit key
  SNS vitanota-prod-alerts
  snapshot-manager Lambda + EventBridge (daily)
  CloudWatch Alarms × 4 (AWS/ECS + AWS/ApplicationELB metrics に差し替え)

CI/CD: 【差分】
  GitHub kamitokusaric-lang/vitanota
    → Actions deploy.yml
      (OIDC → ECR push → aws ecs register-task-definition
                      → aws ecs update-service → polling)
  Vars: ECR_REPOSITORY, AWS_ACCOUNT_ID,
        🆕 ECS_CLUSTER_NAME, ECS_SERVICE_NAME, ECS_TASK_FAMILY
        🗑️ APPRUNNER_SERVICE_ARN_PROD 削除
```

---

## 🔄 変更されるコンポーネント

| レイヤ | 現状 | 移行後 | 変更種別 |
|---|---|---|---|
| アプリ実行基盤 | App Runner Service | ECS Fargate Service (Express Mode) | 差し替え |
| ロードバランサー | 内蔵 | **Application Load Balancer** | 新規 |
| ACM 証明書 | us-east-1 のみ | us-east-1 + **ap-northeast-1（新）** | 追加 |
| NAT | NAT Instance（疑義あり） | **NAT Gateway** | 差し替え |
| CloudFront Origin | AppRunner URL | ALB DNS | origin 設定変更 |
| X-CloudFront-Secret | PLACEHOLDER | **Secrets Manager 値** | 置換 |
| IAM Role (AppRunner) | Instance Role + Access Role | **Task Execution Role + Task Role** | 差し替え |
| Auto Scaling | AppRunner 内蔵 | ECS Service Auto Scaling | 自動（Express Mode） |
| Log 出力 | AppRunner Log Group | **/ecs/vitanota-prod Log Group** | 新規 |
| CloudWatch Alarm メトリクス | AWS/AppRunner | **AWS/ECS + AWS/ApplicationELB** | 付け替え |
| GitHub Actions 権限 | apprunner:UpdateService | **ecs:UpdateService 等** | 差し替え |
| deploy.yml | aws apprunner ... | **aws ecs register-task-definition + update-service** | 改修 |

## ✅ 継続（手を触れない）コンポーネント

Route 53 / CloudFront（origin 以外）/ WAF / us-east-1 ACM / VPC / 全サブネット / IGW / Secrets Manager VPC Endpoint / RDS / db-migrator Lambda / snapshot-manager Lambda / EventBridge / ECR / Secrets Manager × 5（cloudfront-secret 以外は既に投入済）/ S3 audit / KMS / SNS / GitHub OIDC Provider / GitHub Actions Role（ARN 維持）/ Permission Boundary

## 🗑️ 削除コンポーネント

App Runner Service / App Runner VPC Connector × 2（新・旧 DELETE_FAILED 両方）/ App Runner AutoScaling Configuration / App Runner Instance Role / App Runner Access Role / GhActionsAppRunnerPolicy / NAT Instance（EC2 + IAM Role + NAT SG）/ `APPRUNNER_SERVICE_ARN_PROD` GitHub 変数 / `HOSTNAME=0.0.0.0` runtimeEnvironmentVariables（ECS では不要）

## 🆕 新規コンポーネント

ECS Cluster / ECS Task Definition / ECS Service（Express Mode）/ Task Execution Role / Task Role / `/ecs/vitanota-prod` Log Group / ALB / Target Group / ALB HTTPS Listener + Rules / ALB HTTP→HTTPS redirect Listener / ALB Security Group / Task Security Group / **ACM 証明書 ap-northeast-1** / **NAT Gateway** / `ECS_CLUSTER_NAME` / `ECS_SERVICE_NAME` / `ECS_TASK_FAMILY` GitHub 変数

---

## オープン課題（ユーザー判断待ち）

### ① ALB の公開範囲

- **A. public ALB + CloudFront Secret ヘッダーで保護**（シンプル・現状流用）
- **B. public ALB + CloudFront Prefix List 制限 + Secret ヘッダー**（ALB SG で CloudFront IP 範囲のみ許可・より厳格）
- **C. internal ALB + VPC Link**（最も厳格・CloudFront 設定が複雑）

推奨: A で β ローンチ → Phase 2 で B に昇格

### ② Fargate Task サイズ

- **A. 256/512**（0.25 vCPU / 0.5 GB・AppRunner 同等）
- **B. 512/1024**（0.5 vCPU / 1 GB・ALB ヘルスチェック猶予あり）

推奨: A（β 1 校規模なら十分。後で `aws ecs update-service --force-new-deployment` で変更可能）

### ③ Fargate Task 数

- **A. desiredCount=1**（常時稼働・~$7-10/月）
- **B. desiredCount=0**（初回リクエスト時に起動・コールドスタート数十秒・コスト最小）
- **C. minCapacity=1, maxCapacity=3 の Auto Scaling**（トラフィック連動）

推奨: A で β ローンチ（教員が昼休み等に集中する想定なら常時稼働が体感良い）

---

## 見積もり工数・所要時間

| タスク | 所要時間 |
|---|---|
| CDK 新 EcsStack 作成（Task Definition + Service + ALB + TG + SGs + Listeners） | 3-4 時間 |
| ap-northeast-1 に新 ACM 証明書（DNS 検証待ち含む） | 30 分 |
| NAT Gateway 切替 | 10 分 |
| CloudFront origin を ALB DNS に変更 | 10 分 |
| X-CloudFront-Secret を Secrets Manager 値に置換 | 20 分 |
| deploy.yml 改修（AppRunner → ECS コマンド） | 30 分 |
| IAM 権限調整 | 20 分 |
| CDK デプロイ + 初回動作確認 | 1 時間 |
| E2E（Google OAuth ログイン通し） | 30 分 |
| 旧 AppRunner 関連リソース削除 | 20 分 |
| audit.md / deployment-phases.md 更新 | 30 分 |
| **合計** | **約 7-8 時間** |

β ローンチ（2026-04-23）まで 4 日あるので **余裕あり**。

---

## リスクと緩和策

| リスク | 影響 | 緩和策 |
|---|---|---|
| ALB + ECS の初回起動でヘルスチェック失敗 | β 遅延 | 既存 AppRunner は残しておき、CloudFront origin 切替は ALB 動作確認後に実施。ECS が不安定なら AppRunner に即戻せる |
| Fargate で Secrets Manager の runtime 取得が遅くコールドスタート長い | UX 悪化 | 環境変数 injection（valueFrom: secretsmanager）で起動時に解決・ランタイム fetch 不要に |
| ACM ap-northeast-1 証明書の DNS 検証が長引く | 移行ブロック | 先に証明書だけ発行して検証完了を確認してから他作業 |
| NAT Gateway 切替で既存 Lambda migrator の Secrets Manager アクセスが途切れる | DB 管理不能 | db-migrator は PRIVATE_ISOLATED で VPC Endpoint 経由なので NAT 変更の影響なし |

---

## 次のアクション

ユーザーがこの計画を検討後、以下のいずれか：

- **承認**: 実装タスク展開（CDK EcsStack 作成から開始）
- **修正要求**: オープン課題 ①〜③ の決定内容を反映してから実装
- **保留**: 追加調査（ECS Express Mode の制約・料金詳細など）
