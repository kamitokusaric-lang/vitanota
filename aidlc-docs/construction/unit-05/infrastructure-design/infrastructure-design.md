# Unit-05 (AI 連携) — インフラ設計

> **対応 NFR 設計**: [`construction/unit-05/nfr-design/`](../nfr-design/)
> **対応 NFR 要件**: [`construction/unit-05/nfr-requirements/`](../nfr-requirements/)
> **作成日**: 2026-05-11
> **位置付け**: NFR 設計の論理コンポーネントを実 AWS リソースにマッピング、CDK ai-chat-stack の具体構成

## アーキテクチャ全体図

```
                    ┌─────────────────────┐
                    │   Browser (教員)     │
                    │  ChatBubble +       │
                    │  ChatModal          │
                    └──────────┬──────────┘
                               │ HTTPS
                               ▼
                    ┌─────────────────────┐
                    │   CloudFront         │  ← 既存 EdgeStack
                    │  (既存 distribution) │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   AppRunner          │  ← 既存 AppStack
                    │   Next.js (Pages +   │
                    │   API routes)        │
                    │  /api/ai-chat/extract│
                    └──┬───────────────┬───┘
                       │               │
            ┌──────────┘               └──────────┐
            │ Lambda invoke             │ PostgreSQL
            ▼                           ▼
   ┌──────────────────┐       ┌──────────────────┐
   │  Lambda          │       │  RDS PostgreSQL   │  ← 既存 DataCore
   │  chat-extraction │       │  (既存 + 拡張)    │
   │  (新規・新 stack)│       │  api_rate_limits  │
   └────────┬─────────┘       │  tasks (+col)     │
            │ Bedrock invoke   │  journal_entries  │
            │                  │  (+col)           │
            ▼                  └──────────────────┘
   ┌──────────────────┐
   │  AWS Bedrock     │  ← Anthropic Claude
   │  ap-northeast-1  │  Haiku 4.5
   └──────────────────┘

   ┌──────────────────────────────────────┐
   │  Observability (新規・新 stack 一部)   │
   │  ├─ CloudWatch Logs                  │
   │  ├─ CloudWatch Metrics (custom)      │
   │  ├─ CloudWatch Alarms                │
   │  └─ SNS topic → 運営 chimo email     │
   └──────────────────────────────────────┘

   ┌──────────────────────────────────────┐
   │  Secrets / Config (新規・一部)         │
   │  ├─ Secrets Manager: Bedrock 設定     │
   │  └─ SSM Parameter Store: model_id 等  │
   └──────────────────────────────────────┘
```

## CDK スタック構成

### 既存スタック (5 個、変更なし)
1. **FoundationStack**: VPC / IAM ベースロール / ECR
2. **DataSharedStack**: Secrets Manager / Audit S3
3. **DataCoreStack**: RDS PostgreSQL / SnapshotManager Lambda / db-migrator Lambda
4. **AppStack**: AppRunner サービス
5. **EdgeStack**: CloudFront + Route53 + ACM

### 新規スタック (6 個目)
**AiChatStack** (新規、Unit-05 専用)
- Lambda chat-extraction
- IAM execution role (Bedrock invoke 権限のみ)
- Secrets Manager: Bedrock 関連設定
- SSM Parameter Store: model_id 等
- CloudWatch Log Group
- CloudWatch カスタムメトリクス (Lambda 内 EMF で自動収集、stack 側は不要)
- CloudWatch Alarm × 3 (p95 レイテンシ / Bedrock 失敗率 / テナント月次予算)
- SNS topic: `vitanota-prod-ai-chat-alerts`

**スタック間依存**:
- AiChatStack → DataSharedStack (Secrets Manager の cross-stack 参照は SSM Parameter Store 経由で疎結合化)
- AiChatStack ← 何も依存しない (他スタックから AiChatStack のリソースを参照する側はなし)
- 既存スタックは AiChatStack を知らない (リスク対称性、AiChatStack destroy で既存無影響)

