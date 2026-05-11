# Unit-05 (AI 連携) — ドメインエンティティ

> **対応要件**: [`inception/requirements/2026-05-11-ai-chat-extraction.md`](../../../inception/requirements/2026-05-11-ai-chat-extraction.md)
> **作成日**: 2026-05-11
> **改訂**: 2026-05-11 (2 分類化)
> **技術非依存**: ビジネスドメインのエンティティを述べる

## 1. 新規エンティティ (Unit-05 固有)

### 1.1 ChatMessage (一過性、メモリのみ)

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | UUID | ✓ | client-side で生成、識別子 |
| `text` | string (max 2000) | ✓ | 教員入力本文 |
| `sender` | enum: `'user' \| 'system'` | ✓ | メッセージ発信者 (system はエラー等の case で使用) |
| `timestamp` | ISO datetime | ✓ | 送信時刻 (client 時刻) |
| `extractionStatus` | enum: `'idle' \| 'loading' \| 'success' \| 'failed'` | ✓ | 抽出処理の状態、UI 表示制御に使用 |

**永続化**: なし (sessionStorage / メモリのみ、BR-CE-09)
**ライフサイクル**: ChatSession 開始時に作成、セッション終了で揮発

### 1.2 Candidate (一過性、メモリのみ) — 2 サブタイプ

共通フィールド:

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | UUID | ✓ | client-side で生成 |
| `kind` | enum: `'task' \| 'diary'` | ✓ | 候補種別 (discriminator、2 分類) |
| `sourceChatSnippet` | string (max 500) | ✓ | 元メッセージの抜粋、BR-CE-08 |
| `status` | enum: `'pending' \| 'editing' \| 'approved' \| 'rejected'` | ✓ | 状態遷移 (memory) |
| `messageId` | UUID | ✓ | 紐づく ChatMessage の id |

#### 1.2.1 TaskCandidate

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `kind` | `'task'` | ✓ | |
| `title` | string (1〜200) | ✓ | AI 生成 |
| `description` | string (max 2000) | - | AI 生成 (任意) |
| `dueDate` | ISO date | - | AI 推定 (任意) |

#### 1.2.2 DiaryCandidate

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `kind` | `'diary'` | ✓ | |
| `content` | string (1〜200) | ✓ | AI 生成 (既存 `journal_entries` の diary 文字数仕様踏襲) |
| `mood` | enum (5 段階) | - | **AI からは null**、教員が承認時に MoodPicker で選択 (BR-CE-06 / 07)。承認時必須 (BR-CE-07) |

**永続化**: なし (メモリのみ、承認時に別エンティティ Task / JournalEntry に変換されて永続化)
**ライフサイクル**: AI 抽出時に作成、承認 → 削除 / 棄却 → 削除 / セッション終了 → 揮発

**注**: 既存 vitanota の `journal_entries.kind` enum は 3 種別 (`diary | knowledge | tweet`) だが、**AI 抽出経由では diary のみ生成**。knowledge / tweet は教員が手動 EntryForm から作成する経路で対応 (棲み分け、memory `project_journal_kind_model.md`)。

### 1.3 ChatSession (一過性、メモリのみ)

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `messages` | `ChatMessage[]` | ✓ | このセッションのメッセージ履歴 |
| `candidates` | `Candidate[]` | ✓ | このセッションの抽出候補 (pending / editing 状態のもの) |
| `unconfirmedCount` | number (派生) | ✓ | `candidates.filter(c => c.status === 'pending' \|\| c.status === 'editing').length` |
| `lastSelectedMood` | Mood \| null | - | 連続 diary 承認時の default 予選択用 |
| `isLoading` | boolean | ✓ | 抽出処理中フラグ |
| `error` | string \| null | - | 最後のエラー (再試行 UI 制御に使用) |

**永続化**: なし
**境界**: ChatBubble タップ で開始、ChatModal 閉じ で終了 (BR-CE-18)

### 1.4 ApiRateLimit (永続、DB)

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `user_id` | UUID (FK → users.id) | ✓ | 教員 ID |
| `endpoint` | TEXT | ✓ | API endpoint パス (例: `/api/ai-chat/extract`) |
| `date` | DATE | ✓ | JST 日付 (Fixed Window の単位) |
| `count` | INTEGER | ✓ | 当日の呼出回数 |

**PRIMARY KEY**: (user_id, endpoint, date)
**永続化**: あり (永続)、月次バッチで古い行 cleanup (例: date < CURRENT_DATE - 90)
**用途**: BR-CE-10 (Rate Limit)、将来は他 endpoint への横展開も可能

