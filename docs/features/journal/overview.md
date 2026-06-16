# journal (日誌・記録)

> 先生が日々を雑に投げ込み、整い、相互関心の層として残る場所。記録は目的ではなく副産物 ([PHILOSOPHY §1](../../PHILOSOPHY.md))。

- **src**: `src/features/journal/`
- **対応要件**: FR-02 (日誌), FR-04 (感情・タグ記録)
- **粒度**: 分割 (重い機能)
- **OpenAPI**: あり (tag: `Journal (Private)`, `Journal (Public)`, `Tag`)

## 何ができるか

- 日誌エントリの作成・編集・削除 (本文 1〜1000 文字)
- 種別 (`kind`) = **`note`** (ただのメモ・mood/感情タグ任意)。公開/私的は kind ではなく **`is_public`** が持つ (kind 再設計 2026-06-16 / migration 0053-0054)。`note` は非公開なら倉庫 (マイノート)、公開なら一般の職員室ノート。
  - 旧 `diary`/`knowledge`/`tweet` は `note` へ集約済 (enum には残すが新規では使わない)。意図つきの共有 `keep`/`concern`/`thanks`/`help` は別経路 (職員室ボード / 生徒ノート)。
- 公開 (`is_public`) の切替: 公開すれば教員タイムラインに並ぶ (相互関心の層)、非公開なら自分だけ

### 記録の入口 (chimo 2026-06-12: 右サイドに一本化)

記録を「書く」入口はダッシュボード右サイドの 2 つだけ。職員室ボードからは起票しない。

- **今日の出来事を書く** (`TodayCaptureBox`): 雑に一文を書いて種別を選んで残す単一キャプチャ箱。既定は `note` (つぶやき)。種別で確定先を振り分ける —— `note` (公開) → 職員室ノート (`POST /api/private/journal/entries`・`is_public=true`)、`thanks`/`help` → 職員室ボード (`POST /api/staffroom/board`)。
  - 種別は「分類・評価」ではなく「どこへ渡す / どう残す」のルーティング。AI が種別 (thanks/help) を**そっと提案**する (確定は必ず本人)。「役に立つ情報」の手動種別は廃止し「なるほど」集計に一本化。
- **自分用の日誌** (`DiaryNoteBox` kind=`note`・`is_public=false`): 倉庫 (自分だけ)。mood + 感情タグ任意。
- 共有タイムライン (テナント内の公開エントリ) と マイ記録 (自分の公開+非公開) の 2 ビュー
- 感情タグ (emotion_tags) の付与 (note は emotion_tags に一本化。旧 knowledge_tags は新規書き込みなし)
- リアクション 3 種 (参考になった / お疲れ様です / すてきです) — 自分の投稿にも付けられる

## 仕様の所在

- [entry-crud.md](./entry-crud.md) — エントリの作成・更新・削除、タイムライン、リアクション
- [tags.md](./tags.md) — 感情タグ・ナレッジタグの仕様と権限
- [api.md](./api.md) — エンドポイント一覧 (契約の正本は OpenAPI registry)

## 横断依存

- データモデル → [foundation/data-model.md](../../foundation/data-model.md#日誌記録-journal)
- 公開/非公開の RLS とテナント隔離 → [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md#可視性の特殊ケース)
- **踏み絵**: mood・感情データは集計・AI 化しない。観測されると壊れる ([PHILOSOPHY §4](../../PHILOSOPHY.md))