### スタックファイル配置
- `infra/lib/ai-chat-stack.ts` (新規)
- `infra/bin/vitanota.ts` (既存) に AiChatStack 追加

## AWS リソース詳細

### 1. Lambda Function (chat-extraction)

| 項目 | 値 |
|---|---|
| Logical ID | `ChatExtractionFunction` |
| Physical name | `vitanota-prod-chat-extraction` |
| Runtime | `nodejs22.x` |
| Architecture | `arm64` |
| Memory | 512 MB |
| Timeout | 10 秒 (NFR-U05-REL-04) |
| Reserved concurrent executions | 100 (NFR-U05-PER-03) |
| Code | `infra/lib/lambdas/chat-extraction/` (esbuild bundle) |
| Handler | `dist/handler.handler` |
| Environment variables | `BEDROCK_MODEL_ID`, `BEDROCK_REGION` (= ap-northeast-1), `LOG_LEVEL` |
| Layers | なし (SDK は bundle に含める) |
| VPC | なし (Bedrock は VPC 外 service、Lambda は public subnet 等不要) |
| Dead Letter Queue | なし (sync invoke、失敗は API ルートで処理) |
| X-Ray Tracing | active (将来の調査用、コスト微小) |

### 2. IAM Execution Role (Lambda 用)

| 項目 | 値 |
|---|---|
| Logical ID | `ChatExtractionRole` |
| Trust Policy | `lambda.amazonaws.com` |
| Managed Policy | `AWSLambdaBasicExecutionRole` (CloudWatch Logs 書込) |
| Inline Policy | 下記参照 |

**Inline Policy (最小権限)**:
```json
{
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-haiku-4-5"
    },
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:ap-northeast-1:107094297297:secret:vitanota/ai-chat/*"
    },
    {
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:ap-northeast-1:107094297297:parameter/vitanota/ai-chat/*"
    },
    {
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*",
      "Condition": {
        "StringEquals": { "cloudwatch:namespace": "vitanota/ai-chat" }
      }
    }
  ]
}
```

**設計のポイント**:
- Bedrock model ARN を specific に指定 (model 切替時は IAM 更新も必要、安全策)
- Secrets / SSM は `vitanota/ai-chat/*` のみ
- CloudWatch metrics は namespace 制限
- 他 AWS リソース (S3 / DynamoDB / 他 Lambda invoke 等) は権限ゼロ

### 3. Secrets Manager

**Secret name**: `vitanota/ai-chat/bedrock-config`
**内容**: 将来の Bedrock 関連認証情報用 (現状 Bedrock は IAM ベース、Secrets は予備)
**回転**: なし (現状不要)

### 4. SSM Parameter Store

| Parameter name | Value | 用途 |
|---|---|---|
| `/vitanota/ai-chat/bedrock-model-id` | `anthropic.claude-haiku-4-5` | Lambda env 経由参照、model 切替時に変更 |
| `/vitanota/ai-chat/rate-limit-per-day` | `50` | 暫定値、運用観測で調整 (将来) |
| `/vitanota/ai-chat/prompt-version` | `v1` | プロンプトバージョン管理、A/B テスト時に切替 |

**用途**: 環境設定の動的変更を Lambda 再デプロイなしで反映 (Lambda 起動時取得、cache 数分単位)

### 5. CloudWatch Log Group

| 項目 | 値 |
|---|---|
| Logical ID | `ChatExtractionLogGroup` |
| Log group name | `/aws/lambda/vitanota-prod-chat-extraction` |
| Retention | 30 日 (既存 vitanota Lambda と整合) |
| KMS encryption | なし (現状不要、将来検討) |

### 6. CloudWatch Custom Metrics

Lambda 内で EMF (Embedded Metric Format) で自動収集、stack 側は dashboard 等を別途定義しない (現状)。

