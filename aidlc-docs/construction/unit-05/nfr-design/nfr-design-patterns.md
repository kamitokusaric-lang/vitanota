# Unit-05 (AI 連携) — NFR 設計パターン

> **対応 NFR 要件**: [`construction/unit-05/nfr-requirements/`](../nfr-requirements/)
> **対応機能設計**: [`construction/unit-05/functional-design/`](../functional-design/)
> **作成日**: 2026-05-11
> **位置付け**: NFR 要件で決めた "What" を実装レベルで "How" に落とし込むパターン集

## パターン分類

| 分類 | パターン数 |
|---|---|
| 信頼性 (Resilience) | 4 |
| パフォーマンス (Performance) | 3 |
| スケーラビリティ (Scalability) | 2 |
| セキュリティ (Defense in Depth) | 6 層 |
| コスト管理 (Cost Control) | 3 |
| 観測性 (Observability) | 3 |

---

## 1. 信頼性パターン

### 1.1 Bedrock Retry (Single Auto Retry)
- **対応 NFR**: NFR-U05-REL-01
- **パターン**: 1 回限りの自動 retry、failback で 503
- **実装位置**: Lambda 内 BedrockInvoker
- **疑似コード**:
  ```typescript
  async function invokeBedrockWithRetry(prompt: string) {
    try {
      return await bedrock.invokeModel({ ... });
    } catch (e) {
      if (isRetriable(e)) {
        return await bedrock.invokeModel({ ... }); // 1 回だけ retry
      }
      throw e;
    }
  }
  ```
- **不採用パターン**: Exponential backoff (過剰、Bedrock 障害時は早く失敗させてユーザーに再試行委ねる方が UX 良い)

### 1.2 Manual Retry UI Pattern
- **対応 NFR**: NFR-U05-REL-02
- **パターン**: 失敗メッセージに「再試行」ボタン、教員主導で retry
- **実装位置**: Frontend `<MessageBubble>` の extractionStatus='failed' バリアント
- **状態遷移**: `failed` → ユーザータップ → `loading` → `success` / `failed` のループ

### 1.3 Fallback to Existing UX
- **対応 NFR**: NFR-U05-REL-03 / NFR-U05-AVL-01
- **パターン**: AI 機能障害時、既存 TaskBulkCreateForm / 日誌画面が無影響で稼働継続
- **実装根拠**: AI 機能は既存 UX への上乗せ、既存 component / API は touched でない
- **検証**: フィーチャーフラグ OFF テスト で既存 UX 無影響確認

### 1.4 Lambda Timeout Pattern
- **対応 NFR**: NFR-U05-REL-04
- **設定値**: 10 秒 (Bedrock 4 秒 × 2 回 + overhead 2 秒)
- **設定位置**: CDK ai-chat-stack の Lambda 定義
- **不採用**: Circuit Breaker (vitanota 規模では過剰、Bedrock 障害は SNS アラームで運営が判断)

---

## 2. パフォーマンスパターン

### 2.1 Optimistic UI Update
- **対応 NFR**: NFR-U05-PER-02 (起動 < 200ms)
- **パターン**: メッセージ送信を即時 UI 表示 (`extractionStatus='loading'`)、抽出結果は後追い
- **実装位置**: `useChatExtraction.sendMessage()`
- **疑似コード**:
  ```typescript
  async function sendMessage(text: string) {
    const message = { id: uuid(), text, sender: 'user', status: 'loading' };
    setMessages(prev => [...prev, message]);  // 即時表示
    try {
      const candidates = await api.extract(text);
      setCandidates(prev => [...prev, ...candidates]);
      updateMessageStatus(message.id, 'success');
    } catch (e) {
      updateMessageStatus(message.id, 'failed');
    }
  }
  ```

### 2.2 HTTP Keep-Alive (Bedrock SDK Default)
- **対応 NFR**: NFR-U05-PER-01 (p95 < 3 秒)
- **パターン**: Bedrock SDK の HTTP connection 再利用 (デフォルト動作)
- **実装**: SDK 標準、追加実装なし
- **効果**: Cold start 後の連続呼出で connection establish のオーバーヘッド削減

### 2.3 No Provisioned Concurrency (Watch and Wait)
- **対応 NFR**: NFR-U05-PER-01
- **パターン**: Provisioned concurrency なしで運用、cold start 影響を CloudWatch メトリクスで観測
- **判断基準**: p95 が 5 秒超を連続観測 → Provisioned 1 (low cost) を追加検討
- **理由**: vitanota 規模では cold start 影響は許容範囲想定、過剰投資回避

---

## 3. スケーラビリティパターン

