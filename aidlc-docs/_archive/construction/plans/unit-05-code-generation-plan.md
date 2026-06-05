# Unit-05 (AI 連携) — コード生成プラン

> **対応 Unit**: Unit-05 (AI 連携 / チャット抽出第一弾)
> **対応設計**: [`construction/unit-05/`](../unit-05/) (functional-design / nfr-requirements / nfr-design / infrastructure-design)
> **対応実装プラン**: [`inception/plans/2026-05-11-ai-chat-extraction-plan.md`](../../inception/plans/2026-05-11-ai-chat-extraction-plan.md)
> **対応ストーリー**: [`inception/user-stories/2026-05-11-ai-chat-extraction-stories.md`](../../inception/user-stories/2026-05-11-ai-chat-extraction-stories.md) (US-T-070〜075)
> **作成日**: 2026-05-11

## 設計サマリー

### Unit-05 のスコープ
- 教員ダッシュボードに **AI チャット抽出機能** を追加 (フィーチャーフラグで段階リリース)
- 既存 vitanota の本番稼働中機能には **一切影響しない** (リスク対称性、既存 UX 無影響)
- 候補分類は **task / diary の 2 分類** (chimo 確定 2026-05-11)、knowledge / tweet は手動 EntryForm 経路

### 実装対象ストーリー
- US-T-070: チャットでサッと書き散らす (起動 UX) 🔴 Must
- US-T-071: AI に書いた言葉をタスクとして拾ってもらう 🔴 Must
- US-T-072: AI に書いた言葉を日誌として拾ってもらう 🔴 Must
- US-T-073: チャットを閉じても安心 (未承認候補の防護) 🟡 Should
- US-T-074: diary 候補に気分絵文字を選ぶ (mood UI + 温度感コメント、必須化) 🔴 Must
- US-T-075: Bedrock 障害時もタスク管理は使える 🟢 Could

### ブランチ・タイミング (memory: revert 可能性、機能ごとブランチ、commit/push 自主管理)
- **作業ブランチ**: `feat/2026-05-11-ai-chat-extraction`
- **ベースライン tag**: `pre-ai-chat-extraction-baseline` (作業着手時に main HEAD に付与)
- **commit / push タイミング**: chimo が自主管理、AI 側からは急かさない

### コード配置 (memory: ディレクトリ構造)
- **Application Code**: ワークスペースルート (`src/` / `pages/` / `migrations/` / `infra/`)
- **Documentation**: `aidlc-docs/construction/unit-05/code/` (Markdown summary)
- **絶対に守る**: aidlc-docs/ 配下にアプリコード書かない

### 依存関係
- Phase 1 (DB) → Phase 2 (Lambda) / Phase 3 (API) / Phase 4 (Frontend) の前提
- Phase 2/3/4 は相互独立、並列実装可
- Phase 5 (統合テスト) は Phase 1-4 完了後
- Phase 6 (本番デプロイ) は Phase 5 完了後
- Phase 7 (フラグ ON) は Phase 6 完了後

### 開発スタイル: ハイブリッド (chimo 確定 2026-05-11)

ローカル開発と Bedrock 実機の組合せ:

| 用途 | 方式 | コスト |
|---|---|---|
| 日常開発 (Lambda ユニットテスト / Frontend UX) | **mock Bedrock** (MOCK_BEDROCK env 変数で切替) | ¥0 |
| プロンプト調整 | **AWS Console Bedrock Playground** (chimo の AWS account、ap-northeast-1) で手動試行 | ~¥100/月 |
| 統合テスト | mock Bedrock + 実 DB against | ¥0 |
| 本番統合確認 | Phase 7-2 (chimo 個人テナント先行 ON) で実 Bedrock against | ~¥500/月 (検証期間) |

**MOCK_BEDROCK 切替の実装方針** (Step 2-3 で実装):
- Lambda 内 bedrockInvoker サービスで env 変数判定
- mock 時: メッセージから簡易パターン判定 → 固定形式の候補 (task 1 件 + diary 1 件 等) を返却
- 本番時: 環境変数未設定 or false → 実 Bedrock 呼出
- Frontend 側は API レスポンスを受け取るだけ、mock かどうかは透明

