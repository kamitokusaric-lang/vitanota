# Unit-05 (AI 連携) — Frontend コンポーネント

> **対応要件**: [`inception/requirements/2026-05-11-ai-chat-extraction.md`](../../../inception/requirements/2026-05-11-ai-chat-extraction.md)
> **作成日**: 2026-05-11
> **改訂**: 2026-05-11 (2 分類化、温度感コメント追加、mood 必須化)
> **位置付け**: アプリケーション設計の "コンポーネント階層" を機能設計レベルで深掘り (props / state / interactions / validation / API 統合)

## コンポーネント一覧

| Component | 役割 | 配置 |
|---|---|---|
| `<ChatBubble>` | フローティングバブル、ChatModal 起動 | 共通 Layout (常駐) |
| `<ChatModal>` | チャット本体、メッセージリスト + 入力欄統合 | ChatBubble 配下 |
| `<MessageList>` | メッセージ + 候補のグルーピング表示 | ChatModal 内 |
| `<MessageBubble>` | 個別メッセージ表示 | MessageList 内 |
| `<CandidateInlineBubble>` | 候補のインライン表示 + 承認/編集/棄却ジェスチャ | MessageBubble 直下 |
| `<CandidateEditModal>` | 候補の編集モーダル | 候補の編集起動時 |
| `<DiaryApproveDialog>` | diary 承認時の温度感コメント + MoodPicker ポップアップ | diary 候補承認時 |
| `<MoodPicker>` | 5 段階絵文字、kind='diary' 時のみ | DiaryApproveDialog 内 |
| `<UnconfirmedPanel>` | 未承認候補だけの別パネル | ChatModal ヘッダーから呼び出し |
| `<CloseConfirmDialog>` | セッション終了時の未承認確認 | ChatModal の onClose 中間 |

---

## 1. `<ChatBubble>`

### Props
なし (子は持たない、env flag は内部で判定)

### State
なし

### Hook
- `useChatBubbleFlag()` — env flag 判定 (true/false)
- `useState(false)` for modal isOpen (or 親管理)

### 表示条件
- env flag ON
- 認証済み (teacher / school_admin / system_admin)
- 全教員ダッシュボード画面に常時表示

### Interactions
- `onClick` / `onTouch` → ChatModal 開く

### A11y
- `aria-label="AI チャットで書き散らす"`
- キーボードフォーカス可、Enter / Space で開く

### スタイル
- 画面右下 fixed 配置
- 56x56px 丸ボタン
- z-index は他要素の上 (ただしモーダル / トーストより下)

---

## 2. `<ChatModal>`

### Props

| name | 型 | 説明 |
|---|---|---|
| `isOpen` | boolean | モーダル表示状態 |
| `onClose` | `() => void` | 閉じる時のコールバック |

### State
- 親管理: `isOpen`
- 内部管理 (via useChatExtraction): `messages`, `candidates`, `isLoading`, `error`, `lastSelectedMood`
- 内部管理: `inputText` (送信前の textarea 値)
- 内部管理: `closeConfirmOpen`, `diaryApproveCandidate` (DiaryApproveDialog 表示制御)

### Hook
- `useChatExtraction()` — セッション state 統括

### モバイル / PC レイアウト
- **モバイル**: 画面下から full-height bottom sheet (overscroll で閉じる)
- **PC**: 中央〜右側のモーダル、幅 480px、max-height: 80vh

### Interactions
- 入力 textarea → state.inputText
- 送信ボタン → `useChatExtraction.sendMessage(inputText)` → inputText を空に
- ESC キー (PC) / 戻るボタン (モバイル) → `attemptClose()`
- `attemptClose()`:
  - 未承認候補 > 0 → setCloseConfirmOpen(true) → CloseConfirmDialog 表示
  - 未承認候補 = 0 → onClose() 即時

### キーボード
- Cmd+Enter (PC) で送信
- ESC で閉じる試行

### モバイル UX 留意点
- iOS Safari の viewport 100vh ジャンプ対策 (dynamic-viewport-height 使用)
- キーボード表示時の高さ調整 (visualViewport API)

