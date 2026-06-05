# Unit-05 (AI 連携) — 論理コンポーネント分解

> **対応 NFR 設計パターン**: [`nfr-design-patterns.md`](nfr-design-patterns.md) (同階層)
> **対応機能設計**: [`construction/unit-05/functional-design/`](../functional-design/)
> **作成日**: 2026-05-11
> **位置付け**: NFR を担う論理コンポーネント (NFR component) を Layer 別に整理、各 component の責任 / 依存 / NFR マッピング

## レイヤー全体図

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend Layer (Browser)                                     │
│   ├─ ChatBubbleFlagGate                                     │
│   ├─ ChatModalManager                                       │
│   ├─ CandidateApprovalFlow                                  │
│   └─ ConcurrentLimitController                              │
└─────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ API Gateway Layer (Next.js API routes, AppRunner)            │
│   ├─ EnvFlagMiddleware                                       │
│   ├─ AuthMiddleware (既存)                                   │
│   ├─ RateLimitMiddleware                                     │
│   └─ LambdaInvoker                                           │
└─────────────────────────────────────────────────────────────┘
                              │ Lambda invoke (sync)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Lambda Layer (chat-extraction Lambda, ai-chat-stack)         │
│   ├─ PIIMasker                                               │
│   ├─ BedrockInvoker (with retry)                             │
│   ├─ CandidateValidator (Zod)                                │
│   └─ MetricsEmitter (CloudWatch EMF)                         │
└─────────────────────────────────────────────────────────────┘
                              │ Bedrock invoke
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ External Service (AWS Bedrock, ap-northeast-1)               │
│   └─ Claude Haiku 4.5                                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Persistence Layer (PostgreSQL, data-core stack)              │
│   ├─ api_rate_limits (新規テーブル)                          │
│   ├─ tasks (既存拡張: + source_chat_snippet)                │
│   └─ journal_entries (既存拡張: + source_chat_snippet)      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Observability Layer (CloudWatch)                             │
│   ├─ Logs (構造化、本文除外)                                 │
│   ├─ Metrics (カスタム、個人指標非可視)                      │
│   └─ Alarms → SNS → 運営 chimo email                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend Layer

### 1.1 ChatBubbleFlagGate
- **責任**: env flag (`NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION`) を判定し、ChatBubble のマウント / アンマウントを制御
- **対応 NFR**: NFR-U05-AVL-02 (フラグ即応)
- **依存**: なし (純粋に環境変数読み取り)
- **実装位置**: `src/features/ai-chat/hooks/useChatBubbleFlag.ts`

### 1.2 ChatModalManager
- **責任**: ChatModal のライフサイクル管理、useChatExtraction hook で session state 統括
- **対応 NFR**: NFR-U05-PER-02 (起動 < 200ms)、NFR-U05-MNT-02 (プロンプト分離は Lambda 側だが、Frontend 側は session state 分離)
- **依存**: useChatExtraction / useChatBubbleFlag
- **実装位置**: `src/features/ai-chat/components/ChatModal.tsx`

### 1.3 CandidateApprovalFlow
- **責任**: 候補承認時の kind 別フロー (task 即 INSERT / diary は DiaryApproveDialog 経由)
- **対応 NFR**: NFR-U05-PER-02 (UX 即時性)
- **依存**: useChatExtraction、既存 `/api/tasks` / `/api/journal/entries` API
- **実装位置**: `src/features/ai-chat/components/CandidateInlineBubble.tsx` + `DiaryApproveDialog.tsx`

### 1.4 ConcurrentLimitController
- **責任**: 教員あたり同時並行抽出 3 件制限、4 件目以降は queue
- **対応 NFR**: NFR-U05-PER-03 (並列 3)
- **依存**: useChatExtraction hook 内の state
- **実装位置**: `src/features/ai-chat/hooks/useChatExtraction.ts` 内

---

## API Gateway Layer (Next.js API routes)

### 2.1 EnvFlagMiddleware
- **責任**: API ルート冒頭で `ENABLE_AI_CHAT_EXTRACTION` 判定、OFF なら 404 FEATURE_NOT_ENABLED
- **対応 NFR**: NFR-U05-AVL-02 / NFR-U05-SEC-07 (security defense layer 1)
- **依存**: 環境変数
- **実装位置**: `pages/api/ai-chat/extract.ts` 先頭

### 2.2 AuthMiddleware (既存)
- **責任**: NextAuth セッション検証、teacher / school_admin / system_admin のみ通過
- **対応 NFR**: NFR-U05-SEC-07 (defense layer 2)
- **依存**: 既存 `withAuthApi` パターン (Unit-01 由来)
- **実装位置**: 既存 middleware 流用