**プロンプト調整フロー**:
1. ローカルで `infra/lib/lambdas/chat-extraction/src/prompts/extraction.ts` を編集
2. AWS Console Bedrock Playground で同じ system prompt + ユーザーメッセージ で試行
3. 出力 JSON が candidateValidator の Zod schema を満たすか目視確認
4. 満足したら commit、Step 7 (フラグ ON) 後の実機観測で精度測定

---

# 実行ステップ (パート 2 で実装)

## Step 1: Phase 1 — DB migration

新規テーブル + 既存テーブルへのカラム追加。既存機能に影響なし。

- [ ] **Step 1-1**: `migrations/00XX_chat_extraction_source_columns.sql` 新規作成
  - `tasks.source_chat_snippet TEXT NULL` 追加
  - `journal_entries.source_chat_snippet TEXT NULL` 追加
  - (XX は次の連番、要確認)
- [ ] **Step 1-2**: `migrations/00YY_api_rate_limits.sql` 新規作成
  - `api_rate_limits` テーブル (user_id, endpoint, date, count、PK 複合)
  - RLS 有効化 + ポリシー (本人 + system_admin)
- [ ] **Step 1-3**: `src/db/schema.ts` 更新
  - `tasks.sourceChatSnippet` カラム追加 (Drizzle)
  - `journalEntries.sourceChatSnippet` カラム追加
  - `apiRateLimits` テーブル定義追加
- [ ] **Step 1-4**: ローカル DB に migration 適用 + 動作確認
  - `pnpm db:migrate` (or 同等)
  - 既存 tasks / journal_entries の動作に影響ないことを確認
  - `psql` で新テーブル + カラム確認
- [ ] **Step 1-5**: 既存テスト suite GREEN 確認
  - `pnpm test` (全件 GREEN、既存機能無影響を verify)
  - `pnpm rls:check` (RLS DSL チェック GREEN)

**story 紐付け**: 本 Step は基盤、全 US-T-070〜075 の前提

---

## Step 2: Phase 2 — Bedrock 連携 Lambda + IAM (ai-chat-stack)

- [ ] **Step 2-1**: Lambda コード基盤
  - `infra/lib/lambdas/chat-extraction/` ディレクトリ
  - `package.json`, `tsconfig.json`, esbuild 設定
- [ ] **Step 2-2**: `piiMasker` サービス + ユニットテスト
  - `src/services/piiMasker.ts`
  - 正規表現: email / 電話番号
  - ユニットテスト: 境界値・ハイフン有無・複数 PII 混在
- [ ] **Step 2-3**: `bedrockInvoker` サービス + ユニットテスト + **MOCK 機構**
  - `src/services/bedrockInvoker.ts`
  - 1 回 retry ロジック
  - **MOCK_BEDROCK env 変数判定** で実 Bedrock invoke と mock レスポンス を切替 (ハイブリッド開発スタイル、chimo 確定 2026-05-11)
  - mock 時: メッセージから簡易パターン判定 → 固定形式の候補 (task 1 件 + diary 1 件 等) を返却
  - 本番時: 環境変数未設定 or false → 実 Bedrock 呼出
  - mock Bedrock でユニットテスト、実 Bedrock 経路もモック client でユニットテスト
- [ ] **Step 2-4**: `candidateValidator` サービス + ユニットテスト
  - `src/services/candidateValidator.ts`
  - Zod discriminatedUnion (TaskCandidateSchema + DiaryCandidateSchema)
  - `.strict()` + `.min(1)` の境界値テスト
  - フォールバック (空配列 → default diary 1 件) のテスト
- [ ] **Step 2-5**: `metricsEmitter` サービス + ユニットテスト
  - `src/services/metricsEmitter.ts`
  - CloudWatch EMF (Embedded Metric Format) でログ出力
  - dimension に user_id を入れないことを verify
- [ ] **Step 2-6**: Lambda handler (orchestration)
  - `src/handler.ts`
  - piiMasker → bedrockInvoker → candidateValidator → metricsEmitter のフロー
- [ ] **Step 2-7**: プロンプトテンプレート分離
  - `src/prompts/extraction.ts`
  - 2 分類判定ロジックを system prompt として記述
  - max_tokens 制約 (output ~500 tokens)
