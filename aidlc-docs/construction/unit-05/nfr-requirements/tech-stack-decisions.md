# Unit-05 (AI 連携) — テックスタック決定

> **対応要件**: [`inception/requirements/2026-05-11-ai-chat-extraction.md`](../../../inception/requirements/2026-05-11-ai-chat-extraction.md)
> **対応 NFR**: [`nfr-requirements.md`](nfr-requirements.md) (同階層)
> **作成日**: 2026-05-11

## 設計方針

- **既存 vitanota スタック (Next.js + AppRunner + RDS + CloudFront) との整合**
- **新規追加は AI 連携固有のものに限定** (Bedrock + 新 Lambda + 新 DB テーブル + 環境変数フラグ)
- **可逆性確保**: 各技術選択は将来の切替コストが許容範囲内 (Bedrock → 他、Node.js → 他 等)

## 1. AWS Bedrock (AI モデルアクセス)

### 採用根拠
- **決定**: AWS Bedrock 採用 (chimo 確定 2026-05-11)
- **理由**:
  - vitanota は既に AWS スタック、一貫したデータ取扱規約・コンプライアンス
  - 「データは AWS 東京リージョン内に留まる」を学校・自治体向け広報に活用可
  - 既存 IAM / Secrets Manager / CloudWatch 統合がそのまま使える
- **代替検討**: Anthropic API 直接 (最新モデル + prompt caching 最安) は学校・自治体向け説明負担と DPA 必要、現時点では Bedrock 優先
- **将来の切替**: Bedrock → Anthropic API 直接への切替は Lambda 内 invoke 部分の差し替えで対応可 (model_id + API client の置換、~1 日)

### モデル
- **決定**: Claude Haiku 4.5
- **想定 model ID**: `anthropic.claude-haiku-4-5` (正式 ID は実装段階で Bedrock console で確認)
- **理由**: 2 分類抽出はシンプル分類タスク、Haiku で十分対応可、コスト 1/4
- **切替可能性**: Sonnet 4.6 へは Lambda env の `BEDROCK_MODEL_ID` を変更で対応 (デプロイ含めて ~30 分)

### リージョン
- **決定**: ap-northeast-1 (東京)
- **理由**: vitanota 既存 AWS リソースと同リージョン、データレジデンシー要件

## 2. Lambda (AI 抽出 orchestration)

### 採用根拠
- **決定**: AWS Lambda 採用 (新規 chat-extraction Lambda、ai-chat-stack 内)
- **理由**:
  - Bedrock 呼出 orchestration はステートレス、Lambda が最適
  - AppRunner 本体に統合せず、Lambda として独立させることでリソース分離 (memory: NFR-U05-AVL-01)
  - 既存 vitanota Lambda パターン (db-migrator / SnapshotManager) と整合
- **代替検討**: AppRunner 内に統合 (Next.js API routes 直接 Bedrock 呼出) は Lambda の AVL 独立性が失われる、選択しない

