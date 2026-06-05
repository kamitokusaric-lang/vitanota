# 2026-05-11 AI 連携第一弾 — チャット → タスク + 日誌ネタ抽出 機能追加要件

> **作成日**: 2026-05-11
> **対象**: vitanota AI 連携機能の第一弾 (Unit-05: AI 連携 として新規ユニット化)
> **背景**: ローンチ後 (2026-04-26 ユーザー運用開始) → 重大バグ解消 (2026-05-09 PAM auth) → 機能拡張フェーズ。日誌記録量がスカスカで生死線 A (日誌が書かれ続けるか) が破綻、タスク入力フォーム経由が摩擦という現場フィードバック。両方の入力フリクションを 1 機能で解消する
> **位置付け**: `requirements.md` (v2.0 正本) を補完するインクリメンタル要件。本番稼働中アプリへの追加実装

## インテント分析

| 項目 | 内容 |
|---|---|
| リクエストタイプ | 新規機能追加 (新規 Unit-05: AI 連携) |
| スコープ推定 | 教員向け新規 UI コンポーネント + Bedrock 連携 Lambda + DB スキーマ拡張 (`source_chat_snippet` カラム追加) + API 1 本 |
| 複雑度推定 | 中〜高 (新規 AI 統合・プロンプト設計・モバイル UX 設計) |
| 期日 | 未定 (chimo が CI/CD タイミングコントロール、memory: commit/push タイミング自主管理) |
| 要件深さ | **標準** (戦略レベル決定済みで多くが固まってる、詳細点は機能設計以降) |

## 戦略レベル決定 (確定事項 — 本セッションで chimo と合意)

| # | 論点 | 決定 |
|---|---|---|
| 機能 | AI 連携第一弾 | チャット → タスク + 日誌ネタ抽出 (生死線 A・B を 1 機能で同時に救う) |
| 原則 | AI 出力の宛先 | 本人だけ (踏み絵最安全、観測者原則) |
| 原則 | mood の扱い | AI 不可侵 (教員選択を死守) |
| 原則 | 既存 TaskBulkCreateForm | 残置 (リスク対称性) |
| A | チャット欄の置き場 | フローティング型 (画面右下バブル → モーダル/シート) |
| B | 確認 UI | インラインバブル型 + 未承認候補別パネル (ハイブリッド) |
| C | モバイル比重 | モバイルファースト (PC はレスポンシブ拡張) |
| D | チャット履歴 | 変換時スニペット保存 + 未変換揮発 |
| E | mood 取得 UI タイミング | 日誌候補承認時に絵文字選択 |
| F | チャットセッション境界 | 画面離脱 (モーダル/シート閉じる) で終了 |
| G | AI データ送信先 | AWS Bedrock (ap-northeast-1) Claude モデル |
| H | 後続機能優先順位 | リマインド → (日誌記録量↑で) 週次ふりかえり → 抱えすぎ |

## 機能要件 (Functional)

### F-CE-01: チャット起動・入力
- **AC-CE-01**: 教員ロール (teacher / school_admin) のダッシュボードに、画面右下フローティングバブル (チャット起動ボタン) を常時表示
- **AC-CE-02**: バブルタップでモーダル/シート展開 (モバイル: 画面下から full-height シート / PC: 中央〜右側モーダル)
- **AC-CE-03**: テキスト入力欄 + メッセージ履歴領域 + 未確認候補別パネル (アイコン表示) を含む
- **AC-CE-04**: モーダル/シートを閉じる (×・背景タップ・ESC・ブラウザ戻る) でチャットセッション終了
- **AC-CE-05**: 1 メッセージ最大 2000 文字 (Zod schema validate)
- **AC-CE-06**: モバイルファースト UX (タップ性・片手操作・キーボード対応)

