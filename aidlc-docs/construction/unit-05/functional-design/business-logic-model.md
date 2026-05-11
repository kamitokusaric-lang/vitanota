# Unit-05 (AI 連携) — ビジネスロジックモデル

> **対応要件**: [`inception/requirements/2026-05-11-ai-chat-extraction.md`](../../../inception/requirements/2026-05-11-ai-chat-extraction.md)
> **作成日**: 2026-05-11
> **改訂**: 2026-05-11 (2 分類化、温度感コメント追加、mood 必須化)
> **技術非依存**: ビジネスロジックを述べる、インフラ詳細は別ドキュメント

## 1. チャットセッション state 遷移

### セッション全体ライフサイクル

```
       ┌─────────────┐
       │  CLOSED     │ ← 初期状態 (ChatModal 閉じ)
       └──────┬──────┘
              │ ChatBubble タップ
              ▼
       ┌─────────────┐
       │   OPEN      │ ← ChatModal 表示、入力受付
       └──────┬──────┘
              │ 教員がメッセージ送信
              ▼
       ┌─────────────┐
       │ EXTRACTING  │ ← Bedrock 呼び出し中、loading 表示
       └──────┬──────┘
              │ 抽出結果 (success)
              ▼
       ┌─────────────┐
       │   OPEN      │ ← 候補表示、教員アクション待ち
       │  (with      │
       │  candidates)│
       └──────┬──────┘
              │ ChatModal 閉じ
              │ (未承認 > 0 なら確認ダイアログ → 「閉じる」)
              ▼
       ┌─────────────┐
       │  CLOSED     │ ← セッション終了、未承認は揮発
       │  (volatile) │
       └─────────────┘
```

### 候補 (Candidate) の状態遷移

```
     [AI 抽出]
        ↓
   ┌─────────┐                          ┌──────────┐
   │ pending │ ──── 承認 (approve) ───→ │ approved │ → (kind 別フロー)
   └────┬────┘                          └──────────┘
        │
        ├─── 編集モーダル (edit)
        │         ↓
        │     ┌──────────────┐
        │     │ editing      │
        │     └──────┬───────┘
        │            │ 保存 = 即承認 (BR-CE-17)
        │            ▼
        │     ┌──────────┐
        │     │ approved │ → (kind 別フロー)
        │     └──────────┘
        │
        └─── 棄却 (reject) ───→ ❌ (即消去、DB に何も入らない)

        セッション終了時に pending のまま → ❌ (揮発、DB に何も入らない)
```

## 2. メッセージ抽出フロー

```
教員がチャット欄に入力 → 送信ボタンタップ
        ↓
useChatExtraction.sendMessage(text)
        ↓
1. message を local state に push (UI に即時表示)
2. setIsLoading(true)
3. POST /api/ai-chat/extract { message: text }
        ↓
[API ルート]
   ├── env flag 判定 → OFF なら 404 FEATURE_NOT_ENABLED
   ├── 認証チェック (session から user_id / tenant_id 取得)
   ├── rate limit チェック (UPSERT + count > 50 なら 429)
   └── Lambda invoke (sync)
        ↓
[chat-extraction Lambda]
   ├── piiMasker (送信前 PII マスク)
   ├── Bedrock invoke (Claude Haiku 4.5、ap-northeast-1)
   ├── candidateValidator (Zod schema 検証、2 分類)
   │   ↳ 失敗 → エラー伝搬
   │   ↳ 候補配列 .min(1) で空禁止
   └── 検証済み candidates を返す
        ↓
[API ルート]
   ├── 構造化ログ `ai_chat.extracted` (本文・候補 content 含めない)
   └── レスポンス { candidates: [...] }
        ↓
useChatExtraction
   ├── setCandidates(prev → [...prev, ...newCandidates])
   ├── setIsLoading(false)
   └── 各候補をメッセージ直下に CandidateInlineBubble として表示
```

### 失敗フロー (BR-CE-12)

```
Bedrock タイムアウト or 5xx
        ↓
Lambda が retry (1 回のみ自動)
        ↓
2 回目失敗
        ↓
API: 503 AI_EXTRACTION_UNAVAILABLE 返却
        ↓
useChatExtraction.error に格納
        ↓
UI: メッセージ直下にエラーバブル + 「再試行」ボタン表示
        ↓
教員「再試行」タップ → 同じ message で sendMessage() 再実行
```

## 3. 候補承認フロー (kind 別 / 2 分岐)

