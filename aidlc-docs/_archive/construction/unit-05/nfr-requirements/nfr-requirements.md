# Unit-05 (AI 連携) — NFR 要件

> **対応要件**: [`inception/requirements/2026-05-11-ai-chat-extraction.md`](../../../inception/requirements/2026-05-11-ai-chat-extraction.md)
> **対応機能設計**: [`construction/unit-05/functional-design/`](../functional-design/)
> **作成日**: 2026-05-11
> **位置付け**: 要件文書 NFR-CE-01〜16 を Unit-05 単位で再整理 + 具体値確定 + Unit-05 固有の追加 NFR

## 設計方針

- 要件文書 NFR-CE-XX を NFR-U05-CAT-NN (CAT = カテゴリ略号) としてリラベル整理
- 具体値が暫定だった項目を **chimo 合意で確定**
- 既存 vitanota の NFR パターン (Unit-01〜04) と整合する命名・粒度
- Unit-05 固有の追加 NFR (Lambda 構成 / Bedrock 関連 / CloudWatch アラーム等) を追加

## NFR カテゴリ一覧

| カテゴリ | 略号 | 項目数 |
|---|---|---|
| パフォーマンス | PER | 3 |
| コスト | COST | 4 |
| セキュリティ・プライバシー | SEC | 7 |
| 信頼性 | REL | 4 |
| 観測性 | OBS | 5 |
| 可用性 | AVL | 2 |
| 維持容易性 | MNT | 3 |

---

## パフォーマンス (PER)

### NFR-U05-PER-01: AI 抽出レイテンシ
- **要件**: メッセージ送信から候補表示までの p95 < 3 秒
- **測定範囲**: API ルート受信 → Lambda invoke → Bedrock → candidateValidator → API レスポンス → Frontend 表示
- **観測**: CloudWatch カスタムメトリクス `ai_chat.extraction.latency_ms`
- **アラーム**: p95 が 5 秒超で運営 chimo に通知

### NFR-U05-PER-02: チャットモーダル起動
- **要件**: ChatBubble タップから ChatModal 完全表示まで < 200ms
- **理由**: 「思いついた瞬間タップ」の即時性確保
- **観測**: クライアント側 performance.mark (Frontend ローカル測定)

### NFR-U05-PER-03: 同時並行抽出
- **要件**: 教員あたり同時並行抽出 最大 3 並列
- **理由**: 連続送信時のスループット保証 + AppRunner / Lambda リソース保護
- **実装**: Frontend (useChatExtraction) 側で並列度制御、4 件目以降は queue

---

## コスト (COST)

### NFR-U05-COST-01: Rate Limit (確定値)
- **要件**: 教員 (user_id) あたり 1 日 50 回まで `/api/ai-chat/extract` 呼出可 (chimo 確定 2026-05-11)
- **アルゴリズム**: Fixed Window、JST 00:00 リセット
- **粒度**: 教員ごと only、テナント単位 rate limit は採用しない (現状規模では不要)
- **超過時**: 429 RATE_LIMIT_EXCEEDED、Bedrock は呼ばない (コスト発生ゼロ)

### NFR-U05-COST-02: 月額予算見積もり
- **想定**: 教員 25 名 + 校長 1 名 = 26 名 × 50 回/日 (最大ケース) = 1,300 回/日
- **1 リクエスト平均**: input 200 tokens + output 100 tokens
- **Bedrock Haiku 4.5 単価**: input ~$0.25/M tokens, output ~$1.25/M tokens
- **試算**: 1,300 回 × 0.18 円 ≒ 234 円/日/校 × 30 日 = **約 7,000 円/月/校** (最大ケース)
- **実運用予想**: 教員平均 10〜20 回/日と仮定して、月 **約 2,000〜3,000 円/校** が現実値