### API 統合
useChatExtraction 経由で:
- `POST /api/ai-chat/extract` (sendMessage 時)
- `POST /api/tasks` (task 候補承認時、即時)
- `POST /api/journal/entries` (diary 候補承認時、DiaryApproveDialog 経由 mood 付き)

---

## 3. `<MessageList>`

### Props

| name | 型 | 説明 |
|---|---|---|
| `messages` | `ChatMessage[]` | 表示対象のメッセージ |
| `candidates` | `Candidate[]` | 候補リスト (messageId で紐付け) |
| `onApprove` | `(candidate: Candidate) => void` | 承認ハンドラ |
| `onEdit` | `(candidate: Candidate) => void` | 編集モーダル起動ハンドラ |
| `onReject` | `(candidate: Candidate) => void` | 棄却ハンドラ |
| `isLoading` | boolean | 抽出中表示制御 |

### State
なし (pure component)

### 構造
- 縦スクロール領域
- 各 ChatMessage を MessageBubble として表示
- 各メッセージの下に、関連する Candidate を CandidateInlineBubble で表示
- isLoading=true なら最新メッセージの下にローディングインジケーター

---

## 4. `<MessageBubble>`

### Props

| name | 型 | 説明 |
|---|---|---|
| `message` | `ChatMessage` | 表示対象メッセージ |

### バリアント
- `sender='user'` → 右寄せ、青系背景
- `sender='system'` → 左寄せ、グレー背景 (エラー時に使用)

### 構造
- text 表示 (改行保持)
- timestamp サブ表示 (送信時刻、相対時刻表示)
- extractionStatus に応じたバッジ表示
  - `loading` → スピナー
  - `failed` → 「再試行」ボタン → useChatExtraction.retry(message.id)

---

## 5. `<CandidateInlineBubble>`

### Props

| name | 型 | 説明 |
|---|---|---|
| `candidate` | `Candidate` | 表示対象候補 |
| `onApprove` | `(candidate) => void` | 承認 |
| `onEdit` | `(candidate) => void` | 編集モーダル起動 |
| `onReject` | `(candidate) => void` | 棄却 |

### State
なし (pure component)

### kind 別表示 (2 分類)

| kind | アイコン | 色 | バッジテキスト |
|---|---|---|---|
| `task` | 📋 | オレンジ | 「タスク候補」 |
| `diary` | 📓 | グリーン | 「日々ノート候補」 |

### Interactions
- **タップ (PC: クリック)** → `onApprove(candidate)` (最頻動作)
- **長押し (PC: 右クリック or ボタン)** → `onEdit(candidate)`
- **スワイプ (PC: × ボタン)** → `onReject(candidate)`

### モバイル UX
- スワイプジェスチャは React-spring などで実装
- PC では明示ボタン (承認 / 編集 / 棄却) 併設

---

## 6. `<CandidateEditModal>`

### Props

| name | 型 | 説明 |
|---|---|---|
| `candidate` | `Candidate` | 編集対象候補 |
| `onSave` | `(updatedCandidate: Candidate) => void` | 保存 = kind='task' は即承認、kind='diary' は DiaryApproveDialog へ |
| `onCancel` | `() => void` | キャンセル (編集破棄) |

### State (form)
- task の場合: `title`, `description`, `dueDate`
- diary の場合: `content`
- 全候補: `sourceChatSnippet` は read-only 表示 (編集不可)

### kind 別フォーム (2 分類)

#### task の場合
- title: input, required, max 200, 文字数 counter
- description: textarea, optional, max 2000
- dueDate: date picker, optional
- sourceChatSnippet: 読み取り専用 (グレー背景に表示)
- 「保存」 = 即 DB INSERT (BR-CE-17、MoodPicker 経由なし)

#### diary の場合
- content: textarea, required, max 200, 文字数 counter
- sourceChatSnippet: 読み取り専用
- 「保存」 → DiaryApproveDialog (MoodPicker + 温度感コメント) 表示 → mood 選択 → DB INSERT

