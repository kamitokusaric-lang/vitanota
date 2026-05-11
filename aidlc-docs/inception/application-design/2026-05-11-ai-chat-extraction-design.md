# 2026-05-11 AI 連携第一弾 — アプリケーション設計

> **対応要件**: [`inception/requirements/2026-05-11-ai-chat-extraction.md`](../requirements/2026-05-11-ai-chat-extraction.md)
> **対応ストーリー**: [`inception/user-stories/2026-05-11-ai-chat-extraction-stories.md`](../user-stories/2026-05-11-ai-chat-extraction-stories.md)
> **対応プラン**: [`inception/plans/2026-05-11-ai-chat-extraction-plan.md`](../plans/2026-05-11-ai-chat-extraction-plan.md)
> **作成日**: 2026-05-11
> **位置付け**: 既存 vitanota への新規 Unit-05 (AI 連携) 追加。既存 UX は無影響、新規 components + Lambda + API のみで完結

## 設計方針

- **既存パターンに合わせる**: RLS は `migrations/0009_rls_role_separation.sql` の 4 ロール体制を踏襲、新規 RLS は追加せず既存 tasks / journal_entries の RLS を流用
- **既存 UX 無影響**: 既存 TaskBulkCreateForm / 日誌画面 / タスク作成 API は一切触らない (memory: リスク対称性、revert 可能性)
- **新規 DB テーブルなし**: `tasks` / `journal_entries` (該当テーブル) に `source_chat_snippet` カラム追加のみ (5/2 セッションより大幅にシンプル)
- **フィーチャーフラグ**: 環境変数 `ENABLE_AI_CHAT_EXTRACTION` で UI / API / Lambda 呼び出しを統合制御
- **mood AI 不可侵**: Bedrock プロンプトの output schema に mood フィールドを含めない (物理的に AI が触れない設計)
- **観測者原則**: chat メッセージは DB 永続化しない、変換時 source_chat_snippet だけが本人のタスク/日誌に紐づく

---

## コンポーネント階層 (Frontend)

```
Dashboard Layout (既存)
  └─ <ChatBubble> [env flag で表示制御] ★ 新規
       └─ <ChatModal> ★ 新規
            ├─ useChatExtraction (hook) ★ 新規
            │     └─ POST /api/ai-chat/extract → chatExtractionLambda → Bedrock
            ├─ <MessageList> ★ 新規
            │     └─ <MessageBubble> (送信メッセージ・システム応答) ★ 新規
            ├─ <CandidateInlineBubble> (タスク候補 / 日誌候補) ★ 新規
            │     └─ <CandidateEditModal> ★ 新規
            │          └─ <MoodPicker> (日誌の場合のみ) ★ 新規
            ├─ <UnconfirmedPanel> ★ 新規
            └─ <CloseConfirmDialog> (未承認候補がある時のみ) ★ 新規
```

## 画面構成 (主要)

### 1. フローティングバブル (常時表示)

```
画面右下 (固定位置、すべての教員ダッシュボード画面に常時表示)

   ┌────────┐
   │   💬   │  ← <ChatBubble>
   └────────┘  px サイズ: 56x56、丸ボタン
```

- env flag OFF 時: 非表示
- env flag ON 時: 表示、teacher / school_admin のみ (system_admin にも表示するが対象は本人テナント)
- アクセシビリティ: `aria-label="AI チャットで書き散らす"`、キーボードフォーカス可

### 2. ChatModal (タップ後)

#### モバイル (full-height bottom sheet)

```
┌────────────────────────────────────┐
│ AI チャット             [未確認 (2)] [×]│  ← ヘッダー
├────────────────────────────────────┤
│                                    │
│  あなた: 保護者連絡しなきゃ          │
│  ┌─────────────────────────────┐ │
│  │ 📋 タスク候補               │ │
│  │ 「保護者に連絡」            │ │
│  │ [承認] [編集] [棄却]         │ │  ← CandidateInlineBubble
│  └─────────────────────────────┘ │
│                                    │
│  あなた: ○○さん今日元気なかった、    │
│         明日声かけよう              │
│  ┌─────────────────────────────┐ │
│  │ 📋 タスク候補               │ │
│  │ 「明日 ○○ さんに声かけ」    │ │
│  │ [承認] [編集] [棄却]         │ │
│  └─────────────────────────────┘ │
│  ┌─────────────────────────────┐ │
│  │ 📓 日誌候補                  │ │
│  │ 「○○さん今日元気なかった」  │ │
│  │ [承認] [編集] [棄却]         │ │
│  └─────────────────────────────┘ │
│                                    │
├────────────────────────────────────┤
│ ┌──────────────────────────┬──┐ │
│ │ 思いついたことを書き散らす…│送│ │  ← 入力欄
│ └──────────────────────────┴──┘ │
└────────────────────────────────────┘
```