### 3.1 Frontend Concurrent Limit
- **対応 NFR**: NFR-U05-PER-03 (教員あたり並列 3)
- **パターン**: useChatExtraction 内で並列度制御、4 件目以降は queue
- **実装位置**: Frontend hook
- **疑似コード**:
  ```typescript
  const MAX_CONCURRENT = 3;
  const queue: Message[] = [];
  let inFlight = 0;

  async function sendMessage(text: string) {
    if (inFlight >= MAX_CONCURRENT) {
      queue.push(message);
      return;
    }
    inFlight++;
    try { await api.extract(text); }
    finally {
      inFlight--;
      if (queue.length > 0) processQueue();
    }
  }
  ```

### 3.2 Lambda Reserved Concurrency
- **対応 NFR**: NFR-U05-PER-03
- **設定**: Reserved concurrency 100 (CDK 設定)
- **理由**: 教員 25 名 × 並列 3 = 75 並列、100 で余裕。AppRunner / Lambda アカウント全体への影響を限定

---

## 4. セキュリティパターン (Defense in Depth)

6 層の多層防御:

```
Request → [L1] → [L2] → [L3] → [L4] → [L5] → [L6] → Response
          フラグ  認証  Rate   PII    Zod    RLS
                       Limit  マスク 検証    (DB)
```

### 4.1 Layer 1: Feature Flag Gate
- **対応 NFR**: NFR-U05-AVL-02
- **実装**: API ルート冒頭で `ENABLE_AI_CHAT_EXTRACTION` 判定、OFF なら 404
- **位置**: `pages/api/ai-chat/extract.ts` 先頭

### 4.2 Layer 2: Authentication & Authorization Middleware
- **対応 NFR**: NFR-U05-SEC-07
- **実装**: 既存 `withAuthApi` middleware、teacher / school_admin / system_admin のみ通過
- **位置**: Next.js API route middleware

### 4.3 Layer 3: Rate Limit Guard
- **対応 NFR**: NFR-U05-COST-01
- **実装**: PostgreSQL `api_rate_limits` UPSERT、count > 50 で 429
- **位置**: API ルート、認証後 / Lambda invoke 前
- **重要**: rate limit check は **Bedrock invoke の前**、超過時はコスト発生ゼロ

### 4.4 Layer 4: PII Masking
- **対応 NFR**: NFR-U05-SEC-02
- **実装**: Lambda 内 piiMasker、正規表現で email / 電話番号を `[email]` / `[phone]` に置換
- **対象パターン**:
  - email: `\S+@\S+\.\S+`
  - 電話番号: `0\d{1,4}-\d{1,4}-\d{4}` / `0\d{9,10}` 等
- **対象外**: 児童名・教員名 (固有名詞、完全マスクは過剰、AI 文脈理解で必要)

### 4.5 Layer 5: Output Validation (Zod)
- **対応 NFR**: NFR-U05-SEC-06 / NFR-U05-MNT-03
- **実装**: candidateValidator、Zod discriminatedUnion で 2 分類 + 空配列禁止 + mood フィールド不在
- **重要**: 構造的に mood フィールドが schema に存在しないので、AI が誤って mood を返しても弾く

### 4.6 Layer 6: Database RLS
- **対応 NFR**: NFR-U05-SEC-05
- **実装**: 既存 RLS ポリシー、`source_chat_snippet` カラムも自動保護下
- **追加ポリシーは不要**: 既存 tasks / journal_entries の RLS で本人 (assignees / journal author) のみアクセス可

---

## 5. コスト管理パターン

### 5.1 Pre-Bedrock Rate Limit Check
- **対応 NFR**: NFR-U05-COST-01
- **パターン**: rate limit check を **Bedrock invoke の前** に置く、超過時は Bedrock 呼ばない (コスト発生ゼロ)
- **実装位置**: API ルート (Lambda invoke 前)

### 5.2 Prompt Token Budget
- **対応 NFR**: NFR-U05-COST-02
- **パターン**: プロンプトテンプレートで input/output token に上限制約
- **input**: メッセージ本文 max 2000 字 (= ~600 tokens 想定) + システムプロンプト ~100 tokens
- **output**: max_tokens パラメータで output token を 500 tokens 程度に制約
- **理由**: 1 リクエストあたりのコスト上限を予測可能に

### 5.3 Tenant Budget Monitoring
- **対応 NFR**: NFR-U05-COST-03
- **パターン**: CloudWatch メトリクス + アラーム、テナント月次合計 > 20,000 円相当でアラート
- **実装**: Lambda 内で `CloudWatch.putMetricData` 発行、tenant_id を dimension に含める

---

## 6. 観測性パターン (Observability)

### 6.1 Structured Logging (JSON)
- **対応 NFR**: NFR-U05-OBS-01 / NFR-U05-OBS-02
- **パターン**: ログを JSON 構造で出力、CloudWatch Logs Insights でクエリ可能
- **イベント**:
  - `ai_chat.extracted`: 抽出成功
  - `ai_chat.failed`: 抽出失敗
  - `ai_chat.approved`: 候補承認
  - `ai_chat.rejected`: 候補棄却
