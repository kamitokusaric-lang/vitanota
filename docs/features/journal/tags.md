# journal — タグ (感情タグ・ナレッジタグ)

> 親: [overview.md](./overview.md)。API 一覧は [api.md](./api.md)。実装: `src/features/journal/lib/tagService.ts`, `tagRepository.ts`。

vitanota の日誌タグは **2 系統**に分かれる。役割も権限も別物。

## 感情タグ (emotion_tags)

情緒データ。`note` (メモ) に付ける (倉庫の私的メモ・公開メモ問わず)。

| 項目 | 仕様 |
|---|---|
| name | 1〜50 文字。テナント内で大小無視 unique |
| category | positive / negative / neutral |
| is_system_default | true は削除不可 |
| 作成権限 | **school_admin / system_admin のみ** (Unit-03 から教員のカスタム作成は廃止) |
| 削除権限 | school_admin のみ。is_system_default=false のみ。紐づきは CASCADE 削除・エントリ本体は残す |

システムデフォルト 15 個 (テナント作成時にシード):
- positive: 喜び・達成感・充実・安心・感謝
- negative: 不安・ストレス・疲労・焦り・不満
- neutral: 忙しい・混乱・気づき・無力感・もやもや

`category` は集計に使われる (ダッシュボードの mood/感情の俯瞰)。

> ⚠️ **踏み絵**: 感情タグは情緒データである。個々の教員の感情タグを school_admin が「誰が何を感じたか」のレベルで覗ける構造にしてはならない ([PHILOSOPHY §3, §4.1](../../PHILOSOPHY.md))。集計は許されるが、観測の感覚を生む粒度は踏み絵。

## ナレッジタグ (knowledge_tags) ※新規付与は廃止

業務寄りのデータ。旧 `knowledge` 種別に付けていたが、kind 再設計 (2026-06-16) で `knowledge` 種別を廃止し、`note` のタグは emotion_tags に一本化した。**新規の付与は停止**。テーブルと既存の紐づきは残置 (表示のみ)。

| 項目 | 仕様 |
|---|---|
| name | 1〜100 文字。テナント内で unique |
| 作成権限 | **teacher 以上** (感情タグと違い教員が自由に作れる) |
| created_by | 必須 |
| 一覧 | 利用件数 (affectedEntryCount) 付きで返す |
| 同名作成 | 409 Conflict |

中間テーブル `journal_entry_knowledge_tags` で M:N。エントリ削除時 CASCADE。

## ボトムアップのタグ戦略

「カテゴリ/分類を増やしたい」という要望が来たら、まずタグ運用に逃がす。蓄積を見て、業務タグであれば system_admin が AI prompt や正式カテゴリへ昇格させる。情緒データのタグを勝手に分析ソースにはしない (踏み絵)。詳細の判断軸は [PHILOSOPHY §4.1](../../PHILOSOPHY.md)。

## 主な実装ファイル

- `lib/tagService.ts` (emotion_tag CRUD・権限チェック)
- `lib/tagRepository.ts` (emotion/knowledge 両方の CRUD・systemDefaults シード)
- `schemas/tag.ts` / `schemas/knowledgeTag.ts`
- `pages/api/private/journal/tags*` / `pages/api/private/journal/knowledge-tags/`