- [ ] **Step 2-8**: `infra/lib/ai-chat-stack.ts` (CDK スタック)
  - Lambda function 定義 (Node.js 22.x / arm64 / 512 MB / 10 秒 / Reserved 100)
  - IAM Inline Policy (最小権限)
  - Secrets Manager: `vitanota/ai-chat/bedrock-config` (将来用)
  - SSM Parameter: bedrock-model-id / rate-limit-per-day / prompt-version
  - CloudWatch Log Group (retention 30 日)
  - CloudWatch Alarms × 3 (p95 / 失敗率 / テナント月次予算)
  - SNS topic `vitanota-prod-ai-chat-alerts` + email subscription
- [ ] **Step 2-9**: `infra/bin/vitanota.ts` に AiChatStack 追加
  - AiChatStack インスタンス化、デプロイ対象として登録
- [ ] **Step 2-10**: `cdk synth` 確認
  - CloudFormation テンプレート生成成功
  - 目視確認 (IAM policy / Lambda 設定 / アラーム閾値)

**story 紐付け**: US-T-071 / US-T-072 / US-T-075 の基盤

---

## Step 3: Phase 3 — `/api/ai-chat/extract` API + Rate Limit

- [ ] **Step 3-1**: 共通 Zod schemas
  - `src/schemas/aiChat.ts`
  - TaskCandidateSchema / DiaryCandidateSchema / ExtractionResultSchema (Frontend / Lambda / 既存 API 共通)
- [ ] **Step 3-2**: Rate Limit ロジック
  - `src/lib/rateLimit.ts`
  - PostgreSQL UPSERT + count check
  - 既存パターン (`src/lib/db.ts` 等) との整合
- [ ] **Step 3-3**: API ルート本体
  - `pages/api/ai-chat/extract.ts`
  - env flag 判定 (L1) → withAuthApi (L2) → rateLimit (L3) → Lambda invoke
  - エラーハンドリング (404 / 401 / 403 / 429 / 503 / 200)
  - 構造化ログ (`ai_chat.extracted` / `ai_chat.failed`)
- [ ] **Step 3-4**: 既存 `POST /api/tasks` の body schema 拡張
  - `sourceChatSnippet?: string` を optional で追加 (後方互換)
  - 既存 INSERT 経路で NULL 許可、新規経路で値受領
- [ ] **Step 3-5**: 既存 `POST /api/journal/entries` (該当 API、要確認) の body schema 拡張
  - 同上、`sourceChatSnippet?` optional 追加
  - mood は既存仕様通り (diary 必須、knowledge/tweet 不要)
- [ ] **Step 3-6**: Repository 層に source_chat_snippet pass-through
  - `src/features/tasks/repository/*` 等で INSERT 時に source_chat_snippet を含める
  - 既存 Repository のシグネチャ拡張 (optional)
- [ ] **Step 3-7**: API ユニット + 統合テスト
  - ユニット: env flag 判定 / 認証 / rate limit / Lambda invoke モック
  - 統合: 実 DB against で rate limit テーブル UPSERT 動作 / 429 返却 / 既存 API への sourceChatSnippet pass-through
  - 構造化ログイベントの形式テスト (本文除外を verify)

**story 紐付け**: US-T-070 (起動 UX 後の API 受信)、US-T-071 / US-T-072 (抽出 API)、NFR-U05-COST-01 (Rate Limit)

---

## Step 4: Phase 4 — Frontend components (UI 完成、フラグ OFF)

- [ ] **Step 4-1**: `useChatBubbleFlag` hook
  - `src/features/ai-chat/hooks/useChatBubbleFlag.ts`
  - env 変数 `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION` 判定
- [ ] **Step 4-2**: `useChatExtraction` hook (セッション state)
  - `src/features/ai-chat/hooks/useChatExtraction.ts`
  - state: messages / candidates / lastSelectedMood / isLoading / error
  - methods: sendMessage / approveCandidate / rejectCandidate / editCandidate / retryMessage / clearSession
  - Concurrent limit ロジック (並列 3、4 件目は queue)