#### PC (中央モーダル、幅 480px)

- レイアウトは同じ、高さは可変 (max-height: 80vh、スクロール対応)

### 3. CandidateEditModal (タップで開く編集モーダル)

```
┌────────────────────────────────────┐
│ タスク候補を編集            [×]    │
├────────────────────────────────────┤
│ タイトル:                          │
│ [保護者に連絡_____________________]│
│                                    │
│ 説明 (任意):                       │
│ [_______________________________] │
│                                    │
│ 期限 (任意):                       │
│ [2026-05-12 ▼]                    │
│                                    │
│ 元のメッセージ: 「保護者連絡しなきゃ」│
│                                    │
│         [キャンセル] [承認して保存] │
└────────────────────────────────────┘
```

日誌候補の場合は + MoodPicker:

```
┌────────────────────────────────────┐
│ 日誌候補を編集              [×]    │
├────────────────────────────────────┤
│ 本文:                              │
│ [○○さん今日元気なかった________] │
│ [_______________________________] │
│                                    │
│ 気分 (任意、選んでみよう):          │
│  😀  🙂  😐  😟  😢                │  ← MoodPicker (5 段階)
│ (どれも選ばない: あとで日誌画面で)  │
│                                    │
│ 元のメッセージ: 「○○さん今日…」    │
│                                    │
│         [キャンセル] [承認して保存] │
└────────────────────────────────────┘
```

### 4. UnconfirmedPanel (ヘッダー「未確認 (N)」タップ)

```
┌────────────────────────────────────┐
│ 未確認の候補 (2 件)         [×]    │
├────────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 📋 タスク候補                │ │
│ │ 「保護者に連絡」             │ │
│ │ [承認] [編集] [棄却]         │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ 📓 日誌候補                  │ │
│ │ 「○○さん今日元気なかった」 │ │
│ │ [承認] [編集] [棄却]         │ │
│ └─────────────────────────────┘ │
└────────────────────────────────────┘
```

### 5. CloseConfirmDialog (閉じる時に未承認あり)

```
┌────────────────────────────────────┐
│ 確認                               │
├────────────────────────────────────┤
│ 未確認候補が 2 件あります。         │
│ 閉じると消えます (再表示できません)。 │
│                                    │
│             [戻る] [閉じる]        │
└────────────────────────────────────┘
```

---

## コンポーネント定義 (詳細)

### `<ChatBubble>` (新規)

| 項目 | 内容 |
|---|---|
| 配置 | 共通 Layout (`src/components/Layout.tsx` 等、既存) に追加マウント |
| 表示条件 | env flag ON + 認証済み (teacher / school_admin / system_admin) |
| 状態 | none (常駐) |
| props | なし |
| 主要 hook | `useChatBubbleFlag()` (env flag 判定) |
| アクション | onClick → `<ChatModal>` を開く (state lift up or context) |

### `<ChatModal>` (新規)

| 項目 | 内容 |
|---|---|
| 状態 | open/closed (親管理)、messages: ChatMessage[]、candidates: Candidate[] |
| props | `isOpen: boolean, onClose: () => void` |
| 主要 hook | `useChatExtraction()` (セッション state 統括) |
| 主要子 component | MessageList / CandidateInlineBubble / UnconfirmedPanel |
| アクション | message 送信 / 候補承認 / 棄却 / モーダル閉じ |
| キーボード | ESC で閉じる、Cmd+Enter で送信 (PC) |
| モバイル | iOS Safari の viewport 100vh ジャンプ対策 (CSS dynamic-viewport-height 使用) |

### `<CandidateInlineBubble>` (新規)

