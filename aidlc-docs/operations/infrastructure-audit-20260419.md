# インフラ棚卸し・クリーンアップ計画 (2026-04-19)

**目的**: AppRunner / 認証フローの度重なる変更で蓄積した不要リソースの洗い出しと計画的削除。β ローンチ前にインフラを最小構成に整理する。

**対象**: AWS アカウント 107094297297 / リージョン ap-northeast-1 + us-east-1

**前提ドキュメント**:
- `aidlc-docs/construction/deployment-phases.md` (As-Built 2026-04-19)
- `aidlc-docs/construction/auth-externalization.md` (認証外部化設計)

---

## 1. 全リソースインベントリ

### 1.1 CloudFormation スタック (5 本 + CDKToolkit)

| Stack | Region | 状態 |
|---|---|---|
| `vitanota-prod-foundation` | ap-northeast-1 | ✅ |
| `vitanota-prod-data-core` | ap-northeast-1 | ✅ |
| `vitanota-prod-data-shared` | ap-northeast-1 | ✅ |
| `vitanota-prod-app` | ap-northeast-1 | ✅ |
| `vitanota-prod-edge` | us-east-1 | ✅ |
| `CDKToolkit` | ap-northeast-1 + us-east-1 | ✅ bootstrap |

### 1.2 AppRunner

| リソース | 状態 | 備考 |
|---|---|---|
| Service `vitanota-prod-app` | ✅ RUNNING | 現本番 |
| VPC Connector `vitanota-prod-vpc-connector-egress` | ✅ ACTIVE | 現本番で使用 |
| VPC Connector **`vitanota-prod-vpc-connector`** | ⚠️ ACTIVE（orphan） | CFN 管理外・使用なし |

### 1.3 VPC (`vpc-0b2efa917c1511b2a` 10.0.0.0/16)

| サブネット | CIDR | AZ | タイプ | 現利用者 |
|---|---|---|---|---|
| subnet-01fd8c3e9036d560c | 10.0.0.0/24 | 1a | private-isolated | RDS / db-migrator / Secrets Mgr Endpoint |
| subnet-0e35485baea10c195 | 10.0.1.0/24 | 1c | private-isolated | RDS / Secrets Mgr Endpoint |
| subnet-03756f83030508667 | 10.0.2.0/24 | 1a | public | NAT Instance + IGW |
| subnet-0470c2cb2f0073327 | 10.0.3.0/24 | 1c | public | 未使用 |
| subnet-04aae35ad0a25250a | 10.0.4.0/24 | 1a | private-egress | AppRunner VPC Connector (現) |
| subnet-0b0a05ceff6fd8c80 | 10.0.5.0/24 | 1c | private-egress | AppRunner VPC Connector (現) |

### 1.4 Security Groups (5 本)

| SG ID | 名前 | 現利用 |
|---|---|---|
| sg-00fb261aea8b5a563 | vitanota-prod-app-sg | Secrets Mgr Endpoint / db-migrator Lambda |
| sg-0aa19637091c2ec70 | vitanota-prod-rds-sg | RDS |
| sg-0fb35efe9d5c440c6 | vitanota-prod-app-egress-sg | 新 VPC Connector |
| sg-0fdcd4fab8dcb74c6 | NatSecurityGroup | NAT Instance |
| sg-029abc39794303c82 | default | (VPC デフォルト) |

### 1.5 EC2

| インスタンス | タイプ | 用途 | 状態 |
|---|---|---|---|
| i-05a89c46ca4878612 | t4g.nano | NAT Instance | running |

### 1.6 RDS

| インスタンス | クラス | 用途 |
|---|---|---|
| vitanota-prod-db | db.t4g.micro | 本番 DB (12 migration 適用済) |

### 1.7 Lambda (5 本)

| 関数 | ランタイム | 用途 |
|---|---|---|
| vitanota-prod-db-migrator | Node.js 20 | DB マイグレーション |
| vitanota-prod-snapshot-manager | Node.js 20 | 日次 manual snapshot |
| vitanota-prod-app-CustomCrossRegionExportWriter... | Node.js 22 | CDK cross-region (app stack) |
| vitanota-prod-data-core-LogRetention... | Node.js 22 | CDK log retention |
| vitanota-prod-foundation-CustomAWSCDKOpenIdConnect... | Node.js 22 | CDK OIDC Provider |