- **フィールド**: `tenant_id`, `user_id`, `endpoint`, `model`, `latency_ms`, `event` (本文・候補 content 除外)

### 6.2 Custom Metrics (CloudWatch)
- **対応 NFR**: NFR-U05-OBS-03 / NFR-U05-OBS-04
- **パターン**: CloudWatch Embedded Metric Format (EMF) でログ出力時にメトリクスも自動発行
- **メトリクス名**: NFR 要件 NFR-U05-OBS-03 参照
- **重要**: 個人レベル指標 (user_id 別承認率/棄却率) は管理者ダッシュボードにレンダリングしない (NFR-U05-OBS-04)

### 6.3 CloudWatch Alarms
- **対応 NFR**: NFR-U05-OBS-05
- **パターン**: しきい値ベースアラーム → SNS topic → 運営 chimo email
- **アラーム**:
  - p95 レイテンシ > 5 秒 (5 分連続)
  - Bedrock 失敗率 > 10% (10 分連続)
  - テナント月次予算 > 20,000 円相当

---

## 7. パターン採用しない選択肢 (記録)

| 不採用パターン | 理由 |
|---|---|
| Circuit Breaker | vitanota 規模では過剰、Bedrock 障害は手動判断で十分 |
| Exponential Backoff | 1 回 retry で十分、複雑性増 |
| Provisioned Concurrency | cold start 観測してから判断 |
| Async Job Queue (SQS 等) | 同期 API で十分 (p95 < 3 秒で対応可)、Async は UX 摩擦 |
| Caching (DynamoDB / Redis) | チャットメッセージは一過性、cache 対象なし |
| 多重 retry (3 回以上) | 雪崩リスク、運営判断のシグナル化を優先 |

---

## 8. パターン適用マトリックス

| NFR 要件 | 適用パターン |
|---|---|
| NFR-U05-PER-01 (p95 < 3秒) | 2.1 Optimistic UI + 2.2 Keep-Alive + 2.3 Watch and Wait |
| NFR-U05-PER-02 (起動 < 200ms) | 2.1 Optimistic UI |
| NFR-U05-PER-03 (並列 3) | 3.1 Frontend Concurrent Limit + 3.2 Lambda Reserved |
| NFR-U05-COST-01 (50 回/日) | 4.3 Layer 3 (Rate Limit) + 5.1 Pre-Bedrock Check |
| NFR-U05-COST-02 (月額予算) | 5.2 Token Budget |
| NFR-U05-COST-03 (テナント観測) | 5.3 Tenant Budget Monitoring |
| NFR-U05-SEC-01 (Bedrock 東京) | CDK 設定 (パターンというより設定) |
| NFR-U05-SEC-02 (PII マスク) | 4.4 Layer 4 |
| NFR-U05-SEC-05 (RLS) | 4.6 Layer 6 |
| NFR-U05-SEC-06 (IAM 最小権限) | CDK 設定 |
| NFR-U05-SEC-07 (認証認可) | 4.2 Layer 2 |
| NFR-U05-REL-01 (Bedrock retry) | 1.1 Single Auto Retry |
| NFR-U05-REL-02 (手動 retry) | 1.2 Manual Retry UI |
| NFR-U05-REL-03 (既存 UX 稼働) | 1.3 Fallback to Existing UX |
| NFR-U05-REL-04 (timeout 10秒) | 1.4 Lambda Timeout |
| NFR-U05-OBS-01〜02 (構造化ログ) | 6.1 Structured Logging |
| NFR-U05-OBS-03〜04 (メトリクス + 個人指標非可視) | 6.2 Custom Metrics |
| NFR-U05-OBS-05 (アラーム) | 6.3 CloudWatch Alarms |
| NFR-U05-AVL-01 (独立性) | 1.3 Fallback + 4.1 Feature Flag |
| NFR-U05-AVL-02 (フラグ即応) | 4.1 Feature Flag |
| NFR-U05-MNT-01 (テスト 80%) | 試験フレームワーク (tech-stack-decisions.md) |
| NFR-U05-MNT-02 (プロンプト分離) | 実装方針 (機能設計の `prompts/extraction.ts`) |
| NFR-U05-MNT-03 (Zod 共通化) | 4.5 Layer 5 (共通 schema) |

## 参照
- NFR 要件: `aidlc-docs/construction/unit-05/nfr-requirements/nfr-requirements.md`
- 論理コンポーネント: `logical-components.md` (同階層)
- 機能設計: `aidlc-docs/construction/unit-05/functional-design/`
- 既存 Unit-02 nfr-design パターン参考: `aidlc-docs/construction/unit-02/nfr-design/nfr-design-patterns.md`