| 項目 | 内容 |
|---|---|
| props | `candidate: Candidate, onApprove, onEdit, onReject` |
| バリアント | task / journal の 2 種、視覚的アイコン差別化 (📋 / 📓) |
| ジェスチャ | タップ (デフォルト承認) / 長押し (編集) / スワイプ (棄却)、PC では明示ボタン併設 |

### `<CandidateEditModal>` (新規)

| 項目 | 内容 |
|---|---|
| props | `candidate: Candidate, onSave, onCancel` |
| task の場合 | title / description / due_date 編集可 |
| journal の場合 | content 編集可 + `<MoodPicker>` 表示 (任意選択) |
| 共通 | source_chat_snippet は read-only 表示 (編集不可) |

### `<MoodPicker>` (新規)

| 項目 | 内容 |
|---|---|
| props | `value: Mood \| null, onChange: (mood: Mood) => void` (mood 必須化に伴い null 戻し UX 簡略化) |
| 表示 | 5 段階絵文字 (😀 🙂 😐 😟 😢)、各ボタン tap で選択 |
| **表示条件** | **kind='diary' の候補承認時のみ表示** (task では非表示、即 INSERT) |
| **温度感コメント** | MoodPicker と一緒に静的固定文言 (例: 「お疲れさま、書いてくれてありがとう。今の気分も教えて」) を表示 (AI 生成ではない、踏み絵セーフ) |
| **必須化** | mood 選択は必須 (chimo 確定 2026-05-11、既存 diary 仕様踏襲)、保存ボタンは mood 選択前は disabled |
| 連続承認時 | 直前の mood が default 予選択 (ワンタップ承認可、変更可) |
| **重要** | AI からの提案や推定値は **絶対に注入しない** (memory: mood AI 不可侵原則)、初期値は **常に null** (連続承認時の直前値以外で予選択しない) |

### `<UnconfirmedPanel>` (新規)

| 項目 | 内容 |
|---|---|
| props | `candidates: Candidate[], onApprove, onEdit, onReject` |
| 開閉トリガ | ヘッダーの「未確認 (N)」アイコンタップ |
| バッジ | N は未承認候補数、0 ならアイコン非表示 |

### `<CloseConfirmDialog>` (新規)

| 項目 | 内容 |
|---|---|
| 表示条件 | ChatModal 閉じる前 AND 未承認候補 > 0 |
| アクション | 「閉じる」確定 → 未承認候補揮発、「戻る」→ ChatModal に残る |

---

## Hooks (Frontend)

### `useChatExtraction()` (新規)

| 項目 | 内容 |
|---|---|
| 配置 | `src/features/ai-chat/hooks/useChatExtraction.ts` |
| 状態 | `messages: ChatMessage[], candidates: Candidate[], isLoading: boolean, error?` |
| 永続化 | なし (セッションメモリのみ、リロードで消える) |
| 主要 method | `sendMessage(text: string), approveCandidate(id), rejectCandidate(id), editCandidate(id, updates), clearSession()` |
| 内部 | sendMessage 内で POST /api/ai-chat/extract、応答を candidates に追加 |
| エラー処理 | Bedrock 失敗時は 1 回 retry、それでも失敗ならエラー候補として message に紐づけ |

### `useChatBubbleFlag()` (新規)

| 項目 | 内容 |
|---|---|
| 配置 | `src/features/ai-chat/hooks/useChatBubbleFlag.ts` |
| 内容 | env 変数 `NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION` を判定 (Frontend 用) |
| 返却 | `boolean` (true なら ChatBubble を表示) |

**注**: env 変数は build 時に Next.js が `NEXT_PUBLIC_` プレフィックスで client bundle に埋め込む。Server side は `ENABLE_AI_CHAT_EXTRACTION` (プレフィックスなし) を別途参照、API ルートで判定。

---

## サービス (Backend / Lambda)

### `chatExtractionService` (新規・Lambda 内)

| 項目 | 内容 |
|---|---|
| 配置 | `infra/lib/lambdas/chat-extraction/src/services/chatExtractionService.ts` |
| 責務 | Bedrock 呼び出し orchestration、プロンプト管理、出力検証 |
| 主要 method | `extract(message: string, userId: string, tenantId: string): Promise<ExtractionResult>` |
| 内部フロー | piiMasker → Bedrock invoke → candidateValidator → 結果整形 |
| エラー | Bedrock タイムアウト / 5xx は呼び出し元に伝搬 (API ルートで retry) |