### F-CE-02: AI 抽出 (Bedrock 経由)
- **AC-CE-07**: 教員送信メッセージごとに、Bedrock (ap-northeast-1) の Claude Haiku 4.5 が構造化抽出 (タスク候補・日誌候補) を返す
- **AC-CE-08**: 1 メッセージから **最低 1 件、最大複数の候補抽出** (絶対に 0 件にしない、絶対に何かは提案する)
- **AC-CE-09**: 候補種別は **2 分類**: `task` / `diary` (chimo 確定 2026-05-11、知見共有・つぶやきは手動 EntryForm 経路に分離)。1 メッセージから複数 kind の候補が同時に出ても良い
- **AC-CE-09a**: AI が「タスクっぽくない」と判定した場合、**`diary` として候補化する** (default category、0 件防止)
- **AC-CE-10**: タスク候補フィールド: `kind: 'task'`, `title` (必須), `description` (任意), `due_date` (任意・AI 推定), `source_chat_snippet` (必須)
- **AC-CE-11**: 日誌候補フィールド: `kind: 'diary'`, `content` (必須・最大 200 字), `source_chat_snippet` (必須)、**mood は AI 不可侵 (空のまま、承認時に教員選択)**
- **AC-CE-11a**: mood UI 表示条件: **diary 候補承認時のみ** (task 候補は即 INSERT、mood UI なし)
- **AC-CE-11b**: diary 候補承認時の MoodPicker は **温度感のある固定文言** と一緒に表示 (例: 「お疲れさま、書いてくれてありがとう。今の気分も教えて」)。AI 生成ではなく静的 UI テキスト (踏み絵セーフのため、メッセージ内容に応じた動的反応は出さない)
- **AC-CE-11c**: 既存 vitanota の knowledge / tweet 機能は手動 EntryForm 経路で残置、AI 抽出経由では作成しない (既存稼働中機能は無影響)

### F-CE-03: 確認 UI (インラインバブル + 別パネル ハイブリッド)
- **AC-CE-12**: 抽出候補は送信メッセージ直下にインラインバブル表示
- **AC-CE-13**: インラインバブルジェスチャ: ワンタップ承認 / タップで編集モーダル / スワイプ or × で棄却
- **AC-CE-14**: 編集モーダルで AI 生成内容を教員が自由に書換え可
- **AC-CE-15**: 日誌候補承認時、mood 絵文字選択 UI (5 段階ピッカー) を表示。未選択でも承認可、ただし「気分を選んでみよう」促し文言を表示
- **AC-CE-16**: 未承認候補は別パネル「未確認 (N)」アイコンから一覧確認可
- **AC-CE-17**: セッション終了時 (画面離脱) に未承認候補がある場合、確認ダイアログ表示 (「N 件の未確認候補が消えます」)、強制終了でも問題ないシンプル設計

### F-CE-04: データ保存
- **AC-CE-18**: 承認済みタスク候補は既存 `tasks` テーブルに INSERT、`source_chat_snippet` カラムに元文脈保存 (assignees は承認者本人を自動セット)
- **AC-CE-19**: 承認済み日誌候補は既存 `journal_entries` (該当テーブル名は機能設計で確定) に INSERT、`source_chat_snippet` カラム追加
- **AC-CE-20**: チャットメッセージ本体は DB に永続保存しない (セッション状態は client-side メモリ / sessionStorage)、リロード / 別タブで消える

## 非機能要件 (NFR)

### NFR (パフォーマンス)
- **NFR-CE-01**: 1 メッセージ送信から候補表示までの p95 レイテンシ < 3 秒
- **NFR-CE-02**: チャットモーダル起動 (タップ → 表示) < 200ms
- **NFR-CE-03**: 教員あたり同時並行抽出最大 3 並列

### NFR (コスト)
- **NFR-CE-04**: 教員あたり 1 日のチャット抽出 API 呼び出し回数の上限を設定 (機能設計で具体値、暫定 50 回/日)
- **NFR-CE-05**: 上限超過時は「本日の AI 抽出回数が上限に達しました」表示 + チャット入力は受付けるが抽出スキップ (平文メッセージとしてセッション内表示のみ)

### NFR (セキュリティ・プライバシー)
- **NFR-CE-06**: Bedrock 送信前に明らかな PII (email・電話番号) を簡易マスキング (機能設計で実装方針詳細)
- **NFR-CE-07**: AWS Bedrock ap-northeast-1 リージョン固定、データは AWS 内で完結
- **NFR-CE-08**: 教員向けプライバシーポリシー更新: 「チャット入力内容は AWS Bedrock 経由で Claude モデルに送信、送信先は AWS 東京リージョン内に留まる」を明示
- **NFR-CE-09**: チャット履歴は DB 永続化しない (AC-CE-20)、未変換メッセージはセッション終了で揮発
- **NFR-CE-10**: 変換時の `source_chat_snippet` は既存タスク/日誌の RLS で本人 (assignees / journal author) のみアクセス可

