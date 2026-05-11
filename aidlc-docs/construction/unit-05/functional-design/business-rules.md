# Unit-05 (AI 連携) — ビジネスルール

> **対応要件**: [`inception/requirements/2026-05-11-ai-chat-extraction.md`](../../../inception/requirements/2026-05-11-ai-chat-extraction.md)
> **対応ストーリー**: [`inception/user-stories/2026-05-11-ai-chat-extraction-stories.md`](../../../inception/user-stories/2026-05-11-ai-chat-extraction-stories.md)
> **作成日**: 2026-05-11
> **改訂**: 2026-05-11 (4 分類 → 2 分類、温度感コメント追加、mood 必須化)
> **技術非依存**: 本ドキュメントはビジネスロジックを述べる、インフラ詳細は infrastructure-design / nfr-design 参照

## ルール一覧 (BR-CE-XX)

### AI 抽出ルール

#### BR-CE-01: AI モデル指定
- **ルール**: AI 抽出は AWS Bedrock (ap-northeast-1) の **Claude Haiku 4.5** で実施
- **理由**: 2 分類タスクに最適、コスト効率良し
- **例外**: 精度不足が観測された場合、Sonnet 4.6 へ model_id 切替可

#### BR-CE-02: 候補分類 (2 分類)
- **ルール**: 抽出候補は以下の 2 分類のいずれか
  - `task`: タスク候補
  - `diary`: 日々ノート候補
- **理由**: AI チャット抽出は「軽い書き散らし入口」、シンプル化で抽出精度向上 (chimo 確定 2026-05-11)
- **既存 vitanota との関係**: 既存 `journalEntryKindEnum` は 3 種別 (`diary | knowledge | tweet`) だが、**AI 抽出経由では diary のみ**。knowledge / tweet は教員が手動 EntryForm から投稿する経路で対応

#### BR-CE-03: 空配列禁止 (最低 1 件保証)
- **ルール**: 抽出結果は **最低 1 件、絶対に空配列にしない**
- **理由**: 教員「書いたのに無視された」体験を防止、書く動機を保持 (生死線 A 保護)
- **検証**: candidateValidator が `candidates.min(1)` を Zod で enforce

#### BR-CE-04: diary をデフォルトカテゴリとする
- **ルール**: AI が「タスクっぽくない」と判定した場合、必ず `diary` 候補として 1 件返す
- **理由**: BR-CE-03 (空配列禁止) を満たす実装手段、簡潔
- **例**: 「コーヒー切れた」「今日も雨かぁ」「6 年 1 組頑張ってた」みたいな書き散らしも diary として落とす

#### BR-CE-05: 文字数制限
- **ルール**: 候補フィールドの文字数を制約
  - `task.title`: 1〜200 字
  - `task.description`: 0〜2000 字 (任意)
  - `diary.content`: 1〜200 字 (既存 `journal_entries` の diary 仕様踏襲)
  - 全候補の `sourceChatSnippet`: 1〜500 字
- **理由**: 既存 `journalEntries` の diary validation 仕様と整合
- **enforce**: candidateValidator (Zod) でサーバ側検証 + Frontend form validation

### mood ルール (踏み絵厳守 + 温度感)

#### BR-CE-06: mood は AI 不可侵
- **ルール**: AI 出力 schema に `mood` フィールドを **構造的に含めない**
- **理由**: memory `feedback_mood_ai_untouchable.md` — mood を AI が推定/分析/スコア化すると最上位踏み絵 (観測されてる感覚) を踏み、教員の日誌が嘘データ化
- **enforce**: candidateValidator の output schema 定義時点で mood フィールド非存在 (物理的保証)

#### BR-CE-07: mood UI と温度感コメント (diary 候補承認時のみ、必須)
- **ルール**: MoodPicker は `kind='diary'` の候補承認フロー内でのみ表示。`task` 候補では非表示 (即 INSERT)
- **温度感コメント**: MoodPicker と一緒に **静的固定文言** を表示 (例: 「お疲れさま、書いてくれてありがとう。今の気分も教えて」)
  - **AI 生成ではない**: メッセージ内容に応じた動的反応は出さない、踏み絵セーフ確保
  - **理由**: AI 生成だと「メッセージ内容を解釈して反応 = 観測されてる感覚」に紙一重、固定なら AI = 雑用係 + 教員側に立つ仕組み に留まる
- **mood 必須**: 既存 diary 仕様踏襲 (chimo 確定 2026-05-11)、選択前は保存ボタン disabled
- **連続 diary 承認時**: 直前の mood が default 予選択 (ワンタップ承認可、別 mood に変更も可)

### チャットセッションルール

#### BR-CE-08: source_chat_snippet 必須
- **ルール**: 承認された候補は **必ず** `source_chat_snippet` (元メッセージ抜粋) を保持して既存 tasks / journal_entries に INSERT
- **理由**: 後から「この候補は何の話だっけ?」を辿れるようにする、ただしチャット履歴本体は永続化しない

#### BR-CE-09: チャットメッセージ本体は DB 永続化しない
- **ルール**: 教員が送信した個別チャットメッセージは DB に保存しない (sessionStorage / メモリのみ)
- **理由**: 監視感の発生を防ぐ (memory `feedback_observed_moment_broken.md`)、運営者アクセス範囲最小化

#### BR-CE-18: セッション境界は画面離脱
- **ルール**: ChatModal を閉じる (×・背景タップ・ESC・ブラウザ戻る・タブ遷移・ブラウザリロード) で **セッション終了**
- **理由**: フローティング型のモーダル/シート閉じる行為が自然な境界、ユーザー認知と一致
- **挙動**: 未承認候補は揮発 (BR-CE-19 で確認ダイアログ表示)