### 2.3 RateLimitMiddleware
- **責任**: PostgreSQL `api_rate_limits` UPSERT、count > 50 で 429 RATE_LIMIT_EXCEEDED
- **対応 NFR**: NFR-U05-COST-01 (defense layer 3)、NFR-U05-COST-04 (Pre-Bedrock check で コスト発生ゼロ)
- **依存**: PostgreSQL (data-core stack)
- **実装位置**: `src/lib/rateLimit.ts` (新規)、API ルート内で呼出

### 2.4 LambdaInvoker
- **責任**: chat-extraction Lambda を sync invoke、結果を API レスポンスとして返す
- **対応 NFR**: NFR-U05-REL-04 (timeout 10 秒で AppRunner 側もタイムアウト)
- **依存**: AWS SDK v3 (`@aws-sdk/client-lambda`)
- **実装位置**: API ルート内、AWS Lambda client で `invoke({ FunctionName, InvocationType: 'RequestResponse' })`

---

## Lambda Layer (chat-extraction)

### 3.1 PIIMasker
- **責任**: メッセージ本文の PII (email / 電話番号) を正規表現で簡易マスキング
- **対応 NFR**: NFR-U05-SEC-02 (defense layer 4)、NFR-U05-MNT-01 (テスト対象重点)
- **依存**: なし (純関数、正規表現のみ)
- **実装位置**: `infra/lib/lambdas/chat-extraction/src/services/piiMasker.ts`
- **テスト**: 正規表現パターンの境界値テスト 必須

### 3.2 BedrockInvoker (with retry)
- **責任**: マスク済みメッセージ + システムプロンプト で Bedrock invoke、失敗時 1 回 retry
- **対応 NFR**: NFR-U05-REL-01 / NFR-U05-REL-04 / NFR-U05-PER-01
- **依存**: `@aws-sdk/client-bedrock-runtime`、prompts/extraction.ts (テンプレート分離)
- **実装位置**: `infra/lib/lambdas/chat-extraction/src/services/bedrockInvoker.ts`
- **疑似コード**:
  ```typescript
  async function invokeBedrock(message: string): Promise<unknown> {
    const prompt = renderPrompt(message);
    try {
      return await bedrockClient.send(new InvokeModelCommand({ ... }));
    } catch (e) {
      if (isRetriable(e)) {
        return await bedrockClient.send(new InvokeModelCommand({ ... }));
      }
      throw e;
    }
  }
  ```

### 3.3 CandidateValidator (Zod)
- **責任**: Bedrock 出力の構造化検証、Zod discriminatedUnion で 2 分類検証、空配列禁止
- **対応 NFR**: NFR-U05-SEC-06 (defense layer 5)、NFR-U05-MNT-03 (Zod 共通化)
- **依存**: 共通 schema `src/schemas/aiChat.ts` (Frontend / Lambda 共有)
- **実装位置**: `infra/lib/lambdas/chat-extraction/src/services/candidateValidator.ts`
- **重要**: Zod schema の `strict()` モードで余計なフィールド (mood 等) は捨てる、AI からの不正注入を遮断

### 3.4 MetricsEmitter (CloudWatch EMF)
- **責任**: 構造化ログに Embedded Metric Format (EMF) でメトリクスを埋め込み、CloudWatch が自動収集
- **対応 NFR**: NFR-U05-OBS-01〜04
- **依存**: console.log (Lambda 標準出力)
- **実装位置**: `infra/lib/lambdas/chat-extraction/src/services/metricsEmitter.ts`
- **疑似コード**:
  ```typescript
  function emitExtractionMetric(tenantId: string, userId: string, latencyMs: number) {
    console.log(JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [{
          Namespace: 'vitanota/ai-chat',
          Dimensions: [['tenantId']],  // user_id は dimension に入れない (個人指標非可視)
          Metrics: [{ Name: 'extraction_latency_ms', Unit: 'Milliseconds' }],
        }],
      },
      tenantId,
      userId,  // ログには残す (運営参照可) が、メトリクス dimension には入れない
      extraction_latency_ms: latencyMs,
      event: 'ai_chat.extracted',
    }));
  }
  ```

---

## Persistence Layer

### 4.1 `api_rate_limits` (新規テーブル)
- **責任**: 教員ごと日次の API 呼出カウンタ
- **対応 NFR**: NFR-U05-COST-01
- **schema**: (user_id UUID, endpoint TEXT, date DATE, count INTEGER, PK: user_id+endpoint+date)
- **migration**: `migrations/00YY_api_rate_limits.sql` (新規)
- **RLS**: 本人のみ自分の行を SELECT 可、system_admin は全件 (将来運営判断材料用)