### 保存ボタン
- task: `onSave(updatedCandidate)` 即承認
- diary: `onSave(updatedCandidate)` → 親 (ChatModal) で DiaryApproveDialog を開く
- バリデーションエラー時は保存ボタン disabled

### キャンセルボタン
- `onCancel()` 呼び出し、編集破棄 → モーダル閉じ
- candidate は pending のまま ChatModal に残る

---

## 7. `<DiaryApproveDialog>` (新規、温度感型 UI)

### Props

| name | 型 | 説明 |
|---|---|---|
| `candidate` | `DiaryCandidate` | 承認対象の diary 候補 |
| `lastSelectedMood` | `Mood \| null` | 連続承認時の予選択 mood (直前の選択値) |
| `onApprove` | `(candidate, mood: Mood) => void` | mood 付き承認 |
| `onCancel` | `() => void` | キャンセル、候補は pending に戻る |

### 構造

```
┌────────────────────────────────────┐
│ 📓 お疲れさま、              [×]   │
│    書いてくれてありがとう。         │  ← 温度感固定コメント (静的)
│                                    │
│ {candidate.content の表示}         │  ← 承認対象の内容 (read-only 確認)
│                                    │
│  今の気分も教えて:                 │
│  😀  🙂  😐  😟  😢               │  ← MoodPicker (子 component)
│                                    │
│         [この気分で保存]           │  ← mood 未選択時 disabled
└────────────────────────────────────┘
```

### 温度感コメント
- **静的固定文言** (BR-CE-07)、AI 生成ではない
- 例: 「お疲れさま、書いてくれてありがとう。今の気分も教えて」
- メッセージ内容に応じた動的反応は出さない (踏み絵セーフ)
- 文言バリエーション (時間帯・曜日等での出し分け) は今後の検討事項 (post-MVP)

### MoodPicker 初期値
- `lastSelectedMood !== null` (連続 diary 承認時) → `lastSelectedMood` を初期値として予選択 (ワンタップ承認可)
- `lastSelectedMood === null` (初回 diary 承認時) → 初期値 null、教員がタップしないと「この気分で保存」disabled

### Interactions
- 「この気分で保存」 → `onApprove(candidate, selectedMood)` → DB INSERT
- 「×」or 背景タップ → `onCancel()` → 候補は pending に戻る
- ESC → onCancel()

---

## 8. `<MoodPicker>`

### Props

| name | 型 | 説明 |
|---|---|---|
| `value` | `Mood \| null` | 現在の選択値 |
| `onChange` | `(mood: Mood) => void` | 選択変更時 (null 戻しは UX 上不要、必須選択化に伴い) |

### 表示条件
- 親 component (DiaryApproveDialog) で kind='diary' の承認フロー内のみマウント (BR-CE-07)
- task では **表示しない** (props で渡さない、レンダリングしない)

### State
- 親管理 (value / onChange でコントロール)

### 構造
- 5 段階絵文字 (😀 🙂 😐 😟 😢) を横並びボタンで表示
- 各ボタン: タップで value 設定
- 選択中のボタンは強調表示 (枠線 / 背景色)
- 親が必須なので、null 戻しのボタンは不要 (連続承認時の direct 再選択は再タップで OK)

### AI 不可侵原則 (BR-CE-06)
- props.value の初期値は **AI からの推定値で埋まらない** (連続承認時の直前値 only)
- 親 component の useState 初期値: lastSelectedMood (連続承認時) or null (初回)
- AI 出力 schema にも mood フィールドなし、構造的に AI からの注入を遮断

---

## 9. `<UnconfirmedPanel>`

### Props

| name | 型 | 説明 |
|---|---|---|
| `candidates` | `Candidate[]` | 未承認候補一覧 (status='pending' \| 'editing' でフィルタ済み) |
| `onApprove`, `onEdit`, `onReject` | (CandidateInlineBubble と同じ) | 各アクション |
| `onClose` | `() => void` | パネルを閉じる |