### `piiMasker` (新規・Lambda 内)

| 項目 | 内容 |
|---|---|
| 責務 | 送信前の明らかな PII (email / 電話番号) 簡易マスキング |
| 注意 | 完全ではない、運用ガイドラインで補完 (NFR-CE-06) |
| 実装 | 正規表現ベース、過剰マスクしない (氏名等は対象外) |

### `candidateValidator` (新規・Lambda 内)

| 項目 | 内容 |
|---|---|
| 責務 | Bedrock 出力の構造化検証 (Zod schema)、2 分類対応 (chimo 確定 2026-05-11) |
| 入力 schema | Claude 出力 (JSON) |
| 出力 schema | `Candidate[]` — 2 分類対応、空配列禁止 (最低 1 件、AC-CE-08) |
| **重要 1** | output schema に `mood` フィールドは含めない (AI からの推定値を構造的に受け取らない、踏み絵厳守) |
| **重要 2** | 2 分類: `kind: 'task' \| 'diary'`、AI が判定不能なら **default diary** で 1 件返す |
| **重要 3** | 文字数上限を Zod で enforce: task.title 200 / task.description 2000 / diary.content 200 |
| **重要 4** | knowledge / tweet は AI 抽出経由では作らない、教員が手動 EntryForm から投稿する経路で対応 |

**Candidate 型 (Zod 定義イメージ)**:

```typescript
const TaskCandidateSchema = z.object({
  kind: z.literal('task'),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().date().optional(),
  sourceChatSnippet: z.string().min(1).max(500),
});

const DiaryCandidateSchema = z.object({
  kind: z.literal('diary'),
  content: z.string().min(1).max(200),
  sourceChatSnippet: z.string().min(1).max(500),
  // mood フィールドは含めない (AI 不可侵)
});

const CandidateSchema = z.discriminatedUnion('kind', [
  TaskCandidateSchema,
  DiaryCandidateSchema,
]);

const ExtractionResultSchema = z.object({
  candidates: z.array(CandidateSchema).min(1),  // 空配列禁止、最低 1 件
});
```

### `rateLimit` (新規・API ルート内) — 確定 (2026-05-11)

| 項目 | 内容 |
|---|---|
| 配置 | `src/lib/rateLimit.ts` (新規) |
| 責務 | **教員 (user_id) ごと 1 日 50 回上限** (暫定、機能設計で具体値確認) |
| 粒度 | 教員ごと (user_id ベース)、テナント単位は採用しない (現状規模では教員 × 50 の自然上限で十分) |
| 実装 | **PostgreSQL ベース** (既存 RDS、新規テーブル `api_rate_limits` 追加) |
| アルゴリズム | **Fixed Window** (日次リセット、JST 00:00 で新しい date 行) |
| 原子性 | `INSERT ... ON CONFLICT UPDATE count = count + 1 RETURNING count` で原子的 increment |
| 超過時 | 429 RATE_LIMIT_EXCEEDED 返す、UI はチャット入力は受付け継続するが AI 抽出スキップ (平文表示) |
| テナント全体予算保護 | rate limit ではなく **CloudWatch メトリクス + アラート** で運営観測 (運営 chimo が判断材料として参照) |

---

## API シグネチャ

### `POST /api/ai-chat/extract`

**Request**:
```json
{
  "message": "保護者連絡しなきゃ、運動会の準備もある"
}
```

**Response 200**:
```json
{
  "candidates": [
    {
      "id": "client-side uuid",
      "type": "task",
      "title": "保護者に連絡",
      "description": null,
      "dueDate": null,
      "sourceChatSnippet": "保護者連絡しなきゃ"
    },
    {
      "id": "client-side uuid",
      "type": "task",
      "title": "運動会の準備",
      "description": null,
      "dueDate": null,
      "sourceChatSnippet": "運動会の準備もある"
    }
  ]
}
```