### NFR (信頼性)
- **NFR-CE-11**: Bedrock 呼び出し失敗 (タイムアウト / 5xx) 時、1 回のみ自動 retry。失敗継続時はエラーバブル表示
- **NFR-CE-12**: 失敗メッセージは「再試行」ボタンで教員が手動 retry 可
- **NFR-CE-13**: Bedrock サービス障害時のフォールバック: 既存の TaskBulkCreateForm / 日誌画面は通常稼働継続 (リスク対称性、memory: 実装は revert 可能)

### NFR (観測性)
- **NFR-CE-14**: 構造化ログイベント: `ai_chat.extracted` (抽出成功) / `ai_chat.failed` (失敗) / `ai_chat.approved` (承認) / `ai_chat.rejected` (棄却)。各イベントに `tenant_id` / `user_id` / `model` / `latency_ms` を含めるが **メッセージ本文は含めない** (PII 保護)
- **NFR-CE-15**: メトリクス (CloudWatch): 教員あたり 1 日抽出回数 / 承認率 / 棄却率を計測 (運営 chimo 視点のみ、**個人レベル指標は管理者にも見せない**)
- **NFR-CE-16**: 承認率/棄却率は AI プロンプト改善の指標として運営 chimo が参照 (**教員個人の評価指標としては使わない**、観測者原則準拠)

## Out of scope (第一弾)
- リマインド (タスク期限通知) — 後続第二弾
- 抱えすぎのお知らせ — AI 不要で判定可能、後続
- 日誌の週次ふりかえり — 日誌記録量が上がってから着手
- AI 自動登録モード (確認なしタスク化) — 第一弾では実装しない、将来オプトイン
- チャット履歴の永久保存 / 履歴ページ — 監視感に近づく踏み絵
- mood の AI 自動推定 — 最上位踏み絵、不可侵
- チャットからの AI 逆質問 (「これタスクですか?」) — 第一弾は一方向 (教員 → AI 抽出)
- 既存タスクとの重複検知 — 第一弾は重複登録 OK
- PWA 化 / Web Share Target API — 機能設計で評価、第一弾では未確定
- 学校種別差 (小学校 / 中学校) — 教員ロール一律対応
- 校長 / system_admin のチャット利用は teacher と同じ UX (school_admin は使える、対象は本人のタスク/日誌)

## 裏テーマ踏み絵チェック

| 観点 | 評価 | 根拠 |
|---|---|---|
| AI = 観測装置になっていないか | ✅ 合格 | AI 出力は本人のみ参照、NFR-CE-15 で個人レベル指標を管理者にも見せない |
| mood の AI 不可侵 | ✅ 合格 | AC-CE-11 で AI は mood に触らない、AC-CE-15 で教員選択を実装 |
| メンタルケア SaaS 化していないか | ✅ 合格 | 機能は入力摩擦解消の道具、感情分析・診断・推奨は一切なし |
| 評価・スコア化・診断が混入していないか | ✅ 合格 | NFR-CE-16 で承認率/棄却率は運営内部のプロンプト改善用、教員個人評価には使わない明記 |
| 観測されてる感覚を発生させないか | ✅ 合格 | AC-CE-20 / NFR-CE-09 でチャット履歴永久保存なし、未変換は揮発 |
| Knowledge Tool 寄せの方向に逸れていないか | ✅ 合格 | チャットは入力フリクション解消の道具、ナレッジ検索/分類 SaaS 化ではない (memory: positioning) |

## 影響を受ける既存ファイル / 既存システム
- **DB スキーマ**: `tasks` テーブルに `source_chat_snippet` カラム追加、`journal_entries` (該当テーブル) に同カラム追加
- **教員ダッシュボード**: フローティングバブルのマウント (共通 Layout に追加)
- **AWS インフラ**: 新規 Lambda + Bedrock IAM policy 拡張 (`bedrock:InvokeModel` 最小権限)、Secrets Manager に Bedrock 関連設定投入
- **既存 TaskBulkCreateForm / 日誌画面**: 残置、変更なし
- **既存タスク作成 API**: 変更なし (chat 経由は新規 API)