## 2. 既存エンティティへの追加 (非破壊カラム)

### 2.1 Task (既存 `tasks` テーブル)

追加カラム:

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `source_chat_snippet` | TEXT (max 500) | - | チャット抽出経由で作成された場合の元メッセージ抜粋 |

**ポイント**:
- NULL 許可、既存行は NULL 残置 (後方互換)
- 既存 RLS ポリシーで保護下に入る (本人の assignees のみアクセス可)
- 既存 INSERT 経路 (TaskBulkCreateForm / TaskForm) では NULL のまま

### 2.2 JournalEntry (既存 `journal_entries` テーブル)

追加カラム:

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `source_chat_snippet` | TEXT (max 500) | - | 同上 |

**既存カラム** (Unit-05 が利用):
- `kind` (既存 enum: `'diary' \| 'knowledge' \| 'tweet'`、default `'diary'`)
  - **AI 抽出経由では常に `kind='diary'`** で INSERT
  - knowledge / tweet は手動 EntryForm 経由のみ
- `content` (既存、diary の場合 200 字制限)
- `mood` (既存、diary で必須)
- `user_id` / `tenant_id` / `created_at` / etc. (既存)

**Unit-05 はこれらの既存仕様を踏襲する、新規カラム追加は `source_chat_snippet` のみ**

## 3. エンティティ関係性 (ASCII 図)

```
[ ChatSession ]──────────1:N──────────[ ChatMessage ]
       │                                      │
       │                                      │ 1:1 (sourceChatMessage)
       │                                      ▼
       │                              [ Candidate ] ─────discriminator: kind (2 値)
       │ 1:N                              │ │
       │                                  │ └── DiaryCandidate (kind='diary', mood は教員選択)
       │                                  └──── TaskCandidate (kind='task')
       │                                      │
       │                          [承認時に変換]
       │                                      │
       │                          ┌───────────┴───────────┐
       │                          │                       │
       │                          ▼                       ▼
       │                  ┌──────────────┐       ┌────────────────┐
       │                  │     Task     │       │  JournalEntry  │
       │                  │  (既存)      │       │  (既存)         │
       │                  │  + source_   │       │  + source_     │
       │                  │  chat_snippet│       │  chat_snippet  │
       │                  └──────────────┘       │  ※ kind='diary'│
       │                                          │     mood 必須   │
       │                                          └────────────────┘
       │
       │ (rate limit は別系統、Session に紐付かない、user_id ベース)
       │
       └─── 教員 (User) ── 1:N ── ApiRateLimit (date 単位)
```

## 4. データ寿命の整理

| エンティティ | 寿命 | 説明 |
|---|---|---|
| ChatMessage | セッション内 (揮発) | リロード / モーダル閉じで消える |
| Candidate (pending / editing) | セッション内 (揮発) | 同上、未承認は揮発 |
| Candidate (approved) | 変換時に消える | 変換先 (Task / JournalEntry) に source_chat_snippet が残る形で永続化 |
| Candidate (rejected) | 即時消去 | DB に何も残らない、ログも `ai_chat.rejected` の id / kind だけ |
| Task / JournalEntry (kind='diary') | 永続 | 既存通り、source_chat_snippet 付きで保存 |
| ApiRateLimit | 永続 (90 日程度) | 月次バッチで古い行 cleanup |

## 5. AI 出力 Schema (構造的保証)

candidateValidator (Lambda 内) の Zod schema は以下の構造:

```typescript
// AI からの mood フィールド受け取りを構造的に拒否 (BR-CE-06)
// diary 候補に mood フィールドなし
// 全候補に kind 必須、2 値のみ許可

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

const ExtractionResultSchema = z.object({
  candidates: z.array(
    z.discriminatedUnion('kind', [TaskCandidateSchema, DiaryCandidateSchema])
  ).min(1),  // 空配列禁止 (BR-CE-03)
});
```

**設計上の保証**:
- AI が誤って mood を返しても → schema 検証時に **DiaryCandidateSchema が mood フィールドを知らない** ので、Zod の strict() でエラー (or 黙って捨てる)
- AI が空配列を返しても → `.min(1)` で Zod エラー、フォールバック処理で diary 候補 1 件を強制生成 (BR-CE-04)

## 参照
- ビジネスルール: `business-rules.md`
- ビジネスロジックモデル: `business-logic-model.md`
- Frontend コンポーネント: `frontend-components.md`
- 既存 schema: `src/db/schema.ts`、`journalEntries` / `tasks` 定義
- memory: `project_journal_kind_model.md` (日々ノートの kind 仕様)