### 4.2 `tasks` (既存拡張)
- **責任**: 既存タスクテーブル、AI 抽出経由で source_chat_snippet 付き INSERT
- **対応 NFR**: NFR-U05-SEC-05 (既存 RLS で保護)
- **新カラム**: `source_chat_snippet TEXT NULL` (max 500)
- **migration**: `migrations/00XX_chat_extraction_source_columns.sql`

### 4.3 `journal_entries` (既存拡張)
- **責任**: 既存日誌テーブル、AI 抽出経由で kind='diary' + source_chat_snippet + mood で INSERT
- **対応 NFR**: NFR-U05-SEC-05
- **新カラム**: `source_chat_snippet TEXT NULL` (max 500)
- **migration**: 上記同じ

---

## Observability Layer

### 5.1 CloudWatch Logs
- **責任**: Lambda + AppRunner からの構造化ログ集約
- **対応 NFR**: NFR-U05-OBS-01 / NFR-U05-OBS-02
- **設定**: log group `/aws/lambda/vitanota-prod-chat-extraction`、保持 30 日
- **重要**: 本文・候補 content 含めない、user_id / tenant_id / model / latency_ms / event のみ

### 5.2 CloudWatch Metrics (Custom)
- **責任**: Lambda 内 EMF 経由でメトリクス自動収集
- **対応 NFR**: NFR-U05-OBS-03 / NFR-U05-OBS-04
- **メトリクス名**: `vitanota/ai-chat/` namespace 配下、メトリクス名は NFR 要件参照
- **重要**: dimension 設計で個人レベルブレイクダウンを管理者に見せない

### 5.3 CloudWatch Alarms
- **責任**: しきい値ベースアラーム → SNS topic → 運営 chimo email
- **対応 NFR**: NFR-U05-OBS-05
- **アラーム定義**: nfr-requirements.md NFR-U05-OBS-05 参照
- **通知**: SNS topic `vitanota-prod-ai-chat-alerts` (新規)

---

## 依存関係マトリックス

| Component | 依存先 | 提供 NFR |
|---|---|---|
| ChatBubbleFlagGate | 環境変数 | NFR-U05-AVL-02 |
| ChatModalManager | useChatExtraction | NFR-U05-PER-02 |
| CandidateApprovalFlow | useChatExtraction, 既存 API | NFR-U05-PER-02 |
| ConcurrentLimitController | useChatExtraction state | NFR-U05-PER-03 |
| EnvFlagMiddleware | 環境変数 | NFR-U05-AVL-02 / NFR-U05-SEC-07 |
| AuthMiddleware | NextAuth (既存) | NFR-U05-SEC-07 |
| RateLimitMiddleware | PostgreSQL | NFR-U05-COST-01 |
| LambdaInvoker | AWS SDK | NFR-U05-REL-04 |
| PIIMasker | (純関数) | NFR-U05-SEC-02 |
| BedrockInvoker | Bedrock SDK, prompts/* | NFR-U05-REL-01 / NFR-U05-PER-01 |
| CandidateValidator | Zod, 共通 schema | NFR-U05-SEC-06 / NFR-U05-MNT-03 |
| MetricsEmitter | console.log (EMF) | NFR-U05-OBS-01〜04 |
| api_rate_limits | PostgreSQL (data-core) | NFR-U05-COST-01 |
| tasks (拡張) | PostgreSQL (既存) | NFR-U05-SEC-05 |
| journal_entries (拡張) | PostgreSQL (既存) | NFR-U05-SEC-05 |
| CloudWatch Logs | Lambda + AppRunner | NFR-U05-OBS-01〜02 |
| CloudWatch Metrics | Lambda EMF | NFR-U05-OBS-03〜04 |
| CloudWatch Alarms | CloudWatch + SNS | NFR-U05-OBS-05 |

## 不採用 component (記録)

| 不採用 component | 理由 |
|---|---|
| ElastiCache Redis (rate limit) | PostgreSQL で十分、新インフラ過剰 |
| SQS / EventBridge (async job queue) | 同期 API で十分 |
| DynamoDB (一過性 state 保持) | 揮発 state は Frontend memory で完結 |
| LaunchDarkly / Split.io 等 (feature flag SaaS) | 環境変数で十分 |
| Provisioned Concurrency (Lambda) | cold start 観測後判断 |
| Circuit Breaker library (resilience4j 等) | vitanota 規模で過剰 |
| Distributed Tracing (X-Ray) | 現状は不要、将来検討 |

## 参照
- NFR 設計パターン: `nfr-design-patterns.md` (同階層)
- NFR 要件: `aidlc-docs/construction/unit-05/nfr-requirements/`
- 機能設計: `aidlc-docs/construction/unit-05/functional-design/`
- アプリケーション設計: `aidlc-docs/inception/application-design/2026-05-11-ai-chat-extraction-design.md`