## 新規作成ファイル (要件レベル予想、詳細は機能設計で確定)
- migration: `migrations/00XX_chat_extraction_source_columns.sql`
- Lambda: `infra/lib/lambdas/chat-extraction/` (Bedrock 呼び出し、プロンプト管理)
- API: `pages/api/ai-chat/extract.ts` (POST)
- component (新規 `src/features/ai-chat/components/`):
  - `ChatBubble.tsx` (フローティングバブル)
  - `ChatModal.tsx` (モーダル/シート本体)
  - `CandidateInlineBubble.tsx` (インラインバブル UI)
  - `CandidateEditModal.tsx` (編集モーダル、mood 絵文字ピッカー含む)
  - `UnconfirmedPanel.tsx` (未承認候補別パネル)
- schema: `src/schemas/aiChat.ts` (Zod schemas)
- hook: `src/features/ai-chat/hooks/useChatExtraction.ts` (セッション state 管理)
- CDK 更新: `infra/lib/app-stack.ts` か新 stack — 新 Lambda + Bedrock IAM policy

## NFR (Security Baseline 拡張機能適用)
- 既存 RLS 4 ロール体制を踏襲
- Bedrock 呼び出しは Lambda 内部に閉じ、IAM Policy 最小権限 (specific model ARN + `bedrock:InvokeModel` のみ)
- API ルート (`/api/ai-chat/extract`) は teacher / school_admin のみ実行可 (既存 middleware 流用)
- レート制限 (NFR-CE-04 / 05) で過剰呼び出し防止

## デプロイ・公開タイミング
- **機能ブランチ**: `feat/2026-05-11-ai-chat-extraction` (memory: 機能ごとブランチ)
- **段階的着手** (memory: 実装は常に revert 可能):
  1. DB migration (`source_chat_snippet` カラム追加) — 既存機能に影響なし
  2. Bedrock 連携 Lambda + IAM (インフラ単体)
  3. `/api/ai-chat/extract` API (Lambda 呼び出し)
  4. Frontend component 開発 (UI 完成、ただしフラグ OFF)
  5. 内部テスト (chimo 個人テナントで実機検証)
  6. フィーチャーフラグ ON (本番教員に公開) — school_admin に通知・同意取得
- commit / push タイミングは chimo がコントロール (memory)
- 公開判断は既存フィードバック経路 (機能 B: 教員 → 運営) の声を見て判断

## post-MVP backlog 連携
- リマインド機能 (第二弾): post-MVP backlog に追記予定
- 週次ふりかえり (第三弾): 日誌記録量モニタリングで判断、backlog 追記予定
- 抱えすぎ通知 (第四弾以降): AI 不要、backlog 追記予定
- AI 自動登録モード (オプトイン): 第一弾で抽出精度測定後に判断、backlog 追記予定

## 参照
- `aidlc-docs/inception/requirements/requirements.md` — vitanota 全体要件 v2.0
- `aidlc-docs/inception/requirements/2026-05-07-meeting-features.md` — 5/2 セッション機能追加要件 (フォーマット参考)
- `aidlc-docs/inception/requirements/2026-05-11-ai-chat-extraction-questions.md` — 本要件の clarifying questions 記録
- `aidlc-docs/operations/post-mvp-backlog.md` — Post-MVP バックログ
- memory: `project_ai_strategy_20260511.md` — AI 連携戦略 (戦略レベル決定)
- memory: `feedback_mood_ai_untouchable.md` — mood AI 不可侵原則
- memory: `feedback_observed_moment_broken.md` — 観測されてる感覚の最上位踏み絵
- memory: `project_hidden_theme.md` — vitanota 裏テーマ
- memory: `project_why_vitanota_exists.md` — vitanota が存在する理由 (生死線 A 関連)
- `audit.md` — 本セッションの完全な生記録 (2026-05-11 セクション)
- `aidlc-state.md` — 本セッションの進捗チェックリスト
