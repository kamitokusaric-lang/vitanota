# journal — API

> **契約の正本は `src/openapi/registry.ts` (tag: `Journal (Private)`, `Journal (Public)`, `Tag`) と生成物 `openapi.yaml`。**
> 本ファイルはエンドポイントの索引であり、リクエスト/レスポンスのボディ定義をここに複写しない (陳腐化防止)。
> 契約を変えたら registry を更新し `pnpm gen:openapi` → `pnpm openapi:check` / `pnpm openapi:coverage` を緑にする (CLAUDE.md の OpenAPI DoD)。

| メソッド | パス | 用途 | ロール | tag |
|---|---|---|---|---|
| GET | `/api/public/journal/entries` | 共有タイムライン取得 | teacher+ | Journal (Public) |
| POST | `/api/private/journal/entries` | エントリ作成 | teacher+ | Journal (Private) |
| GET | `/api/private/journal/entries/{id}` | エントリ取得 (所有者) | teacher+ | Journal (Private) |
| PUT | `/api/private/journal/entries/{id}` | エントリ更新 (所有者) | teacher+ | Journal (Private) |
| DELETE | `/api/private/journal/entries/{id}` | エントリ削除 (所有者) | teacher+ | Journal (Private) |
| GET | `/api/private/journal/entries/mine` | マイ記録取得 (公開+非公開) | teacher+ | Journal (Private) |
| POST | `/api/private/journal/entries/{id}/reactions` | リアクション付与 | teacher+ | Journal (Private) |
| DELETE | `/api/private/journal/entries/{id}/reactions` | リアクション削除 | teacher+ | Journal (Private) |
| GET | `/api/private/journal/tags` | 感情タグ一覧 | teacher+ | Tag |
| POST | `/api/private/journal/tags` | 感情タグ作成 | school_admin+ | Tag |
| DELETE | `/api/private/journal/tags/{id}` | 感情タグ削除 (default 不可) | school_admin+ | Tag |
| GET | `/api/private/journal/knowledge-tags` | ナレッジタグ一覧 (利用件数付) | teacher+ | Tag |
| POST | `/api/private/journal/knowledge-tags` | ナレッジタグ作成 | teacher+ | Tag |

キャッシュ方針: `/api/public/*` は `s-maxage` 付きで CloudFront キャッシュ可、`/api/private/*` は `no-store`。挙動の詳細は [entry-crud.md](./entry-crud.md)。