### Runtime
- **決定**: Node.js 22.x
- **理由**:
  - vitanota 既存 Lambda (db-migrator / SnapshotManager) と同 runtime
  - TypeScript ベース、既存ビルドツール (esbuild) で同じパターン
  - AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`) が公式対応

### Memory
- **決定**: 512 MB
- **理由**:
  - Bedrock SDK + プロンプト処理 + Zod 検証 = 軽量
  - 256 MB だと cold start でやや遅い (200ms オーバー懸念)、512 MB が安全圏
- **将来調整**: CloudWatch メトリクス (Memory Used) を見て、過剰なら 256 MB に下げ可

### Timeout
- **決定**: 10 秒 (NFR-U05-REL-04)
- **理由**: Bedrock 4 秒 × retry 2 回 + overhead 2 秒 = 10 秒

### Architecture
- **決定**: arm64 (Graviton2)
- **理由**: 既存 vitanota Lambda と整合、x86_64 と比べて ~20% コスト削減

### Concurrent executions
- **決定**: 予約同時実行数 100 (provisioned concurrency なし)
- **理由**:
  - 教員 25 名 × 同時並行 3 = 75 並列、100 で余裕
  - Provisioned concurrency は cold start 影響大きい場合のみ追加

## 3. PostgreSQL (Rate Limit テーブル)

### 採用根拠
- **決定**: 既存 RDS PostgreSQL (data-core stack) に新規テーブル `api_rate_limits` 追加
- **理由**:
  - 既存スタックで完結、新インフラ追加なし (memory: vitanota は AWS 最小スタック主義)
  - vitanota 規模 (1,300 ops/日) には DB 負荷ゼロに近い
  - 既存 RLS パターン流用可、運用シンプル
- **代替検討**: Redis (ElastiCache)、DynamoDB は新規インフラ追加で過剰

### テーブル設計 (機能設計と整合)
- **テーブル**: `api_rate_limits`
- **PRIMARY KEY**: (user_id, endpoint, date)
- **アルゴリズム**: Fixed Window、Daily reset (JST)
- **migration**: 新規 `migrations/00YY_api_rate_limits.sql`

## 4. DB スキーマ拡張 (既存 tasks / journal_entries)

### 採用根拠
- **決定**: 既存 `tasks` / `journal_entries` に `source_chat_snippet TEXT NULL` カラム追加 (非破壊)
- **理由**:
  - 新規テーブル不要、既存スキーマと自然統合
  - NULL 許可で後方互換、既存クエリ・既存 RLS は無影響
- **migration**: 新規 `migrations/00XX_chat_extraction_source_columns.sql`

## 5. Frontend

### Framework
- **決定**: Next.js (Pages Router) — 既存 vitanota スタック
- **理由**: 既存スタックそのまま、新規導入なし

### Component ライブラリ
- **決定**: 既存パターン踏襲 (React + Tailwind CSS + 既存共通 component)
- **新規追加なし** (`<ChatBubble>` / `<ChatModal>` 等は既存スタックで実装可)

### 状態管理
- **決定**: React `useState` + custom hook (`useChatExtraction`)
- **理由**: セッション scoped、Redux 等のグローバル管理不要、React Context は使わず props lift up
- **代替検討**: React Query / SWR は API 統合に使う可能性 (機能設計時に確認)、ただし基本は useState

### Validation
- **決定**: Zod (既存スタック)
- **共有 schema**: `src/schemas/aiChat.ts` (Frontend / Lambda / 既存 API で共有、NFR-U05-MNT-03)

## 6. Bedrock SDK

### 採用根拠
- **決定**: `@aws-sdk/client-bedrock-runtime` v3 (Node.js 用)
- **理由**: AWS 公式、Bedrock 呼出の標準パターン
- **代替検討**: なし

## 7. AI モデル監視・観測

### CloudWatch Logs
- **決定**: CloudWatch Logs (Lambda + AppRunner)
- **既存パターン**: Unit-01〜04 と同じ、log retention 30 日

### CloudWatch Metrics
- **決定**: カスタムメトリクス (NFR-U05-OBS-03)
- **発行方法**: Lambda 内で `PutMetricData` API 直接呼出 (EMF: Embedded Metric Format) か `CloudWatch.putMetricData` 直接呼出 — 機能設計で確定

### CloudWatch Alarms
- **決定**: SNS topic ベース、通知先は運営 chimo email (NFR-U05-OBS-05)
- **既存パターン**: vitanota 既存アラームと同じ通知経路

## 8. フィーチャーフラグ

### 採用根拠
- **決定**: 環境変数ベース (chimo 確定 2026-05-11)
- **理由**: 最シンプル、追加インフラなし
- **変数名**:
  - Server: `ENABLE_AI_CHAT_EXTRACTION=true/false` (AppRunner env)
  - Client: `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION=true/false` (Next.js build env)
- **設定変更フロー**: AppRunner サービス update → 自動再起動 (~3 分)

## 9. CDK (インフラコード)

### 採用根拠
- **決定**: AWS CDK (TypeScript) — 既存 vitanota スタック
- **新 stack**: `ai-chat-stack` (Unit-05 専用、6 つ目の stack として追加)
- **既存 stack との依存**: SSM Parameter Store / Secrets Manager 経由で疎結合化 (CloudFormation export/import は使わない、stack 削除順序の柔軟性確保)

## 10. 試験フレームワーク

### Unit テスト
- **決定**: Jest (既存スタック)
- **カバレッジ目標**: chat-extraction Lambda コード 80% 以上 (NFR-U05-MNT-01)
- **Mock**: Bedrock client は `@aws-sdk/client-bedrock-runtime` のテスト用 mock

### Integration テスト
- **決定**: 既存パターン踏襲 (実 DB against、Bedrock は staging リージョンで実呼出 or mock)

### E2E テスト
- **決定**: Playwright (既存スタック)
- **Bedrock**: E2E では mock 推奨 (実 Bedrock against はコスト発生、ステージング環境で個別検証)

---

## 採用しない選択肢 (記録)

| 検討した代替 | 採用しなかった理由 |
|---|---|
| Anthropic API 直接 | 学校・自治体向け説明負担、DPA 必要、Bedrock 優先 |
| OpenAI / Google Gemini | vitanota は Anthropic 系 (既存 Unit-06 凍結含む) で統一、新ベンダー追加リスク |
| Redis (ElastiCache) for rate limit | 新規インフラ、vitanota 規模では過剰 |
| DynamoDB for rate limit | 新サービス、vitanota は RDS 主体スタック、整合性低い |
| API Gateway for rate limit | vitanota は AppRunner、API Gateway 使ってない |
| Provisioned concurrency for Lambda | cold start 影響が観測されてから検討 |
| LaunchDarkly 等の専用 feature flag SaaS | 環境変数で十分、追加 SaaS 過剰 |
| Sonnet 4.6 (MVP 時点) | Haiku 4.5 で十分、コスト 4 倍、不要 |

## 移行・切替経路 (将来のため)

- **Bedrock → Anthropic API 直接**: Lambda 内 `invoke` ロジックの置換 (~1 日)
- **Haiku → Sonnet**: Lambda env `BEDROCK_MODEL_ID` 変更 (~30 分)
- **PostgreSQL rate limit → Redis**: schema / 実装 / 移行スクリプトで 1〜2 日
- **環境変数フラグ → SaaS フラグ**: LaunchDarkly 等への移行は将来必要なら
- **ai-chat-stack 撤回**: `cdk destroy vitanota-prod-ai-chat` で AI 関連リソース一括削除、既存 vitanota は無影響 (リスク対称性)

## 参照
- NFR 要件: `nfr-requirements.md` (同階層)
- 機能設計: `aidlc-docs/construction/unit-05/functional-design/`
- アプリケーション設計: `aidlc-docs/inception/application-design/2026-05-11-ai-chat-extraction-design.md`
- 戦略 memory: `project_ai_strategy_20260511.md`
- インフラ memory: `project_domain_and_infra.md` (vitanota 既存 5 スタック構成)