### 1.8 ECR (2 本)

| リポジトリ | 用途 |
|---|---|
| vitanota/app | 本番 image (`:prod-1c6d174` / `:latest`) |
| cdk-hnb659fds-container-assets-... | CDK asset 保管 |

### 1.9 Secrets Manager (5 本)

| 名前 | 用途 | 参照元 |
|---|---|---|
| vitanota-prod/rds-master-password | RDS マスターパスワード | db-migrator Lambda |
| vitanota/nextauth-secret | NextAuth cookie 署名 | AppRunner (runtime fetch) |
| vitanota/google-client-id | aud 検証用 (env 優先) | AppRunner (fallback only) |
| vitanota/google-client-secret | ⚠️ **未使用** | (旧 Auth Code Flow 用・削除可) ← **2026-04-22 訂正: Lambda Proxy 実装 (4/21) で現役化。削除判定は撤回済** |
| vitanota/cloudfront-secret | ⚠️ **現状 idle** | Phase 2 で使用予定 |

### 1.10 VPC Endpoints (1)

| Endpoint | タイプ | 用途 |
|---|---|---|
| secretsmanager (ap-northeast-1) | Interface | db-migrator Lambda の Secrets Manager アクセス（NAT 無しで到達するため必須） |

### 1.11 S3

| バケット | 用途 |
|---|---|
| vitanota-prod-audit-logs | 監査ログ (Object Lock 90 日・KMS 暗号化) |

### 1.12 CloudWatch

| アラーム | 状態 |
|---|---|
| vitanota-prod-http-5xx | INSUFFICIENT_DATA |
| vitanota-prod-rds-cpu-high | OK |
| vitanota-prod-memory-high | INSUFFICIENT_DATA |
| vitanota-prod-waf-blocked | INSUFFICIENT_DATA |

### 1.13 EventBridge

| ルール | スケジュール |
|---|---|
| vitanota-prod-snapshot-daily | cron(0 18 * * ? *) = JST 03:00 毎日 |

### 1.14 IAM ロール (10 本)

- `vitanota-prod-github-actions-role` — CI/CD OIDC
- `vitanota-prod-apprunner-access-role` — ECR pull
- `vitanota-prod-apprunner-instance-role` — AppRunner container 権限
- `vitanota-prod-db-migrator-execute-role` — db-migrator Lambda 実行
- `vitanota-prod-data-core-SnapshotManagerServiceRole-...` — snapshot-manager 実行
- `vitanota-prod-foundation-VpcpublicSubnet1NatInstance-...` — ⚠️ NAT Instance 用（削除予定）
- その他 CDK 内部 Lambda 実行ロール × 4

### 1.15 Edge (us-east-1)

| リソース | 用途 |
|---|---|
| ACM 証明書 (vitanota.io) | CloudFront |
| CloudFront Distribution E1KDWTUZQ26IMP | CDN |
| WAF v2 Web ACL | マネージドルール + rate limit |

### 1.16 Route 53

| Hosted Zone | レコード |
|---|---|
| vitanota.io (Z07518311ZMREXV3WSASV) | A/AAAA (CloudFront Alias) |

---

## 2. 分類と対応方針

### 🔴 即削除推奨（orphan / 明確に不要）

| # | リソース | 削除方法 | リスク | 所要 |
|---|---|---|---|---|
| A-1 | AppRunner VPC Connector `vitanota-prod-vpc-connector` (legacy) | AWS CLI 直接削除 | 低（既に誰も参照していない） | 1 分 | ✅ 2026-04-22 完了 |
| A-2 | ~~Secrets Manager `vitanota/google-client-secret`~~ | ~~AWS CLI (30 日 recovery 付き)~~ | ~~低（コード内参照なし）~~ | ~~1 分~~ | ❌ **撤回 (2026-04-22)**: Lambda Proxy で現役使用中 |

### 🟡 認証外部化で不要になった（CDK で計画的削除）