### NFR-U05-COST-03: テナント月次予算観測
- **要件**: テナント月次 Bedrock 呼出合計を CloudWatch メトリクスで観測
- **しきい値**: 月 20,000 円超で運営 chimo にアラート (運営判断のシグナル、自動 rate limit ではない)
- **目的**: 「学校契約モデル月固定料金」への将来移行に備えた運営判断材料

### NFR-U05-COST-04: モデル切替可能性
- **要件**: Bedrock モデル ID を環境変数 / Lambda env で外部設定、Sonnet 4.6 等への切替を 1 設定変更で可能
- **理由**: 抽出精度不足が観測された場合の対応経路確保

---

## セキュリティ・プライバシー (SEC)

### NFR-U05-SEC-01: Bedrock リージョン固定
- **要件**: AWS Bedrock ap-northeast-1 (東京リージョン) 固定、データは AWS 内で完結
- **理由**: 学校・自治体向け説明 (memory: `project_ai_strategy_20260511.md` の AWS Bedrock 採用根拠)

### NFR-U05-SEC-02: PII マスキング (送信前)
- **要件**: Bedrock 送信前に明らかな PII を簡易マスキング
- **対象**: email (`\S+@\S+\.\S+`)、電話番号 (`0\d{1,4}-\d{1,4}-\d{4}` 等)
- **対象外**: 児童名・教員名 (固有名詞、完全マスクは過剰、AI 文脈理解で必要)
- **実装**: 正規表現ベース、Lambda 内 piiMasker サービス
- **注意**: 完全ではない、教員向けプライバシーポリシーで補完説明

### NFR-U05-SEC-03: プライバシーポリシー更新
- **要件**: 教員向けプライバシーポリシーに以下を明示:
  - 「チャット入力内容は AWS Bedrock 経由で Claude モデル (Anthropic 提供) に送信されます」
  - 「送信先は AWS 東京リージョン内に留まります」
  - 「チャットメッセージ自体は DB に永続化されません、変換時に元メッセージの抜粋 (source_chat_snippet) だけが該当タスク/日誌レコードに紐づきます」
- **担当**: chimo (運営) が事前に文言確定、Phase 7 (フラグ ON) 前に school_admin に通知

### NFR-U05-SEC-04: チャット履歴非永続化
- **要件**: 教員が送信したチャットメッセージ本体は DB に保存しない (sessionStorage / メモリのみ)
- **理由**: 監視感の発生を防ぐ (memory `feedback_observed_moment_broken.md`)

### NFR-U05-SEC-05: source_chat_snippet の RLS 保護
- **要件**: 変換時の `source_chat_snippet` は既存タスク/日誌の RLS で本人 (assignees / journal author) のみアクセス可
- **実装**: 既存 RLS ポリシーに新カラム追加で自動カバー、追加ポリシー不要

### NFR-U05-SEC-06: Lambda IAM Policy 最小権限
- **要件**: chat-extraction Lambda の IAM Policy は最小権限
- **許可**: `bedrock:InvokeModel` (specific model ARN のみ)
- **不許可**: 他 AWS リソース (S3 / DynamoDB / 他 Lambda invoke 等) は権限なし
- **実装**: CDK ai-chat-stack で IAM Role 定義時に制約

### NFR-U05-SEC-07: API ルートの認証・認可
- **要件**: `/api/ai-chat/extract` は既存 middleware で teacher / school_admin / system_admin のみアクセス可
- **未認証アクセス**: 401 を返す
- **権限不足**: 403 を返す
- **実装**: 既存 `withAuthApi` パターンを流用、新規 middleware 不要

---

## 信頼性 (REL)

### NFR-U05-REL-01: Bedrock 自動 retry
- **要件**: Bedrock 呼出がタイムアウト / 5xx の場合、自動 1 回のみ retry
- **実装**: Lambda 内、第 2 回目失敗で API に 503 伝搬
- **理由**: 過剰 retry は雪崩リスク