| Metric Name | Namespace | Dimensions | Unit |
|---|---|---|---|
| `extraction_latency_ms` | `vitanota/ai-chat` | tenant_id, model | Milliseconds |
| `extraction_success` | `vitanota/ai-chat` | tenant_id | Count |
| `extraction_failed` | `vitanota/ai-chat` | tenant_id, error_type | Count |
| `candidate_approved` | `vitanota/ai-chat` | tenant_id, kind | Count |
| `candidate_rejected` | `vitanota/ai-chat` | tenant_id, kind | Count |
| `tenant_monthly_invokes` | `vitanota/ai-chat` | tenant_id | Count |

**重要**: dimension に `user_id` を入れない → 個人レベル指標は CloudWatch から取得不可、観測者原則 (NFR-U05-OBS-04) を実装層で保証

### 7. CloudWatch Alarms

| Alarm name | Metric | Threshold | Period | Evaluation periods | Action |
|---|---|---|---|---|---|
| `vitanota-prod-ai-chat-latency-high` | `extraction_latency_ms` (p95) | > 5000 ms | 1 分 | 5 | SNS topic |
| `vitanota-prod-ai-chat-failure-rate` | `extraction_failed / (extraction_success + extraction_failed)` | > 10% | 1 分 | 10 | SNS topic |
| `vitanota-prod-ai-chat-tenant-budget` | `tenant_monthly_invokes × 0.18 円` | > 20,000 円 | 1 日 | 1 | SNS topic |

### 8. SNS Topic

| 項目 | 値 |
|---|---|
| Logical ID | `AiChatAlertsTopic` |
| Physical name | `vitanota-prod-ai-chat-alerts` |
| Subscriptions | Email (運営 chimo): `kamitokusari.c@cozi73.com` |
| KMS encryption | なし (アラーム内容に PII なし) |

## 既存リソースへの変更

### RDS PostgreSQL (DataCoreStack、既存)
- **変更なし** (リソース自体は既存のまま)
- 新規 migration で:
  - 新規テーブル `api_rate_limits`
  - `tasks` に `source_chat_snippet TEXT NULL` 追加
  - `journal_entries` に `source_chat_snippet TEXT NULL` 追加
- **migration 適用フロー**: 既存 `db-migrator` Lambda 経由 (memory `reference_db_migrator_flow.md`)

### AppRunner (AppStack、既存)
- **環境変数追加**:
  - `ENABLE_AI_CHAT_EXTRACTION` (true/false、フィーチャーフラグ)
  - `AI_CHAT_LAMBDA_ARN` (Lambda invoke の宛先 ARN)
  - `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION` (Frontend ビルド時埋め込み用、true/false)
- **IAM 権限追加**:
  - `lambda:InvokeFunction` 権限 (chat-extraction Lambda 限定)
- **コード変更**: 既存 Next.js コードベースに新規 API ルート + 新規 components 追加

### CloudFront / Route53 (EdgeStack、既存)
- **変更なし**

## ネットワーク構成

### Lambda chat-extraction
- **VPC 配置**: VPC 外 (default)
- **理由**: Bedrock は public API service、DB アクセスなし、VPC 不要
- **Outbound**:
  - Bedrock (`bedrock-runtime.ap-northeast-1.amazonaws.com`、AWS 内部)
  - Secrets Manager / SSM (AWS 内部)
  - CloudWatch (AWS 内部)
- **Inbound**: なし (sync invoke のみ、API ルートから呼ばれる)

### AppRunner → Lambda
- **Invoke 経路**: AWS SDK (内部、HTTPS over AWS network)
- **VPC connector**: 既存 VPC connector を経由 (AppRunner は private subnet)
- **追加設定不要**: AppRunner からの outbound は既存 NAT instance 経由 (memory `project_auth_status_20260420`)

## データフロー (インフラ視点)