**Response 429** (レート制限):
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "limit": 50,
  "resetAt": "2026-05-12T00:00:00+09:00"
}
```

**Response 503** (Bedrock 障害):
```json
{
  "error": "AI_EXTRACTION_UNAVAILABLE",
  "retryable": true
}
```

**Response 404** (フラグ OFF):
```json
{ "error": "FEATURE_NOT_ENABLED" }
```

**権限**: 認証済み + (teacher / school_admin / system_admin)、middleware で既存パターン流用
**送信先**: API ルートが Lambda invoke (同期)、Lambda が Bedrock invoke
**ログ**: 構造化ログ `ai_chat.extracted` / `ai_chat.failed` (本文は含めない、NFR-CE-14)

### 既存 API の流用 (チャット承認時)

承認時、Frontend は既存の API を呼ぶ:
- **タスク承認**: `POST /api/tasks` (既存) を呼び出し、body に `sourceChatSnippet` を含める
- **日誌承認**: `POST /api/journal/entries` 等 (該当する既存 API) を呼び出し、body に `sourceChatSnippet` を含める

既存 API ハンドラ側を:
- Zod schema に `sourceChatSnippet: z.string().optional()` 追加
- Repository / Service に source_chat_snippet を渡す
- DB INSERT 時にカラム値として保存

---

## DB スキーマ拡張

### 新規 migration: `migrations/00XX_chat_extraction_source_columns.sql`

```sql
-- tasks に source_chat_snippet 追加 (NULL 許可、既存行は NULL 残置)
ALTER TABLE tasks ADD COLUMN source_chat_snippet TEXT;

-- journal_entries (該当テーブル名) に source_chat_snippet 追加
-- 注: テーブル名は既存スキーマに合わせて確定 (機能設計時に確認)
ALTER TABLE journal_entries ADD COLUMN source_chat_snippet TEXT;

-- CHECK 制約 (任意): 長さ上限 (例: 500 文字)、機能設計で確定
-- ALTER TABLE tasks ADD CONSTRAINT tasks_source_chat_snippet_length CHECK (char_length(source_chat_snippet) <= 500);
-- ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_chat_snippet_length CHECK (char_length(source_chat_snippet) <= 500);
```

**ポイント**:
- 既存テーブル変更は **NULL 許可カラム追加のみ** → 後方互換、ロックほぼゼロ
- 既存 RLS ポリシーは無変更 (source_chat_snippet も owner / assignees の所有物として RLS で保護)
- 既存クエリは無影響 (新カラムを参照しない既存コードは何も変わらない)

### Drizzle schema 更新 (`src/db/schema.ts`)

```typescript
export const tasks = pgTable('tasks', {
  // 既存カラム...
  sourceChatSnippet: text('source_chat_snippet'),  // 追加
});

export const journalEntries = pgTable('journal_entries', {
  // 既存カラム...
  sourceChatSnippet: text('source_chat_snippet'),  // 追加
});
```

---

## ER 差分図

```
                ┌──────────┐
                │ tenants  │
                └────┬─────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
      ┌──────┐  ┌────────┐  ┌──────────────────┐
      │users │  │ tasks  │  │ journal_entries  │
      └──┬───┘  ├────────┤  ├──────────────────┤
         │      │ ...    │  │ ...              │
         │      │ +source_chat_snippet TEXT NULL│ ← 追加カラム
         │      └────────┘  │ +source_chat_snippet TEXT NULL │ ← 追加カラム
         │                  └──────────────────┘
         └────── (FK 関係は既存通り)
```

**ポイント**: 新規テーブルなし、新規 FK なし、新規 index は機能設計で必要なら追加 (検索系の要件が出れば)

---

## サービス間データフロー

```
教員が ChatBubble タップ
        ↓
   <ChatModal> 起動
        ↓
教員がメッセージ送信
        ↓
useChatExtraction.sendMessage()
        ↓ HTTP POST
/api/ai-chat/extract
        ├── env flag 判定 (OFF → 404)
        ├── 認証チェック (teacher / school_admin / system_admin)
        ├── rateLimit チェック (超過 → 429)
        │
        ↓ Lambda invoke (sync)
chatExtractionLambda
        ├── piiMasker (PII 簡易マスク)
        ├── Bedrock invoke (Claude モデル、ap-northeast-1)
        ├── candidateValidator (Zod schema 検証)
        │   ※ output schema に mood なし → AI は構造的に mood を提案できない
        │
        ↓ レスポンス (candidates: Candidate[])
useChatExtraction が candidates を state に追加
        ↓
