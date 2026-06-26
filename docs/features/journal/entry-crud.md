# journal — エントリ CRUD・タイムライン・リアクション

> 親: [overview.md](./overview.md)。API 一覧は [api.md](./api.md)。実装: `src/features/journal/lib/`。

## ドメインエンティティ

### JournalEntry
| フィールド | 型 | 説明 |
|---|---|---|
| `content` | text | 本文。1〜1000 文字 (2026-05-27 に 200→1000 へ拡張) |
| `is_public` | boolean | 公開フラグ。デフォルト `true` |
| `mood` | enum (5段階) | very_positive / positive / neutral / negative / very_negative。note で任意 |
| `kind` | enum | `note` (メモ) ほか `keep`/`concern`/`thanks`/`help` (共有意図)。デフォルト `note`。**公開/私的は kind ではなく `is_public`** (kind 再設計 2026-06-16) |
| `content_masked` | text | AI 入力用マスキング済み本文 |
| `user_id` | UUID (nullable) | 作成者。退会時は SET NULL で匿名化 (投稿本体は残す) |

journal (倉庫/職員室ノート) 経路で作るのは `note` のみ (旧 diary/knowledge/tweet は note へ集約済)。

| kind | mood | 付けられるタグ | 入口 |
|---|---|---|---|
| note (メモ) | 任意 | emotion_tags | 非公開=`DiaryNoteBox` (倉庫・「ふりかえり」) / 公開=`TodayCaptureBox` (職員室ノート・「つぶやき」) |

意図つきの共有 (`keep`/`concern`/`thanks`/`help`) は職員室ボード経路 ([staffroom](../staffroom/overview.md))。

#### ふりかえりの「3行日誌テンプレ」 (chimo 2026-06-26)

非公開 note (`DiaryNoteBox`) は本文を **テンプレ / 自由記述** で切替できる (既定=テンプレ)。
テンプレは KPT を和らげた 3 区分:「**よかった・続けたいこと / 気になった・困ったこと / 次に試したいこと**」。

- 一部の欄だけでも保存可。**空欄の見出しは保存本文に含めない**。
- **DB スキーマは変えない**。3 区分は `content` 単一カラムに見出し行付きで直列化する
  (直列化/復元は `lib/reflectionTemplate.ts`)。編集時は見出しを検出してテンプレ復元、
  無ければ自由記述として開く (テンプレ導入前の自由記述ふりかえりも壊れない)。
- 公開つぶやき (`TodayCaptureBox`) はテンプレ対象外。
- 踏み絵: ふりかえりは「自分だけ」= 観測されない自己向けの型。語彙は改善/評価を避け和語に寄せ、
  「自由に書く」を残して〈雑に残す〉動線も維持する。

## CRUD の挙動

### 作成 (`POST /api/private/journal/entries`)
1. Zod 検証 (1〜1000 文字、tagIds は emotion_tags を検証)
2. tagIds が同一テナントに属するか確認 (違反は `InvalidTagReferenceError`)
3. `journal_entries` に INSERT (user_id=セッションユーザー、kind=note、is_public は入口で決定)
4. タグを `journal_entry_tags` (emotion_tags) に一括 INSERT (note は emotion_tags に一本化)
5. 作成エントリ (タグ含む) を 201 で返す

### 更新 (`PUT /api/private/journal/entries/{id}`)
- 所有者のみ (`WHERE user_id = currentUser` + RLS WITH CHECK)
- content / tagIds / is_public / mood / kind は任意更新
- タグは「既存 DELETE → 新規 INSERT」で置換、200 で返す

### 削除 (`DELETE /api/private/journal/entries/{id}`)
- 所有者のみ。複合 FK CASCADE で中間テーブルも自動削除。204

### 共有タイムライン (`GET /api/public/journal/entries`)
- `is_public=true AND tenant_id=current` を `created_at DESC` でページネーション (perPage 最大 50)
- 各エントリに投稿者・タグを JOIN、`isAiPost` フラグを enrich
- キャッシュ: `public, s-maxage=30, stale-while-revalidate=60` (CloudFront 対象)

### マイ記録 (`GET /api/private/journal/entries/mine`)
- `user_id=currentUser` の全エントリ (**非公開も含む**) をページネーション
- キャッシュ: `private, no-store` (CloudFront バイパス)

## リアクション

3 種 (2026-05-27 に 1→3 種化):

| reactionType | 意味 |
|---|---|
| `knowledge` | 参考になった |
| `appreciation` | お疲れ様です |
| `endorsement` | すてきです |

- `POST /api/private/journal/entries/{id}/reactions` で付与 (201)、`DELETE` で削除 (204)
- **自分の投稿にも付けられる** (セルフ労い動線)
- 主キー `(journal_entry_id, user_id, reaction_type)` — 同一ユーザー × 同一エントリ × 同一種別は 1 行のみ (重複は ON CONFLICT DO NOTHING)
- エントリ削除時 CASCADE

> カードの見た目は投稿主と他者で変えない (`isMine` はメニューの有無にのみ使う)。

## 主要ビジネスルール (抜粋)

| ID | ルール |
|---|---|
| BR-J-01 | 本文 1〜1000 文字 (API Zod + DB CHECK) |
| BR-J-04 | 更新・削除は所有者のみ (API + RLS) |
| BR-J-05 | 共有タイムライン = テナント内の is_public=true 全件 |
| BR-J-05b | マイ記録 = 自分の全エントリ (公開・非公開) |
| BR-J-08 | is_public=false は所有者のみアクセス可 |

## セキュリティ多層防御

パス分離 (`/api/public` vs `/api/private`) → 認証 → VIEW (is_public 非露出) → RLS → API WHERE → Zod → 複合 FK の多層で IDOR を防ぐ。詳細は [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md)。

## 主な実装ファイル

- `lib/journalEntryService.ts` (CRUD・所有者検証・トランザクション)
- `lib/privateJournalRepository.ts` / `lib/publicTimelineRepository.ts`
- `components/DiaryNoteBox.tsx` (倉庫=非公開 note・ふりかえりテンプレ/自由切替) / `lib/reflectionTemplate.ts` (3行日誌テンプレの直列化・復元) / `components/TodayCaptureBox.tsx` (公開 note / 職員室ボード) / `components/EntryCard.tsx`
- `pages/api/private/journal/entries*` / `pages/api/public/journal/entries.ts`