- [ ] **Step 4-3**: `<ChatBubble>` component
  - `src/features/ai-chat/components/ChatBubble.tsx`
  - フローティング 右下 56x56px
  - data-testid + a11y 属性
- [ ] **Step 4-4**: `<ChatModal>` component (モバイル + PC レイアウト)
  - `src/features/ai-chat/components/ChatModal.tsx`
  - モバイル: full-height bottom sheet、PC: 中央モーダル (幅 480px)
  - useChatExtraction との統合、attemptClose ロジック
- [ ] **Step 4-5**: `<MessageList>` + `<MessageBubble>` components
  - `src/features/ai-chat/components/MessageList.tsx`
  - `src/features/ai-chat/components/MessageBubble.tsx`
  - メッセージ + 候補のグルーピング表示、sender 別バリアント
- [ ] **Step 4-6**: `<CandidateInlineBubble>` component
  - `src/features/ai-chat/components/CandidateInlineBubble.tsx`
  - kind 別バッジ (📋 task / 📓 diary)
  - ジェスチャ: タップ承認 / 長押し編集 / スワイプ棄却
  - data-testid 設定
- [ ] **Step 4-7**: `<CandidateEditModal>` component
  - `src/features/ai-chat/components/CandidateEditModal.tsx`
  - kind 別フォーム (task: title/description/dueDate、diary: content)
  - 文字数 counter、Zod validation 連携
- [ ] **Step 4-8**: `<MoodPicker>` component
  - `src/features/ai-chat/components/MoodPicker.tsx`
  - 5 段階絵文字、value prop は親管理
  - 初期値 null、AI 推定値で埋まらない構造
- [ ] **Step 4-9**: `<DiaryApproveDialog>` component (温度感コメント + MoodPicker 統合)
  - `src/features/ai-chat/components/DiaryApproveDialog.tsx`
  - 静的温度感コメント (固定文言、AI 生成ではない)
  - MoodPicker 統合、lastSelectedMood で予選択
  - 「この気分で保存」ボタン (mood 未選択時 disabled)
- [ ] **Step 4-10**: `<UnconfirmedPanel>` component
  - `src/features/ai-chat/components/UnconfirmedPanel.tsx`
  - 未承認候補だけ表示、ChatModal 内 sub-panel
- [ ] **Step 4-11**: `<CloseConfirmDialog>` component
  - `src/features/ai-chat/components/CloseConfirmDialog.tsx`
  - 未承認 > 0 時の閉じ確認、戻る / 閉じる ボタン
- [ ] **Step 4-12**: 共通 Layout に `<ChatBubble>` マウント
  - `src/components/Layout.tsx` (or 該当ファイル) を編集
  - useChatBubbleFlag で条件付き表示
  - 既存 Layout に最小限の追加のみ (memory: 言われたことだけやる)
- [ ] **Step 4-13**: ユニットテスト (各 component + hook、80% カバレッジ)
  - component 単独テスト (props 入力 → 表示確認)
  - hook テスト (state 変化 / method 呼出)
  - 共通 schema (Zod) のテストも追加

**story 紐付け**: US-T-070 (起動 UX)、US-T-071 (タスク承認)、US-T-072 (日誌承認)、US-T-073 (未承認防護)、US-T-074 (mood + 温度感コメント)

---

## Step 5: Phase 5 — 統合テスト + 内部検証

- [ ] **Step 5-1**: Playwright E2E テスト
  - `__tests__/e2e/ai-chat-extraction.spec.ts`
  - シナリオ: 起動 → 送信 → 抽出 → 承認 → tasks / journal_entries 確認
  - kind 別シナリオ (task / diary)
  - 未承認確認ダイアログのテスト
- [ ] **Step 5-2**: 統合テスト (実 DB against + mock Bedrock)
  - `__tests__/integration/ai-chat-extraction.test.ts`
  - rate limit UPSERT の並行性テスト
  - 既存 tasks / journal_entries への INSERT (sourceChatSnippet 付き) テスト
  - 既存 RLS が source_chat_snippet も保護することを verify
