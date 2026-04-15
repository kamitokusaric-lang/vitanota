# Unit-02 フロントエンドコンポーネント定義

## ページ構成

| ページ | パス | 説明 |
|---|---|---|
| 教員ダッシュボード | `/dashboard/teacher` | タブ切り替え: 教員タイムライン（共有）／マイ記録（個人）（Unit-01 のプレースホルダーを実装に置換） |
| エントリ作成 | `/journal/new` | 新規エントリ作成フォーム |
| エントリ編集 | `/journal/[id]/edit` | 既存エントリの編集フォーム |

---

## API エンドポイント（Unit-02 追加分）

| エンドポイント | メソッド | 説明 | 権限 |
|---|---|---|---|
| `/api/public/journal/entries` | GET | 教員タイムライン取得（is_public=true、テナント全員分、CloudFront キャッシュ対象） | teacher / school_admin |
| `/api/private/journal/entries/mine` | GET | マイ記録取得（自分の全エントリ） | teacher |
| `/api/private/journal/entries` | POST | エントリ作成 | teacher |
| `/api/private/journal/entries/[id]` | GET | エントリ詳細取得 | teacher（所有者のみ） |
| `/api/private/journal/entries/[id]` | PUT | エントリ更新 | teacher（所有者のみ） |
| `/api/private/journal/entries/[id]` | DELETE | エントリ削除 | teacher（所有者のみ） |

**パス設計原則**: `/api/public/*` と `/api/private/*` を名前空間で分離することで、CloudFront キャッシュポリシーの混在事故を構造的に防止する。`/api/public/*` は `is_public=true` のリソースのみを扱い、CloudFront でキャッシュ可能。`/api/private/*` は個人情報を含むため、CloudFront では常にキャッシュ無効。
| `/api/journal/tags` | GET | テナントタグ一覧 | teacher / school_admin |
| `/api/journal/tags` | POST | タグ作成 | teacher |
| `/api/journal/tags/[id]` | DELETE | タグ削除（紐づき CASCADE） | school_admin |
| `/api/journal/tags/[id]` | DELETE | タグ削除（is_system_default=false のみ） | school_admin |

---

## コンポーネント階層

```
pages/dashboard/teacher.tsx
  └── TenantGuard (Unit-01)
        └── RoleGuard [teacher | school_admin] (Unit-01)
              └── Layout (Unit-01)
                    └── TeacherDashboard
                          ├── [Tab: 教員タイムライン]
                          │     └── Timeline (variant='shared')
                          │           ├── EntryCard (×N)
                          │           │     ├── 投稿者名
                          │           │     ├── TagChip (×N)
                          │           │     ├── EmotionChip (×N)
                          │           │     └── 編集・削除ボタン（所有者のみ）
                          │           └── PaginationControls
                          ├── [Tab: マイ記録]（teacher ロールのみ）
                          │     └── Timeline (variant='mine')
                          │           ├── EntryCard (×N)
                          │           └── PaginationControls
                          └── [New Entry Button → /journal/new]（teacher ロールのみ）

pages/journal/new.tsx
  └── TenantGuard
        └── RoleGuard [teacher]
              └── Layout
                    └── EntryForm (mode="create")
                          ├── ContentTextArea
                          ├── TagSelector（感情タグ・業務タグ統合）
                          │     └── TagChip (×N, selected/available)
                          ├── PrivacyToggle
                          └── SubmitButtons

pages/journal/[id]/edit.tsx
  └── TenantGuard
        └── RoleGuard [teacher]
              └── Layout
                    └── EntryForm (mode="edit", initialData)
                          └── (同上)
```

---

## コンポーネント詳細

### TeacherDashboard

**ファイル**: `src/features/journal/components/TeacherDashboard.tsx`

**Props**:
```typescript
interface TeacherDashboardProps {
  session: VitanotaSession;
}
```