### 表示制御
- ChatModal ヘッダーの「未確認 (N)」アイコンタップで開く
- 内部に candidates を CandidateInlineBubble で並べる
- 候補が承認 / 棄却されると即座にリストから消える

### N バッジ
- ChatModal ヘッダーの「未確認 (N)」表示
- `candidates.length` を表示
- N = 0 なら **アイコンごと非表示** (バッジ "0" を出さない)

---

## 10. `<CloseConfirmDialog>`

### Props

| name | 型 | 説明 |
|---|---|---|
| `isOpen` | boolean | ダイアログ表示状態 |
| `unconfirmedCount` | number | 未承認候補数 |
| `onConfirmClose` | `() => void` | 「閉じる」確定 → セッション揮発 |
| `onCancel` | `() => void` | 「戻る」→ ChatModal に戻る |

### 表示制御
- 親 (ChatModal) の `attemptClose()` で `unconfirmedCount > 0` の時にマウント
- `unconfirmedCount = 0` なら ChatModal が即 onClose 呼び出し、本ダイアログは表示しない

### 構造
- メッセージ: 「未確認候補が {N} 件あります。閉じると消えます (再表示できません)。」
- ボタン: 「戻る」(cancel、ChatModal に戻る) / 「閉じる」(confirm、揮発)

### キーボード
- ESC → onCancel() (戻る、保守的デフォルト)

---

## 11. Hook 詳細

### 11.1 `useChatExtraction()`

#### 配置
`src/features/ai-chat/hooks/useChatExtraction.ts`

#### State

| name | 型 | 初期値 |
|---|---|---|
| `messages` | `ChatMessage[]` | `[]` |
| `candidates` | `Candidate[]` | `[]` |
| `lastSelectedMood` | `Mood \| null` | `null` |
| `isLoading` | boolean | `false` |
| `error` | `string \| null` | `null` |

#### Methods

```typescript
interface UseChatExtractionReturn {
  messages: ChatMessage[];
  candidates: Candidate[];
  unconfirmedCount: number;  // 派生値
  lastSelectedMood: Mood | null;
  isLoading: boolean;
  error: string | null;

  sendMessage: (text: string) => Promise<void>;
  approveCandidate: (id: string, mood?: Mood) => Promise<void>;  // mood は kind='diary' のみ必要
  rejectCandidate: (id: string) => void;
  editCandidate: (id: string, updates: Partial<Candidate>, mood?: Mood) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  clearSession: () => void;
}
```

#### 永続化
- なし (純粋に React state、リロードで消える)

#### API 呼び出し

| Method | Endpoint | エラー処理 |
|---|---|---|
| `sendMessage` | `POST /api/ai-chat/extract` | 429 / 503 / 404 を error state に格納、UI で再試行制御 |
| `approveCandidate` / `editCandidate` (kind='task') | `POST /api/tasks` | 失敗時は候補 pending のまま |
| `approveCandidate` / `editCandidate` (kind='diary') | `POST /api/journal/entries` | mood 付き、失敗時は候補 pending のまま |

#### lastSelectedMood の管理
- diary 承認成功時 → `lastSelectedMood` を当該 mood で更新
- セッション終了 (`clearSession`) → `lastSelectedMood` を null にリセット
- 次の diary 承認時の DiaryApproveDialog 初期値として渡す

### 11.2 `useChatBubbleFlag()`

#### 配置
`src/features/ai-chat/hooks/useChatBubbleFlag.ts`

#### 内容
```typescript
export const useChatBubbleFlag = (): boolean => {
  return process.env.NEXT_PUBLIC_ENABLE_AI_CHAT_EXTRACTION === 'true';
};
```

---

## 12. フォーム validation ルール