- [ ] **Step 5-3**: ローカル `pnpm dev` で手動検証 (**mock モード**)
  - chimo 個人テナントで実 UI 確認 (env flag ON 状態 + `MOCK_BEDROCK=true`)
  - モバイル / PC 両方
  - シーン別 (朝 / 隙間 / 帰宅後 をシミュレート)
  - mock 応答で UX 動作確認 (実 AI 応答は Phase 7-2 で確認)
- [ ] **Step 5-3.5**: AWS Console Bedrock Playground でプロンプト調整 (新規)
  - chimo の AWS account、ap-northeast-1 で実 Bedrock against 手動試行
  - `infra/lib/lambdas/chat-extraction/src/prompts/extraction.ts` の system prompt を Playground で試行
  - 出力 JSON が candidateValidator の Zod schema を満たすか目視確認
  - 抽出精度に満足したら commit
  - コスト ~¥100/月 (試行回数次第)
- [ ] **Step 5-4**: 踏み絵チェック実機検証
  - mood UI が AI から推定値を受け取らないこと
  - チャット履歴が DB 永続化されないこと
  - 個人レベル指標が管理者ダッシュボードに出ないこと (集計値のみ表示)
- [ ] **Step 5-5**: コスト試算
  - 実際の Bedrock token usage を CloudWatch ログから集計
  - 1 リクエスト平均コスト確認、月額予測

**story 紐付け**: 全 US-T-070〜075 の E2E 検証

---

## Step 6: Phase 6 — 本番デプロイ (フラグ OFF のまま)

- [ ] **Step 6-1**: 全テスト GREEN 最終確認
  - `pnpm lint` GREEN
  - `pnpm typecheck` GREEN
  - `pnpm test` GREEN (unit + integration)
  - `pnpm build` GREEN
  - `pnpm rls:check` GREEN
- [ ] **Step 6-2**: main にマージ (chimo の指示待ち、memory: commit/push タイミング自主管理)
  - PR 経由でマージ、CI GREEN 確認
  - **ベースライン tag を確実に打つ** (`git tag pre-ai-chat-extraction-baseline <SHA>`)
- [ ] **Step 6-3**: `cdk deploy vitanota-prod-app` (新 image deploy)
  - AppRunner update、health check GREEN
- [ ] **Step 6-4**: `cdk deploy vitanota-prod-ai-chat` (新 AiChatStack)
  - Lambda / IAM / Secrets / SSM / アラーム / SNS 作成
- [ ] **Step 6-5**: 本番 DB migration 適用
  - `aws lambda invoke --function-name vitanota-prod-db-migrator --payload '{"command":"migrate"}' /tmp/migrate.json`
  - 本番 RDS で `\dt` 確認、新テーブル + カラム存在 verify
- [ ] **Step 6-6**: AppRunner env 変数 update (フラグ OFF のまま)
  - `ENABLE_AI_CHAT_EXTRACTION=false`
  - `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION=false`
  - `AI_CHAT_LAMBDA_ARN=<新 Lambda ARN>`
  - AppRunner 自動再起動 ~3 分
- [ ] **Step 6-7**: 本番フラグ OFF 状態の動作確認
  - 既存タスク管理 / 日誌画面が無影響稼働
  - ChatBubble 非表示
  - `/api/ai-chat/extract` 直叩きで 404 返却

**story 紐付け**: NFR-U05-AVL-01 (独立性 verify)、リスク対称性確保

---

## Step 7: Phase 7 — フィーチャーフラグ ON (教員公開)

- [ ] **Step 7-1**: school_admin 通知 + プライバシーポリシー更新
  - 校長先生 (校長導入意思表明先) に通知、同意取得
  - プライバシーポリシー文言 (NFR-U05-SEC-03) を反映、教員に告知
- [ ] **Step 7-2**: chimo テナント先行 ON
  - 一時的に chimo 個人テナント (= 開発用) で env flag ON
  - 本番 Bedrock against で実機検証
- [ ] **Step 7-3**: 動作確認後、全教員公開
  - AppRunner env `ENABLE_AI_CHAT_EXTRACTION=true` + `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION=true`
  - 再起動 ~3 分で反映
- [ ] **Step 7-4**: 観測フェーズ (1 週間)
  - CloudWatch アラーム watch (chimo)
  - 教員フィードバック (フィードバック機能経由) を回収
  - 抽出精度 / 承認率 / 棄却率を CloudWatch メトリクスで監視
  - 異常時はフラグ OFF で即時 revert

