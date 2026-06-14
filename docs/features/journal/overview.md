# journal (日誌・記録)

> 先生が日々を雑に投げ込み、整い、相互関心の層として残る場所。記録は目的ではなく副産物 ([PHILOSOPHY §1](../../PHILOSOPHY.md))。

- **src**: `src/features/journal/`
- **対応要件**: FR-02 (日誌), FR-04 (感情・タグ記録)
- **粒度**: 分割 (重い機能)
- **OpenAPI**: あり (tag: `Journal (Private)`, `Journal (Public)`, `Tag`)

## 何ができるか

- 日誌エントリの作成・編集・削除 (本文 1〜1000 文字)
- 3 つの種別 (`kind`): **diary** (日々ノート・mood+感情タグ任意) / **knowledge** (ナレッジノート・ナレッジタグ任意) / **tweet** (ひとこと・感情タグ任意)
- 公開 (`is_public`) の切替: 公開すれば教員タイムラインに並ぶ (相互関心の層)、非公開なら自分だけ

### 記録の入口 (chimo 2026-06-12: 右サイドに一本化)

記録を「書く」入口はダッシュボード右サイドの 2 つだけ。職員室ボードからは起票しない。

- **今日の出来事を書く** (`TodayCaptureBox`): 雑に一文を書いて種別を選んで残す単一キャプチャ箱。既定は `tweet`。種別で確定先を振り分ける —— `tweet`/`knowledge` → 日々ノート (`POST /api/private/journal/entries`)、`keep`/`concern`/`thanks`/`help` → 職員室ボード (`POST /api/staffroom/board`)。
  - 種別は「分類・評価」ではなく「どこへ渡す / どう残す」のルーティング。Slice 2 で AI が種別を**そっと提案**する (確定は必ず本人)。
- **自分用の日誌** (`EntryForm` kind=`diary`): 自分用なので既定は非公開、感情タグ UI は出さない。
- 共有タイムライン (テナント内の公開エントリ) と マイ記録 (自分の公開+非公開) の 2 ビュー
- 感情タグ (emotion_tags) と ナレッジタグ (knowledge_tags) の付与
- リアクション 3 種 (参考になった / お疲れ様です / すてきです) — 自分の投稿にも付けられる

## 仕様の所在

- [entry-crud.md](./entry-crud.md) — エントリの作成・更新・削除、タイムライン、リアクション
- [tags.md](./tags.md) — 感情タグ・ナレッジタグの仕様と権限
- [api.md](./api.md) — エンドポイント一覧 (契約の正本は OpenAPI registry)

## 横断依存

- データモデル → [foundation/data-model.md](../../foundation/data-model.md#日誌記録-journal)
- 公開/非公開の RLS とテナント隔離 → [foundation/rls-and-tenancy.md](../../foundation/rls-and-tenancy.md#可視性の特殊ケース)
- **踏み絵**: mood・感情データは集計・AI 化しない。観測されると壊れる ([PHILOSOPHY §4](../../PHILOSOPHY.md))