### NFR-U05-REL-02: 手動 retry UI
- **要件**: 抽出失敗時、Frontend にエラーバブル + 「再試行」ボタン表示
- **挙動**: 教員タップで同じメッセージで sendMessage 再実行

### NFR-U05-REL-03: 既存 UX のフォールバック保証
- **要件**: Bedrock 障害時 / Lambda 障害時 / API 障害時のすべてのケースで、既存 TaskBulkCreateForm / 日誌画面 (`/journal/new`) は通常稼働継続
- **保証根拠**: AI チャット抽出は既存 UX への上乗せ、既存 API ・既存 component は一切触らない (リスク対称性)
- **検証**: フィーチャーフラグ OFF テストで既存稼働が無影響であることを確認

### NFR-U05-REL-04: Lambda timeout
- **要件**: chat-extraction Lambda の timeout は 10 秒
- **内訳**: Bedrock 4 秒 (1 回) × retry 2 回 + overhead 2 秒 = 10 秒
- **超過時**: AppRunner で 503 を返す、Frontend は手動 retry 可

---

## 観測性 (OBS)

### NFR-U05-OBS-01: 構造化ログイベント
- **イベント**:
  - `ai_chat.extracted` — 抽出成功
  - `ai_chat.failed` — 抽出失敗 (タイムアウト / 5xx / validation エラー)
  - `ai_chat.approved` — 候補承認
  - `ai_chat.rejected` — 候補棄却
- **共通フィールド**: `tenant_id`, `user_id`, `endpoint`, `model`, `latency_ms`
- **イベント別フィールド**: `candidate.kind`, `candidate.id` 等 (内容含めない)
- **出力先**: CloudWatch Logs (既存パターン)

### NFR-U05-OBS-02: ログ本文除外
- **要件**: メッセージ本文・候補 content はログに**含めない**
- **理由**: PII 保護、運営者アクセス範囲最小化

### NFR-U05-OBS-03: CloudWatch カスタムメトリクス
- **要件**: 以下を CloudWatch カスタムメトリクスとして発行
  - `ai_chat.requests_per_user_per_day` (テナント別ブレイクダウン可、個人別は不可視)
  - `ai_chat.approval_rate` (承認率、本人指標は管理者にも不可視)
  - `ai_chat.rejection_rate` (棄却率、同上)
  - `ai_chat.extraction_latency_p95` (p95 レイテンシ)
  - `bedrock.invoke_failures` (Bedrock 失敗カウント)

### NFR-U05-OBS-04: 個人レベル指標の非可視性 (観測者原則)
- **要件**: 上記メトリクスのうち、教員個人 (user_id) レベルでブレイクダウンできる指標 (承認率 / 棄却率) は **管理者ダッシュボード (school_admin / system_admin) には表示しない**
- **参照可能**: 運営 chimo が AI プロンプト改善材料として参照、ただし管理者 UI には載せない
- **実装**: CloudWatch メトリクスの dimension 設計、管理者 UI 側でレンダリング対象外

### NFR-U05-OBS-05: CloudWatch アラーム
- **アラーム条件**:
  - p95 レイテンシ > 5 秒 (5 分連続) → 運営 chimo 通知
  - Bedrock 失敗率 > 10% (10 分連続) → 同上
  - テナント月次 Bedrock 呼出 > 20,000 円相当 → 同上 (運営判断シグナル)
- **通知先**: SNS topic (運営 chimo email)

---

## 可用性 (AVL)

### NFR-U05-AVL-01: AI 機能と既存 UX の独立性
- **要件**: Bedrock / chat-extraction Lambda / `/api/ai-chat/extract` の障害が、既存 vitanota の他機能 (タスク管理 / 日誌 / ダッシュボード等) に**一切影響しない**
- **保証**: 別 stack (ai-chat-stack) + 環境変数フラグで切り離し可
- **検証**: フィーチャーフラグ OFF テスト