```
[Browser] ─HTTPS─→ [CloudFront] ─(cookie)─→ [AppRunner]
                                                  │
                            (POST /api/ai-chat/extract)
                                                  │
                          ┌──────────────────────┴─────────┐
                          │                                │
                  (rate limit check)              (Lambda invoke sync)
                          │                                │
                          ▼                                ▼
                ┌────────────────┐                ┌──────────────┐
                │ RDS PostgreSQL │                │ Lambda       │
                │ api_rate_limits│                │ chat-        │
                │ UPSERT         │                │ extraction   │
                └────────────────┘                └──────┬───────┘
                                                         │ Bedrock invoke
                                                         ▼
                                                ┌────────────────┐
                                                │ AWS Bedrock    │
                                                │ Claude Haiku   │
                                                └────────────────┘
                                                         │ response
                                                         ▼
                                                  Lambda (Zod 検証)
                                                         │
                                                         ▼
                                                  AppRunner レスポンス
                                                         │
                                                         ▼
                                                  CloudFront → Browser
                                                  (候補表示)
```

### 承認時のデータフロー
```
教員「承認」タップ
        ↓
[Browser] ─HTTPS─→ [CloudFront] → [AppRunner]
                                       │
                                       │ (POST /api/tasks or /api/journal/entries)
                                       │ (kind 別、既存 API、body に source_chat_snippet 含む)
                                       ▼
                                  既存 RLS context 設定
                                       │
                                       ▼
                                  RDS INSERT (tasks or journal_entries)
                                       │
                                       ▼
                                  レスポンス → Browser
```

## コスト見積もり (インフラ単独)

| リソース | 月額 (現状規模) | 月額 (将来 100 校規模) |
|---|---|---|
| Lambda chat-extraction (invoke + duration) | ~¥300/校 | ~¥30,000 |
| Bedrock Claude Haiku 4.5 (invoke) | ~¥2,000-7,000/校 | ~¥200,000-700,000 |
| CloudWatch Logs (30 日 retention) | ~¥100/校 | ~¥10,000 |
| CloudWatch Metrics + Alarms | ~¥50/校 | ~¥5,000 |
| SNS topic + email subscription | ~¥0 | ~¥0 |
| Secrets Manager + SSM Parameter | ~¥50 (account 全体) | ~¥50 |
| RDS 追加分 (api_rate_limits + 2 カラム) | ¥0 (既存 RDS に追加) | ¥0 |
| **合計** | **¥2,500-7,500/校** | **¥245,000-745,000 (100 校)** |

実運用予想 (教員平均 10-20 回/日):
- 1 校あたり月額 **¥1,000〜3,000** が現実値

## 不採用 AWS リソース (記録)

| 不採用 | 理由 |
|---|---|
| ElastiCache Redis | Rate Limit は PostgreSQL で十分、新インフラ過剰 |
| DynamoDB | RDS 主体スタック、整合性低い |
| API Gateway | AppRunner で API 公開、追加不要 |
| SQS / EventBridge | 同期 API で十分、async は UX 摩擦 |
| Step Functions | Lambda 単独で完結、orchestration 不要 |
| X-Ray (デフォルト無効) | active モードで有効化、デフォルトの passive ではない (運用観察用) |
| Lambda Provisioned Concurrency | cold start 観測後判断 |
| Lambda Function URL | API ルート経由のみ、direct URL は不要 |
| AppConfig / LaunchDarkly (feature flag SaaS) | env 変数で十分 |

## 参照
- NFR 設計: `aidlc-docs/construction/unit-05/nfr-design/`
- NFR 要件: `aidlc-docs/construction/unit-05/nfr-requirements/`
- 機能設計: `aidlc-docs/construction/unit-05/functional-design/`
- デプロイアーキテクチャ: `deployment-architecture.md` (同階層)
- 既存共有インフラ: `aidlc-docs/construction/shared-infrastructure.md`
- 既存 deployment-phases: `aidlc-docs/construction/deployment-phases.md`
- memory: `project_domain_and_infra.md` (既存 5 スタック構成)
- memory: `reference_db_migrator_flow.md` (本番 DB migration フロー)