| # | リソース | 削除方法 | リスク | 所要 |
|---|---|---|---|---|
| B-1 | AppRunner VPC Connector を PRIVATE_ISOLATED へ戻す | CDK (app-stack.ts) | 中（ダウンタイム数分） | 10 分 |
| B-2 | NAT Instance + NAT SG + NAT IAM Role | CDK (foundation-stack.ts) | 中（削除時に一時的なルート変更） | 5 分 |
| B-3 | appEgressSecurityGroup | CDK (foundation-stack.ts) | 低（B-1 後に孤児化） | CDK 自動 |
| B-4 | PUBLIC サブネット × 2 + Internet Gateway | CDK (foundation-stack.ts) | 低（B-2 後に使用者なし） | CDK 自動 |
| B-5 | PRIVATE_WITH_EGRESS サブネット × 2 | CDK (foundation-stack.ts) | 低（B-1 後に使用者なし） | CDK 自動 |

### ⚪️ 保留（Phase 2 で使用予定）

| # | リソース | 保留理由 |
|---|---|---|
| C-1 | Secrets Manager `vitanota/cloudfront-secret` | Phase 2 で CloudFront → AppRunner シークレットヘッダー enforcement に使用 |
| C-2 | middleware.ts の `CLOUDFRONT_SECRET` 条件 check | 同上（env 未設定時は skip する防御的コード） |

---

## 3. クリーンアップ実施計画

### 前提条件

- ✅ 認証外部化デプロイ完了・ログインテスト通過
- ✅ β 招待ユーザー登録は **クリーンアップ後** に実施（ユーザー指示）

### 実施順序（リスク昇順）

#### Phase A: Orphan 削除（CLI で即実施可能・5 分）

**A-1. 旧 VPC Connector 削除**

```bash
aws apprunner delete-vpc-connector --region ap-northeast-1 \
  --vpc-connector-arn arn:aws:apprunner:ap-northeast-1:107094297297:vpcconnector/vitanota-prod-vpc-connector/1/9dcf0ec8b15d400487011ebe8a3653e1
```

ロールバック: 削除後の復元は不可。ただし CDK 管理外の orphan なので、仮に間違えて削除しても本番に影響なし。

**A-2. google-client-secret 削除** — ❌ **撤回 (2026-04-22)**

Lambda Proxy (`vitanota-prod-google-token-proxy`) が SECRET_ARN で参照するため削除不可。当時の判定は Lambda Proxy 実装前のスナップショット。

### Phase B: CDK による構成整理（30-45 分）

**B-1 ～ B-5 は同一の CDK deploy で一括実施**（foundation と app の 2 スタック更新）。

#### 変更内容

##### `infra/lib/app-stack.ts`

```typescript
// Before
const vpcConnector = new apprunner.CfnVpcConnector(this, 'VpcConnector', {
  vpcConnectorName: `${prefix}-vpc-connector-egress`,
  subnets: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
  securityGroups: [props.appEgressSecurityGroup.securityGroupId],
});

// After
const vpcConnector = new apprunner.CfnVpcConnector(this, 'VpcConnector', {
  vpcConnectorName: `${prefix}-vpc-connector`,  // 元の名前に戻す (orphan は Phase A で削除済)
  subnets: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
  securityGroups: [props.appSecurityGroup.securityGroupId],
});
```

また `appEgressSecurityGroup` を props から削除。

##### `infra/lib/foundation-stack.ts`

```typescript
// Before
const vpc = new ec2.Vpc(this, 'Vpc', {
  ...
  subnetConfiguration: [
    { cidrMask: 24, name: 'private-isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    { cidrMask: 24, name: 'public', subnetType: ec2.SubnetType.PUBLIC },
    { cidrMask: 24, name: 'private-egress', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
  ],
  natGateways: 1,
  natGatewayProvider: ec2.NatProvider.instanceV2({...}),
});

// After
const vpc = new ec2.Vpc(this, 'Vpc', {
  ...
  subnetConfiguration: [
    { cidrMask: 24, name: 'private-isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
  ],
  // natGateways / natGatewayProvider / PUBLIC / PRIVATE_WITH_EGRESS 全削除
});
```

また `appEgressSecurityGroup` 作成ブロックを丸ごと削除、RDS SG の ingress ルールからも appEgressSG 参照を削除。

##### `infra/bin/vitanota.ts`