```
教員が CandidateInlineBubble の「承認」タップ
        ↓
candidate.kind による分岐:
        │
        ├── kind='task'
        │     ↓
        │   POST /api/tasks (既存 API、body に source_chat_snippet)
        │     ↓
        │   201 → useChatExtraction で candidate を削除 (UI から消える)
        │   ※ mood UI / 温度感コメントは表示しない、即 INSERT
        │
        └── kind='diary'  ← MoodPicker + 温度感コメント
              ↓
            ポップアップ表示:
              ├── 温度感固定コメント (例:「お疲れさま、書いてくれてありがとう。今の気分も教えて」)
              ├── 5 段階絵文字 (😀 🙂 😐 😟 😢)
              ├── (連続承認時) 直前の mood が default 予選択
              └── 「この気分で保存」ボタン (mood 未選択時 disabled)
              ↓
            教員が mood 選択 → 「この気分で保存」タップ
              ↓
            POST /api/journal/entries (body に kind='diary' + mood + content + source_chat_snippet)
              ↓
            201 → candidate 削除
```

### 編集承認フロー (Edit 保存 = 即承認、BR-CE-17)

```
CandidateInlineBubble の「編集」タップ
        ↓
CandidateEditModal 開く (kind 別フォーム)
        │
        ├── kind='task': title / description / dueDate を編集
        └── kind='diary': content を編集
        ↓
教員が編集 → 「保存」ボタンタップ
        │
        ├── kind='task' → 即 DB INSERT (上の承認フロー task と同じ)
        │
        └── kind='diary' → MoodPicker + 温度感コメント ポップアップ
              → 教員 mood 選択 → INSERT (上の承認フロー diary と同じ)
        ↓
モーダル閉じ + candidate 削除
```

### 棄却フロー

```
CandidateInlineBubble の「棄却」(スワイプ or × タップ)
        ↓
useChatExtraction.rejectCandidate(id)
        ↓
candidate を local state から削除
        ↓
構造化ログ `ai_chat.rejected` (id / kind のみ、content 含めない)
        ↓
DB には何も入らない、再表示不可
```

## 4. mood 取得フロー (詳細)

mood UI 表示条件は **kind='diary' の候補承認時のみ** (BR-CE-07)。必須選択。

```
diary 候補 の「承認」または「編集 → 保存」
        ↓
ポップアップ表示 (CandidateEditModal 内 or 独立 dialog):
   ┌────────────────────────────┐
   │ 📓 お疲れさま、              │  ← 温度感固定コメント (静的、AI 生成ではない)
   │    書いてくれてありがとう。  │
   │                              │
   │  今の気分も教えて:           │
   │  😀  🙂  😐  😟  😢         │  ← 5 段階絵文字
   │  ↑ 連続承認時は直前 mood 予選択 │
   │                              │
   │       [この気分で保存]       │  ← mood 未選択時 disabled
   └────────────────────────────┘
        ↓
教員が絵文字選択 (必須、skip 不可)
        ↓
「この気分で保存」タップ → mood 値を candidate に紐付け
        ↓
POST /api/journal/entries (body に kind='diary' + mood + content + source_chat_snippet)
        ↓
journal_entries に INSERT (kind='diary' + mood + content + source_chat_snippet)

【AI 不可侵原則 (BR-CE-06)】
   - AI 出力 schema に mood フィールドは含めない
   - AI は mood を提案しない、推定しない、表示しない
   - 温度感コメントも AI 生成ではなく静的固定文言
   - MoodPicker の value 初期値: 連続承認時 = 直前 mood、初回承認時 = null
```

## 5. Rate Limit フロー (BR-CE-10)

```
POST /api/ai-chat/extract 受信
        ↓
DB: INSERT INTO api_rate_limits (user_id, endpoint, date, count)
    VALUES (..., CURRENT_DATE, 1)
    ON CONFLICT (user_id, endpoint, date)
    DO UPDATE SET count = api_rate_limits.count + 1
    RETURNING count
        ↓
   count > 50?
   ├ Yes → 429 RATE_LIMIT_EXCEEDED 返す (Bedrock は呼ばない、コスト発生ゼロ)
   │       Frontend: 「本日の AI 抽出回数が上限に達しました」表示
   │       チャット入力欄は受付け継続、AI 抽出だけスキップ
   │
   └ No → 次の処理 (Bedrock invoke) へ進む

【日付リセット】
   JST 00:00 を跨ぐと CURRENT_DATE が変わり、新しい (user_id, endpoint, date) 行が
   INSERT され、count が 1 から再カウント開始 (古い行は残置、月次バッチで cleanup)
```

## 6. フィーチャーフラグ判定フロー (BR-CE-11)