**State**:
```typescript
activeTab: 'timeline' | 'mine'
```

**タブ構成**:
- **教員タイムライン**: `GET /api/public/journal/entries` — is_public=true のテナント全員分
- **マイ記録**: `GET /api/private/journal/entries/mine` — 自分の全エントリ（teacher ロールのみ表示）

**機能**:
- 「新しい記録」ボタンで `/journal/new` へ遷移（teacher ロールのみ）
- 管理職（school_admin）は「教員タイムライン」タブのみ表示（「新しい記録」ボタン非表示）

**data-testid**: `teacher-dashboard`, `tab-timeline`, `tab-mine`

---

### Timeline

**ファイル**: `src/features/journal/components/Timeline.tsx`

**Props**:
```typescript
interface TimelineProps {
  entries: JournalEntryWithRelations[];
  total: number;
  page: number;
  totalPages: number;
  variant: 'shared' | 'mine'; // shared=教員タイムライン, mine=マイ記録
  currentUserId: string;
  onPageChange: (page: number) => void;
  onEntryEdit?: (id: string) => void;
  onEntryDelete?: (id: string) => void;
}
```

**表示**:
- `variant='shared'` 0件: 「まだ公開された記録がありません。」
- `variant='mine'` 0件: 「まだ記録がありません。最初の記録をしてみましょう。」
- エントリあり: EntryCard の一覧
- 下部: PaginationControls

**data-testid**: `timeline`, `timeline-shared`, `timeline-mine`

---

### EntryCard

**ファイル**: `src/features/journal/components/EntryCard.tsx`

**Props**:
```typescript
interface EntryCardProps {
  entry: JournalEntryWithRelations;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}
```

**表示項目**（詳細モード）:
- 投稿者名（教員タイムラインのみ表示。マイ記録では省略）
- 作成日時（例: `4月15日 14:23`）
- 本文: `content.slice(0, 50) + (content.length > 50 ? '…' : '')`
- 感情カテゴリチップ（EmotionChip）
- タグチップ（TagChip）
- 編集ボタン・削除ボタン（entry.userId === currentUserId の場合のみ表示）

**data-testid**: `entry-card`, `entry-card-content`, `entry-card-tags`, `entry-card-emotions`, `entry-edit-button`, `entry-delete-button`

---

### EntryForm

**ファイル**: `src/features/journal/components/EntryForm.tsx`

**Props**:
```typescript
interface EntryFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    id: string;
    content: string;
    tagIds: string[];  // 感情タグ・業務タグ統合（tags.is_emotion で識別）
    isPublic: boolean;
  };
  onSuccess: () => void;
}
```

**State**:
```typescript
content: string          // 本文
selectedTagIds: string[] // 選択済みタグID（感情タグ・業務タグ統合）
isPrivate: boolean       // 「自分だけに保存」チェック状態（デフォルト: false = タイムラインに表示）
isSubmitting: boolean
```

**APIコール**:
- マウント時: GET `/api/journal/tags` （テナント全タグを sort_order→name 順で取得）
- 送信時（create）: POST `/api/private/journal/entries`
- 送信時（edit）: PUT `/api/private/journal/entries/[id]`

**フォームバリデーション**:
- content: 必須・1〜200文字（リアルタイムカウンター）
- 送信時にクライアント側で事前チェック

**data-testid**: `entry-form`, `entry-submit-button`

---

### ContentTextArea

**ファイル**: `src/features/journal/components/ContentTextArea.tsx`

**Props**:
```typescript
interface ContentTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number; // default: 200
}
```

**表示**:
- プレースホルダー: `今日、試みたこと・詰まっていること・感じたことを気軽に。`
- 文字カウンター: `{value.length} / {maxLength}`（200文字超で赤表示）

**data-testid**: `entry-content-textarea`, `entry-char-counter`

---

### TagSelector

**ファイル**: `src/features/journal/components/TagSelector.tsx`