#### BR-CE-19: 未承認候補がある状態でセッション終了時の確認
- **ルール**: 未承認候補 > 0 の状態で ChatModal を閉じる動作 → 確認ダイアログ表示
- **メッセージ**: 「未確認候補が N 件あります。閉じると消えます」
- **選択肢**: 「閉じる」(揮発) / 「戻る」(セッション継続)
- **強制終了**: ブラウザクラッシュ・電源断・タブ強制終了は防げない、ベストエフォート

### 操作・状態ルール

#### BR-CE-17: Edit 保存 = 即承認 (1 ステップ)
- **ルール**: CandidateEditModal の「保存」ボタン = DB INSERT 確定 + ChatModal に戻る
- **理由**: 「編集 → 改めて承認」の 2 ステップは UX 摩擦増、本機能の「摩擦解消」目的と逆行
- **例外**: kind='diary' の場合、保存ボタン押下後に MoodPicker + 温度感コメント表示 → 教員 mood 選択 → INSERT (BR-CE-07)

### 制限・防御ルール

#### BR-CE-10: Rate Limit (教員ごと 50 回/日)
- **ルール**: 教員 (user_id) ごと 1 日 50 回まで `/api/ai-chat/extract` を呼び出し可
- **アルゴリズム**: Fixed Window、JST 00:00 でリセット
- **超過時**: 429 RATE_LIMIT_EXCEEDED を返す、Frontend は「本日上限到達」表示
- **粒度**: テナント単位の rate limit は不採用 (現状規模で不要、教員 × 50 の自然上限で十分)
- **テナント全体予算保護**: CloudWatch メトリクス + 運営アラートで観測 (運営判断のシグナル)

#### BR-CE-11: フィーチャーフラグ OFF 時の挙動
- **ルール**: 環境変数 `ENABLE_AI_CHAT_EXTRACTION=false` (Server) / `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION=false` (Client) の時
  - Frontend: ChatBubble 非表示
  - API: `/api/ai-chat/extract` は 404 を返す
  - Lambda: そもそも呼び出されない (API 層で遮断)
- **理由**: 緊急停止 / 段階リリースの仕組み (本番デプロイと公開を分離)

#### BR-CE-12: Bedrock 失敗時の retry
- **ルール**: Bedrock 呼び出しが タイムアウト / 5xx の場合、**自動 1 回 retry**
- **2 回目も失敗**: API は 503 AI_EXTRACTION_UNAVAILABLE を返し、Frontend はエラーバブル + 「再試行」ボタン表示
- **理由**: 過剰 retry は雪崩、控えめに

#### BR-CE-13: PII マスキング (送信前)
- **ルール**: Bedrock 送信前に明らかな PII (email / 電話番号) を簡易マスキング
- **実装**: 正規表現ベース (例: `\S+@\S+\.\S+` → `[email]`、`0\d{1,4}-\d{1,4}-\d{4}` → `[phone]`)
- **注意**: 完全ではない (氏名等は対象外)、運用ガイドラインで補完 (NFR-CE-06)

### 観測性・ログルール

#### BR-CE-14: 構造化ログにメッセージ本文を含めない
- **ルール**: ログイベント (`ai_chat.extracted` / `ai_chat.failed` / `ai_chat.approved` / `ai_chat.rejected`) には `tenant_id` / `user_id` / `model` / `latency_ms` を含めるが、**メッセージ本文・候補 content は含めない**
- **理由**: PII 保護 (NFR-CE-14)

#### BR-CE-15: 観測者原則 (個人レベル指標は管理者にも不可視)
- **ルール**: CloudWatch メトリクス (教員あたり 1 日抽出回数 / 承認率 / 棄却率) は運営 chimo の AI プロンプト改善材料として参照可、ただし **管理者 (school_admin / system_admin の管理画面) には個人レベル指標を見せない**
- **理由**: 教員個人を評価する道具に転用されると最上位踏み絵 (memory `feedback_observed_moment_broken.md`) を踏む
- **実装**: 集計値 (テナント全体・全テナント合計) は管理者ダッシュボードに表示可、個人別ブレイクダウンは表示しない

## ルール優先順位

抵触した場合の優先順位:

1. **踏み絵防御** (BR-CE-06 / 07 温度感コメント静的 / 14 / 15) — 絶対譲らない、本機能の存在理由
2. **生死線保護** (BR-CE-03 / 04) — 空配列禁止・diary デフォルト、書く動機を保持
3. **リスク対称性** (BR-CE-09 / 11) — チャット非永続化・フラグ機構、既存 UX 無影響を保証
4. **既存仕様整合** (BR-CE-02 / 05 / 07) — 2 分類 / 文字数 / mood の既存仕様踏襲
5. **コスト管理** (BR-CE-10 / 12 / 13) — Rate Limit / retry 控えめ / PII マスク
6. **UX 最適化** (BR-CE-17 / 18 / 19) — 1 ステップ承認 / 画面離脱境界 / 未承認確認
7. **その他** (BR-CE-01 / 08) — モデル選定 / source_chat_snippet

抵触ケースで判断に迷ったら、上位 (1) のルールを採用、下位を譲る。

## 参照
- 要件 AC マトリックス: `aidlc-docs/inception/requirements/2026-05-11-ai-chat-extraction.md`
- ストーリー: `aidlc-docs/inception/user-stories/2026-05-11-ai-chat-extraction-stories.md`
- アプリケーション設計: `aidlc-docs/inception/application-design/2026-05-11-ai-chat-extraction-design.md`
- 関連 memory: `project_journal_kind_model.md` / `feedback_mood_ai_untouchable.md` / `feedback_observed_moment_broken.md` / `project_ai_strategy_20260511.md`