**story 紐付け**: 全 US-T-070〜075 の本番運用、生死線 A・B 救出の検証フェーズ

---

## Step 8: ドキュメンテーション

- [ ] **Step 8-1**: `aidlc-docs/construction/unit-05/code/code-summary.md` 作成
  - 実装ファイル一覧 (新規 / 既存変更を区別)
  - テスト件数・カバレッジ
  - 主要決定事項のリンク (要件 / 設計 / NFR)
- [ ] **Step 8-2**: `aidlc-docs/docs-index.md` 更新
  - Unit-05 関連ファイルを正本 [CURRENT] として登録
  - 🤖 AI 機能セクションを「LEGACY 凍結状態 → CURRENT 稼働中」に更新
- [ ] **Step 8-3**: README / API docs 更新
  - vitanota README に AI チャット機能の存在を 1 段落
  - API docs (OpenAPI) に `/api/ai-chat/extract` 追加 (`pnpm openapi:generate` で自動か手動か要確認)

**story 紐付け**: 維持容易性 (NFR-U05-MNT-XX)、運用観点

---

## Step マップ ↔ Story 紐付けサマリー

| Story | 主要 Step |
|---|---|
| US-T-070 (起動 UX) | Step 4-1, 4-3, 4-4, 4-12 |
| US-T-071 (タスク抽出) | Step 1-1, 2-*, 3-*, 4-2, 4-6, 4-7 |
| US-T-072 (日誌抽出) | Step 1-1, 2-*, 3-*, 4-2, 4-6, 4-7, 4-9 |
| US-T-073 (未承認防護) | Step 4-2, 4-10, 4-11 |
| US-T-074 (mood + 温度感) | Step 4-8, 4-9 |
| US-T-075 (Bedrock 障害) | Step 2-3 (retry), Step 6-7 (既存 UX 無影響 verify) |

## Step 数サマリー

- Step 1: 5 サブステップ (DB migration)
- Step 2: 10 サブステップ (Lambda + IAM)
- Step 3: 7 サブステップ (API + Rate Limit)
- Step 4: 13 サブステップ (Frontend)
- Step 5: 5 サブステップ (統合テスト)
- Step 6: 7 サブステップ (本番デプロイ)
- Step 7: 4 サブステップ (フラグ ON)
- Step 8: 3 サブステップ (ドキュメント)
- **合計**: 54 サブステップ

## 想定タイムライン (再掲、実装プラン踏襲)

- Phase 1 (Step 1): 0.5 日
- Phase 2 (Step 2): 2〜3 日
- Phase 3 (Step 3): 1〜2 日
- Phase 4 (Step 4): 4〜6 日
- Phase 5 (Step 5): 2〜3 日
- Phase 6 (Step 6): 0.5 日
- Phase 7 (Step 7): 0.5 日 + 観測 1 週間
- Step 8 (ドキュメント): Phase 5/6/7 と並列

合計: **約 2〜3 週間** (chimo の commit/push タイミング次第)

## 完了基準

- 全 54 サブステップが `[x]` 完了
- 全 6 stories (US-T-070〜075) が実装され、E2E テスト GREEN
- 全テスト GREEN (`pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm rls:check`)
- 本番デプロイ完了 (フラグ OFF 状態で既存 UX 無影響稼働 verify)
- フラグ ON 後、1 週間観測フェーズ完了 (重大インシデントなし)

## 参照

- 設計書: `aidlc-docs/construction/unit-05/`
- 要件: `aidlc-docs/inception/requirements/2026-05-11-ai-chat-extraction.md`
- ストーリー: `aidlc-docs/inception/user-stories/2026-05-11-ai-chat-extraction-stories.md`
- 実装プラン: `aidlc-docs/inception/plans/2026-05-11-ai-chat-extraction-plan.md`
- 関連 memory: `project_ai_strategy_20260511.md` / `project_journal_kind_model.md` / `feedback_mood_ai_untouchable.md` / `feedback_implementation_reversibility.md` / `feedback_branch_per_feature.md` / `feedback_commit_push_timing.md`