### NFR-U05-AVL-02: フィーチャーフラグの即応性
- **要件**: 環境変数フラグ ON/OFF は AppRunner サービス update + 自動再起動 ~3 分で反映
- **緊急停止シナリオ**: 踏み絵踏み / コスト暴騰 / 障害多発時の即時 OFF (操作: chimo が AppRunner env 設定変更)

---

## 維持容易性 (MNT)

### NFR-U05-MNT-01: Lambda コードのテストカバレッジ
- **要件**: chat-extraction Lambda コードはユニットテスト **80% 以上** カバレッジ
- **重点テスト対象**: piiMasker (正規表現パターン)、candidateValidator (Zod schema 境界値)、Bedrock retry ロジック

### NFR-U05-MNT-02: プロンプトテンプレートの分離
- **要件**: Bedrock プロンプトは別ファイル (`infra/lib/lambdas/chat-extraction/src/prompts/extraction.ts`) で管理
- **理由**: プロンプト調整は実運用で頻繁に発生、コードロジックと分離して変更しやすく
- **バージョン管理**: プロンプトバージョン番号をログイベントに含めて、A/B テスト時の比較を容易に

### NFR-U05-MNT-03: candidateValidator の再利用性
- **要件**: Zod schema (Candidate / TaskCandidate / DiaryCandidate) は共通 schema パッケージ (`src/schemas/aiChat.ts`) で定義
- **理由**: Frontend (form validation) + Lambda (出力検証) + 既存 API (タスク/日誌 INSERT 時の sourceChatSnippet validation) で同じ schema を共有

---

## NFR トレーサビリティ (要件文書との対応)

| 要件文書 NFR-CE-XX | Unit-05 NFR-U05-XXX-NN |
|---|---|
| NFR-CE-01 (p95 < 3 秒) | NFR-U05-PER-01 |
| NFR-CE-02 (起動 < 200ms) | NFR-U05-PER-02 |
| NFR-CE-03 (並列 3) | NFR-U05-PER-03 |
| NFR-CE-04 (50 回/日上限) | NFR-U05-COST-01 |
| NFR-CE-05 (上限超過時) | NFR-U05-COST-01 (挙動詳細) |
| NFR-CE-06 (PII マスキング) | NFR-U05-SEC-02 |
| NFR-CE-07 (Bedrock ap-northeast-1) | NFR-U05-SEC-01 |
| NFR-CE-08 (プライバシーポリシー) | NFR-U05-SEC-03 |
| NFR-CE-09 (チャット非永続化) | NFR-U05-SEC-04 |
| NFR-CE-10 (source_chat_snippet RLS) | NFR-U05-SEC-05 |
| NFR-CE-11 (1 回 retry) | NFR-U05-REL-01 |
| NFR-CE-12 (手動 retry) | NFR-U05-REL-02 |
| NFR-CE-13 (Bedrock 障害時稼働) | NFR-U05-REL-03 / NFR-U05-AVL-01 |
| NFR-CE-14 (ログ本文除外) | NFR-U05-OBS-01 / NFR-U05-OBS-02 |
| NFR-CE-15 (個人指標非可視) | NFR-U05-OBS-04 |
| NFR-CE-16 (運営は集計値参照可) | NFR-U05-OBS-03 (集計値定義) |

**新規追加**: NFR-U05-AVL-01/02 (AI 機能独立性 / フラグ即応性), NFR-U05-MNT-01〜03 (テストカバレッジ / プロンプト分離 / Zod 共通化), NFR-U05-OBS-05 (CloudWatch アラーム), NFR-U05-REL-04 (Lambda timeout), NFR-U05-COST-02〜04 (月額試算 / テナント観測 / モデル切替)

## 参照
- 要件: `aidlc-docs/inception/requirements/2026-05-11-ai-chat-extraction.md`
- 機能設計: `aidlc-docs/construction/unit-05/functional-design/business-rules.md`
- 戦略 memory: `project_ai_strategy_20260511.md`
- tech stack 決定: `tech-stack-decisions.md` (同階層)