```
[Frontend 起動時]
   useChatBubbleFlag() → process.env.NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION
        ↓
   true → ChatBubble マウント (画面右下に常駐表示)
   false → ChatBubble 非マウント (UI 上に存在しない)

[Server 側 (API)]
   POST /api/ai-chat/extract 受信
        ↓
   if (process.env.ENABLE_AI_CHAT_EXTRACTION !== 'true') {
     return res.status(404).json({ error: 'FEATURE_NOT_ENABLED' });
   }
        ↓
   通常処理 (rate limit → Lambda invoke)
```

## 7. セッション終了フロー

```
[ユーザーアクション] 画面離脱 (× / 背景タップ / ESC / ブラウザ戻る / タブ遷移 / リロード)
        ↓
ChatModal の onClose ハンドラ呼び出し
        ↓
   未承認候補 > 0?
   ├ Yes → CloseConfirmDialog 表示
   │       │
   │       ├── 教員「閉じる」確定 → 揮発フロー
   │       └── 教員「戻る」→ ChatModal に戻る (state 保持)
   │
   └ No → 即時揮発フロー

[揮発フロー]
   ├── useChatExtraction.clearSession()
   ├── messages / candidates をすべて空に
   ├── ChatBubble に戻る (CLOSED 状態)
   └── 既に approved 済みのタスク/日誌は失われない (DB に保存済み)

[ブラウザリロード / 強制終了]
   sessionStorage に保持していた state も消失 (BR-CE-09)
   ベストエフォート: 確認ダイアログは出せない (browser API 制限)
```

## 8. 2 分類判定ロジック (プロンプト設計の核)

AI に渡すプロンプトは以下のロジックを実装:

```
入力: 教員のメッセージ (max 2000 字)

判定フロー:
1. このメッセージから「タスクっぽい要素」を抽出
   (未来の行為・期限あり・他者への約束・「〜しなきゃ」「〜する」等の動詞)
   ├ Yes → task 候補を 1+ 抽出 (複数タスク混在も対応、title / description / dueDate)
   └ No → 次へ

2. タスクとして抽出した残り (or タスクが 0 件なら全体) を diary 候補として 1 件抽出
   (content max 200 字、AI が要約・整形しても良いが教員の言葉を尊重)

【絶対ルール】
   - 結果として候補が 0 件になる場合は、メッセージ全体を diary 候補として 1 件返す (BR-CE-04)
   - 1 メッセージから複数 task 候補 + 1 件 diary 候補が同時に出ても良い
   - mood は出力しない (構造的に schema にフィールドなし、BR-CE-06)
   - 温度感コメントは Frontend 側の静的 UI 文言、AI 出力には含めない
```

### 判定例

| 入力メッセージ | task 抽出 | diary 抽出 |
|---|---|---|
| 「保護者連絡しなきゃ」 | 1 件「保護者に連絡」 | 0 件 (タスクで全部拾える) |
| 「保護者連絡しなきゃ、運動会の準備もある」 | 2 件 | 0 件 |
| 「○○さん今日元気なかった、明日声かけよう」 | 1 件「明日 ○○ さんに声かけ」 | 1 件「○○さん今日元気なかった」 |
| 「6 年 1 組頑張ってた」 | 0 件 | 1 件「6 年 1 組頑張ってた」(default diary) |
| 「コーヒー切れた」 | 0 件 | 1 件「コーヒー切れた」(default diary) |

## 9. 状態管理サマリー

| State 名 | 配置 | 永続化 | リセット契機 |
|---|---|---|---|
| ChatSession (messages / candidates) | useChatExtraction hook (memory) | なし | セッション終了 / リロード |
| isLoading | useChatExtraction hook (memory) | なし | 抽出完了 / 失敗 |
| error | useChatExtraction hook (memory) | なし | 次のメッセージ送信 / 手動 retry |
| isOpen (ChatModal) | 親 component (state lift up or context) | なし | onClose 呼び出し |
| 直前 mood (連続承認用) | useChatExtraction hook (memory) | なし | セッション終了 |
| 承認済み Task / JournalEntry | tasks / journal_entries テーブル | あり (永続) | DB レコード削除のみ |
| Rate limit カウント | api_rate_limits テーブル | あり (永続) | JST 00:00 で新しい日付行 |
| Feature flag | 環境変数 | 環境固定 | AppRunner 再起動 |

## 参照
- ビジネスルール: `business-rules.md` (同階層)
- ドメインエンティティ: `domain-entities.md` (同階層)
- Frontend コンポーネント: `frontend-components.md` (同階層)
- アプリケーション設計: `aidlc-docs/inception/application-design/2026-05-11-ai-chat-extraction-design.md`