<CandidateInlineBubble> 各候補表示
        ↓ 教員が「承認」
        │
        ├─ タスク候補 → POST /api/tasks (既存 API、sourceChatSnippet 付き)
        └─ 日誌候補 → <MoodPicker> 表示 → 教員が mood 選択 (or スキップ)
                    → POST /api/journal/entries 等 (既存 API、sourceChatSnippet + mood 付き)
        ↓
tasks / journal_entries テーブルに INSERT
        ↓
候補が ChatModal から消える、未承認は <UnconfirmedPanel> に積まれる
        ↓
教員が ChatModal 閉じる
        ├─ 未承認 > 0 → <CloseConfirmDialog> 表示 → 確定で揮発
        └─ 未承認 = 0 → 即閉じる
```

---

## 既存ファイルへの影響まとめ

| ファイル | 変更内容 | 影響範囲 |
|---|---|---|
| `src/db/schema.ts` | `tasks.sourceChatSnippet` / `journal_entries.sourceChatSnippet` 追加 | スキーマ拡張 (後方互換) |
| `src/components/Layout.tsx` (共通) | `<ChatBubble>` マウント (env flag で条件付き) | UI |
| `pages/api/tasks/index.ts` (既存 POST) | body schema に `sourceChatSnippet?` 追加、INSERT 時 pass-through | 既存 API 拡張 (後方互換) |
| `pages/api/journal/entries/...` (該当の既存 API) | 同上 | 同上 |
| `src/features/tasks/repository/...` | INSERT で source_chat_snippet を含める | 既存 Repository 拡張 |
| `src/features/journal/repository/...` | 同上 | 同上 |

**変更しないもの**:
- 既存 TaskBulkCreateForm / TaskForm / 日誌作成画面 (一切無影響)
- 既存 RLS ポリシー (sourceChatSnippet も既存 RLS の保護下に入る)
- 既存タスク作成 / 日誌作成のロジック (新カラムを使わない既存コードは何も変わらない)

## 新規ファイル一覧

| ファイル | 用途 |
|---|---|
| `migrations/00XX_chat_extraction_source_columns.sql` | DB スキーマ拡張 |
| `pages/api/ai-chat/extract.ts` | API ルート (Lambda invoke orchestration) |
| `src/schemas/aiChat.ts` | Zod schemas (request / response / Candidate type) |
| `src/features/ai-chat/components/ChatBubble.tsx` | フローティングバブル |
| `src/features/ai-chat/components/ChatModal.tsx` | モーダル/シート本体 |
| `src/features/ai-chat/components/MessageList.tsx` | メッセージ履歴表示 |
| `src/features/ai-chat/components/MessageBubble.tsx` | 個別メッセージ表示 |
| `src/features/ai-chat/components/CandidateInlineBubble.tsx` | 候補インライン表示 |
| `src/features/ai-chat/components/CandidateEditModal.tsx` | 候補編集モーダル |
| `src/features/ai-chat/components/MoodPicker.tsx` | 5 段階絵文字ピッカー |
| `src/features/ai-chat/components/UnconfirmedPanel.tsx` | 未承認候補別パネル |
| `src/features/ai-chat/components/CloseConfirmDialog.tsx` | 閉じる時の確認 |
| `src/features/ai-chat/hooks/useChatExtraction.ts` | セッション state 管理 |
| `src/features/ai-chat/hooks/useChatBubbleFlag.ts` | env flag 判定 |
| `src/lib/rateLimit.ts` (新規 or 既存拡張) | レート制限 |
| `infra/lib/lambdas/chat-extraction/` (ディレクトリ) | Lambda 実装本体 |
| `infra/lib/lambdas/chat-extraction/src/handler.ts` | Lambda エントリ |
| `infra/lib/lambdas/chat-extraction/src/services/chatExtractionService.ts` | Bedrock orchestration |
| `infra/lib/lambdas/chat-extraction/src/services/piiMasker.ts` | PII マスク |
| `infra/lib/lambdas/chat-extraction/src/services/candidateValidator.ts` | 出力検証 |
| `infra/lib/lambdas/chat-extraction/src/prompts/extraction.ts` | プロンプトテンプレート |
| `infra/lib/ai-chat-stack.ts` (新規 stack、確定 2026-05-11) | CDK 定義: Lambda + Bedrock IAM policy + Secrets Manager + CloudWatch メトリクス。Unit-05 専用 stack、後続機能 (リマインド・週次ふりかえり・抱えすぎ) も同 stack に集約予定。app-stack との依存は SSM Parameter Store / Secrets Manager 経由で疎結合化 (CloudFormation export/import は使わない) |
| `migrations/00YY_api_rate_limits.sql` (新規) | api_rate_limits テーブル (user_id, endpoint, date, count)、Fixed Window 方式の日次リセット |

---

## 踏み絵防御の設計上の保証

| 観点 | 設計上の保証 |
|---|---|
| AI = 観測装置になっていない | API はメッセージごとに本人 user_id のもとで実行、候補は本人にしか見えない (NFR-CE-15)。CloudWatch メトリクスは集計値のみ、個人指標は管理者にも見せない |
| mood の AI 不可侵 | candidateValidator の output schema に **mood フィールド自体を含めない**、AI が mood を返しても捨てる構造。Frontend MoodPicker は教員 input のみ受け付け、AI からの提案 prop なし |
| メンタルケア SaaS 化していない | 抽出結果は title / content / due_date のみ、感情分析・診断・推奨は構造的に出ない |
| 観測されてる感覚を発生させない | チャットメッセージは DB 永続化なし (AC-CE-20)、変換時 source_chat_snippet だけが本人のタスク/日誌の所有物として既存 RLS の保護下に入る |
| Knowledge Tool 寄せに逸れていない | 検索・分類 SaaS ではなく、入力フリクション解消の追加経路。既存 TaskBulkCreateForm / 日誌画面は無影響で残置 |

---

## インフラ設計補足 (chimo と合意済み 2026-05-11)

### CDK Stack 構成: 新規 `ai-chat-stack`
- Unit-05 (AI 連携) 専用の独立 stack として新設、既存 5 stack (foundation / data-shared / data-core / app / edge) に追加
- 含むリソース: chat-extraction Lambda + Bedrock IAM policy + Secrets Manager (Bedrock 設定) + CloudWatch メトリクス
- app-stack との依存は **SSM Parameter Store / Secrets Manager 経由** で疎結合化 (CloudFormation export/import は使わない)
- 後続機能 (リマインド / 週次ふりかえり / 抱えすぎ) も同 stack に集約予定
- 緊急停止時は `cdk destroy vitanota-prod-ai-chat` で AI 関連を一括削除可、既存 vitanota は無影響

**選択根拠**: デプロイ独立性 / 失敗影響範囲の局所化 / Unit-05 戦略との整合 / 後続機能拡張性 / 緊急停止のオペレーション性、5 軸中 4 軸が別 stack 寄り。

### Rate Limit: 教員ごと + 監視アラート併用
- **Hard limit**: 教員ごと (user_id) 50 回/日、PostgreSQL ベース Fixed Window
- **Soft monitoring**: テナント月次合計を CloudWatch メトリクスで観測、しきい値超えで運営 chimo にアラート (rate limit ではなく運営判断のシグナル)
- 二重制限 (教員 + テナント) は採用しない → 教員 × 50 の自然上限で現状規模 (教員 25 名 × 50 回/日 = 約 234 円/日/校、月 7,000 円以内) は十分対応可
- 将来「学校契約モデルで月固定料金売る」運営判断が出たら、テナント rate limit を C (二重制限) として追加可

**選択根拠**: 教員間の公平性 / 現状規模の妥当性 / 実装シンプル / 将来の拡張余地確保。

## 参照

- 要件: [`inception/requirements/2026-05-11-ai-chat-extraction.md`](../requirements/2026-05-11-ai-chat-extraction.md)
- ストーリー: [`inception/user-stories/2026-05-11-ai-chat-extraction-stories.md`](../user-stories/2026-05-11-ai-chat-extraction-stories.md)
- 実装プラン: [`inception/plans/2026-05-11-ai-chat-extraction-plan.md`](../plans/2026-05-11-ai-chat-extraction-plan.md)
- 既存 RLS パターン: `migrations/0009_rls_role_separation.sql`
- 既存タスクスキーマ: `migrations/0014_unit05_task_core.sql`
- 既存 application-design 正本: [`application-design.md`](application-design.md)
- 5/2 設計参考: [`2026-05-07-meeting-features-design.md`](2026-05-07-meeting-features-design.md)