`appEgressSecurityGroup: foundation.appEgressSecurityGroup` を AppStack props から削除。

#### デプロイ順序

```bash
# 1. CDK deploy（app 先・foundation 後が安全）
#    理由: AppRunner Connector を新しい方に切り替えてから NAT 削除しないと
#          ルート欠落タイミングで AppRunner が一瞬アクセス不能になる可能性
cd infra
CDK_DEFAULT_ACCOUNT=107094297297 npx cdk deploy vitanota-prod-app --exclusively --require-approval never

# 2. AppRunner Connector 置き換え確認
aws apprunner describe-service --region ap-northeast-1 \
  --service-arn <ARN> \
  --query 'Service.NetworkConfiguration.EgressConfiguration.VpcConnectorArn'
# → 新しい .../vitanota-prod-vpc-connector/... (-egress 無し) になっていること

# 3. foundation 更新（NAT Instance + 関連リソース削除）
CDK_DEFAULT_ACCOUNT=107094297297 npx cdk deploy vitanota-prod-foundation --exclusively --require-approval never

# 4. 動作確認
curl -s https://vitanota.io/api/health
# → 200
```

#### 想定されるダウンタイム

- **AppRunner Connector 置き換え時に 1-3 分**（新 Connector 作成 → AppRunner が新 Connector 使用に切替 → 旧 Connector 削除）
- ユーザーからは AppRunner の再起動タイミングで 503 が数回返る可能性
- β ローンチ前の時間帯（深夜等）に実施すれば実質無影響

#### ロールバック手順

問題が発生した場合:

1. CDK 変更を revert: `git revert <commit>`
2. `cdk deploy vitanota-prod-foundation vitanota-prod-app`
3. NAT Instance + egress subnet が再作成される
4. AppRunner Connector が再び egress 版に戻る

復旧時間: 5-10 分（サブネット作成 + NAT Instance 起動待ち）。

### Phase C: ドキュメント更新（30 分）

- `deployment-phases.md` As-Built セクション → クリーンアップ後の構成に更新
- `migration-apprunner-to-ecs-express.md` → NAT 不要前提に書き換え（ECS 移行時もシンプル構成で済む）
- `auth-externalization.md` → 補足なし（当初から VPC 外向き不要な設計だった旨は既記）

---

## 4. クリーンアップ後の想定構成

```
ap-northeast-1
 └─ VPC 10.0.0.0/16
    └─ PRIVATE_ISOLATED × 2 AZ
       ├─ RDS (PostgreSQL 16)
       ├─ db-migrator Lambda
       ├─ AppRunner VPC Connector
       └─ Secrets Manager VPC Endpoint

       ※ これ以外のサブネット・NAT・IGW は全て削除

us-east-1 (変更なし)
 └─ CloudFront + ACM + WAF

VPC 外 (変更なし)
 └─ ECR / Secrets Manager × 4 / S3 audit / KMS / SNS / Lambda snapshot-manager / EventBridge
```

---

## 5. コスト削減効果

| 項目 | 月額削減 |
|---|---|
| NAT Instance (t4g.nano) + EBS 8GB | -$5 |
| Secrets Manager `vitanota/google-client-secret` | -$0.40 |
| **合計** | **-$5.40** |

金額は小さいが **構成の単純化** が主目的。  
以下の設計上の利点:

- VPC サブネット: 6 種 → 2 種
- SG: 4 (+default) → 2 (+default)
- EC2 インスタンス: 1 → 0
- "PRIVATE_WITH_EGRESS" "appEgressSG" の存在理由を説明不要に
- ECS 移行時も PRIVATE_ISOLATED + VPC Endpoint のシンプル構成のまま進められる

---

## 6. タスクトラッキング

| タスクID | 内容 | 状態 |
|---|---|---|
| AUDIT-1 | この棚卸しドキュメント作成 | ✅ 完了 |
| CLEANUP-A1 | 旧 VPC Connector 手動削除 | pending |
| CLEANUP-A2 | google-client-secret 削除 | pending |
| CLEANUP-B | CDK 改修 (NAT/subnet/SG 削除) + デプロイ | pending |
| CLEANUP-C | ドキュメント更新 (deployment-phases / migration-apprunner-to-ecs) | pending |