| フィールド | ルール | エラー UX |
|---|---|---|
| ChatModal 入力 textarea | min 1 / max 2000 字 | 送信ボタン disabled、文字数超過時の赤字 |
| TaskCandidate.title | min 1 / max 200 字 | edit 保存ボタン disabled、赤字 |
| TaskCandidate.description | max 2000 字 | 同上 |
| TaskCandidate.dueDate | ISO date format | 不正時赤字 |
| DiaryCandidate.content | min 1 / max 200 字 | 同上 |
| sourceChatSnippet | read-only (編集不可) | バリデーション不要 |
| MoodPicker.value (diary 承認時) | 必須 (null 不可) | 「この気分で保存」ボタン disabled |

---

## 13. ユーザーインタラクションフロー (主要)

### A. 基本フロー: 書き散らす → 承認 → DB 保存
1. ChatBubble タップ → ChatModal 開く
2. textarea にメッセージ入力 → 送信
3. (loading 表示) → 候補が CandidateInlineBubble としてインラインに並ぶ
4. 候補をタップ → 承認
   - kind='task' → 即 DB INSERT (mood UI なし)
   - kind='diary' → DiaryApproveDialog (温度感コメント + MoodPicker) → mood 選択 → 「この気分で保存」 → DB INSERT
5. CandidateInlineBubble が消える、未承認候補は ChatModal に残る
6. ChatModal を閉じる → セッション終了

### B. 編集フロー: 候補を直したい
1. CandidateInlineBubble を長押し or 編集ボタンタップ
2. CandidateEditModal が開く (kind 別フォーム)
3. 内容を編集 → 「保存」
4. kind='task' → 即 DB INSERT、kind='diary' → DiaryApproveDialog → mood 選択 → DB INSERT
5. CandidateInlineBubble が消える、ChatModal に戻る

### C. 連続 diary 承認フロー
1. diary 候補 #1 承認 → DiaryApproveDialog (MoodPicker 初期値: null)
2. 教員 mood 選択 (例: 🙂) → 保存
3. diary 候補 #2 承認 → DiaryApproveDialog (MoodPicker **予選択: 🙂**)
4. そのままワンタップ承認 (mood 変えない) or 別 mood に変更
5. 摩擦最小化、ただし mood 変化の可能性も尊重

### D. 棄却フロー
1. CandidateInlineBubble をスワイプ or × タップ
2. 即時消去、DB に何も保存されない

### E. 未承認確認フロー
1. ChatModal の「未確認 (N)」アイコンタップ
2. UnconfirmedPanel が開く、未承認候補だけ表示
3. 個別 or まとめて承認 / 編集 / 棄却

### F. セッション終了フロー
1. ChatModal を閉じる試行 (× / 背景タップ / ESC)
2. 未承認 > 0 → CloseConfirmDialog 表示
3. 「閉じる」確定 → 揮発 (DB に何も入らない、未承認候補消失)
4. clearSession() で lastSelectedMood もリセット

---

## 14. API 統合マトリックス

| Component | Hook 経由 API | 用途 |
|---|---|---|
| ChatModal (sendMessage) | `POST /api/ai-chat/extract` | メッセージ送信、抽出結果取得 |
| CandidateInlineBubble (approve, kind=task) | `POST /api/tasks` (既存) | タスク永続化、mood 不要 |
| DiaryApproveDialog (この気分で保存) | `POST /api/journal/entries` (既存) | diary 永続化、kind='diary' + mood 付き |
| CandidateEditModal (save, kind=task) | 同上 (task) | 編集 + 即承認 |
| CandidateEditModal (save, kind=diary) | DiaryApproveDialog 経由 (上記) | 編集 → mood 選択 → 承認 |

既存 API には `sourceChatSnippet?` フィールドを optional で追加 (後方互換、既存 UI からの呼び出しでは NULL)。

## 参照
- ビジネスルール: `business-rules.md`
- ビジネスロジックモデル: `business-logic-model.md`
- ドメインエンティティ: `domain-entities.md`
- アプリケーション設計: `aidlc-docs/inception/application-design/2026-05-11-ai-chat-extraction-design.md`
- 既存 EntryForm 参考: `src/features/journal/components/EntryForm.tsx`
- 既存 MoodPromptBar 参考: `src/features/journal/components/MoodPromptBar.tsx`