**Props**:
```typescript
interface TagSelectorProps {
  tenantTags: Tag[];             // テナント全タグ（name 昇順）
  selectedTagIds: string[];      // 選択済み
  onChange: (tagIds: string[]) => void;
  onCreateTag: (name: string) => Promise<Tag>; // API 呼び出し
}
```

**表示セクション**:
1. テナント内の全タグをボタン一覧で表示（選択済みはハイライト、クリックでトグル）
2. 新規タグ作成: テキスト入力 ＋ Enter/追加ボタン（作成後、自動的に選択状態になる）

**将来の拡張候補**: 入力テキストに基づくタグ自動サジェスト（形態素解析・n-gram等）

**data-testid**: `tag-selector`, `tag-chip-{tagId}`, `tag-new-input`

---


### PrivacyToggle

**ファイル**: `src/features/journal/components/PrivacyToggle.tsx`

**Props**:
```typescript
interface PrivacyToggleProps {
  isPrivate: boolean;
  onChange: (isPrivate: boolean) => void;
}
```

**表示**:
- チェックボックス: 「自分だけに保存」
- **デフォルト: チェックなし**（= タイムラインに表示、is_public = true）
- チェックあり: 非公開保存（is_public = false）

**data-testid**: `privacy-toggle`

---

### PaginationControls

**ファイル**: `src/features/journal/components/PaginationControls.tsx`

**Props**:
```typescript
interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
}
```

**表示**:
- 「前のページ」ボタン（1ページ目は無効）
- ページ番号インジケーター（例: `3 / 7`）
- 「次のページ」ボタン（最終ページは無効）

**data-testid**: `pagination-prev`, `pagination-next`, `pagination-indicator`

---

### TagChip / EmotionChip（共有コンポーネント）

**ファイル**: `src/shared/components/TagChip.tsx`, `src/shared/components/EmotionChip.tsx`

**Props**:
```typescript
interface TagChipProps {
  label: string;
  variant?: 'default' | 'selected' | 'suggested';
  onRemove?: () => void;
  onClick?: () => void;
}
```

---

## ユーザーインタラクションフロー

### エントリ作成フロー

```
1. 教員が /dashboard/teacher を開く
2. 「新しい記録」ボタンをクリック → /journal/new へ遷移
3. ContentTextArea に入力開始
   └── 文字カウンター更新（リアルタイム）
   └── TagSelector: 入力テキストと既存タグでサジェスト更新
4. サジェストタグをクリック or テナントタグを選択 or 新規タグを作成
5. EmotionCategorySelector でカテゴリを選択
6. PrivacyToggle の状態を確認（デフォルト: チェックなし = タイムラインに表示）
7. 「呟く」ボタンをクリック
   └── クライアント側バリデーション
   └── POST /api/private/journal/entries
   └── 成功: /dashboard/teacher へリダイレクト（タイムラインに新エントリ表示）
   └── 失敗: エラーメッセージ表示
```

### エントリ編集フロー

```
1. EntryCard の編集ボタンをクリック → /journal/[id]/edit へ遷移
2. EntryForm に既存データをプリフィル
3. 変更後「保存」ボタンをクリック
   └── PUT /api/private/journal/entries/[id]
   └── 成功: /dashboard/teacher へリダイレクト
```

### エントリ削除フロー

```
1. EntryCard の削除ボタンをクリック
2. 確認ダイアログ表示（「削除しますか？」）
3. 確認後: DELETE /api/private/journal/entries/[id]
4. 成功: タイムラインから除去（再フェッチ）
```

---

## フォームバリデーションルール

| フィールド | ルール | エラーメッセージ |
|---|---|---|
| content | 必須 | 「記録内容を入力してください」 |
| content | 最大200文字 | 「200文字以内で入力してください」 |
| tagIds | 最大10件 | 「タグは10件まで選択できます」（感情タグ・業務タグ合算）|
