# Unit-02 API 仕様（人間可読概要）

**機械可読版**: `/openapi.yaml`（リポジトリルート、Zod から自動生成）
**生成元**: `src/openapi/registry.ts`
**生成コマンド**: `pnpm gen:openapi`

## エンドポイント一覧

| Method | Path | 用途 | キャッシュ | ロール |
|---|---|---|---|---|
| GET | `/api/public/journal/entries` | 共有タイムライン | `public, s-maxage=30, swr=60` | teacher 以上 |
| POST | `/api/private/journal/entries` | エントリ作成 | `private, no-store` | teacher 以上 |
| GET | `/api/private/journal/entries/{id}` | エントリ単体取得（所有者のみ） | `private, no-store` | teacher 以上 |
| PUT | `/api/private/journal/entries/{id}` | エントリ更新（所有者のみ） | `private, no-store` | teacher 以上 |
| DELETE | `/api/private/journal/entries/{id}` | エントリ削除（所有者のみ） | `private, no-store` | teacher 以上 |
| GET | `/api/private/journal/entries/mine` | マイ記録（自分の全エントリ） | `private, no-store` | teacher 以上 |
| GET | `/api/private/journal/tags` | テナント内タグ一覧 | `private, no-store` | teacher 以上 |
| POST | `/api/private/journal/tags` | タグ作成 | `private, no-store` | teacher 以上 |
| DELETE | `/api/private/journal/tags/{id}` | タグ削除（システムデフォルト不可） | `private, no-store` | school_admin |

## パス名前空間の設計原則（SP-U02-04 Layer 1-2）

- **`/api/public/*`**: `is_public=true` のリソースのみ。CloudFront でエッジキャッシュ可能
- **`/api/private/*`**: 個人情報を含む可能性あり。CloudFront ではキャッシュ無効
- パス分離は CloudFront ビヘイビアと完全一致するため、設定漏れ時の漏えい事故を構造的に防止

## 共通エラーレスポンス

すべてのエンドポイントは以下の形式でエラーを返す:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "200文字以内で入力してください"
}
```

| Status | エラーコード | 意味 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod バリデーション失敗 |
| 400 | `INVALID_TAG_REFERENCE` | 別テナントのタグ ID を指定 |
| 401 | `UNAUTHORIZED` | セッション未取得 |
| 403 | `FORBIDDEN` | 権限不足（school_admin 必須等） |
| 404 | `JOURNAL_NOT_FOUND` | エントリが存在しない or 所有者でない |
| 404 | `TAG_NOT_FOUND` | タグが存在しない or 削除不可 |
| 405 | `METHOD_NOT_ALLOWED` | 許可外の HTTP メソッド |
| 423 | `TENANT_LOCKED` | テナント suspended |
| 500 | `INTERNAL_ERROR` | 予期しないエラー（詳細は露出しない） |

## 認証

- Auth.js の **database セッション戦略**（Step 8 で実装、SP-07）
- セッショントークンは HttpOnly Cookie `next-auth.session-token` で配布
- 全エンドポイントが `requireAuth` ミドルウェアを経由（401/403/423 を判定）

## キャッシュ戦略の詳細

### 共有タイムライン（`/api/public/journal/entries`）
```
Cache-Control: public, s-maxage=30, stale-while-revalidate=60
```
- CloudFront でエッジキャッシュ
- テナント内の教員全員で共有可能
- 30秒以内: キャッシュから即返却
- 30〜90秒: stale を返しつつバックグラウンド再検証
- 90秒超: 新規フェッチ
- **R4 受容**: エントリ投稿後の最大 90 秒遅延を許容

### マイ記録・CRUD（`/api/private/*`）
```
Cache-Control: private, no-store
```
- 絶対にキャッシュしない
- CloudFront はバイパス（CachingDisabled）
- 非公開エントリを含むためプライバシー保護

## リクエスト/レスポンスサンプル

### POST /api/private/journal/entries

**Request**:
```json
{
  "content": "今日の授業の振り返り",
  "tagIds": ["550e8400-e29b-41d4-a716-446655440000"],
  "isPublic": true
}
```

**Response 201**:
```json
{
  "entry": {
    "id": "abc-123",
    "tenantId": "tenant-1",
    "userId": "user-1",
    "content": "今日の授業の振り返り",
    "isPublic": true,
    "createdAt": "2026-04-15T10:00:00Z",
    "updatedAt": "2026-04-15T10:00:00Z"
  }
}
```

### GET /api/public/journal/entries?page=1&perPage=20

**Response 200**:
```json
{
  "entries": [
    {
      "id": "abc-123",
      "tenantId": "tenant-1",
      "userId": "user-1",
      "content": "今日の授業の振り返り",
      "createdAt": "2026-04-15T10:00:00Z",
      "updatedAt": "2026-04-15T10:00:00Z"
    }
  ],
  "page": 1,
  "perPage": 20
}
```
**注**: `isPublic` フィールドは VIEW 経由で**意図的に含まれない**（SP-U02-04 Layer 4）。

## トレーサビリティ

| ストーリー | 関連エンドポイント |
|---|---|
| US-T-010 (作成) | POST /api/private/journal/entries |
| US-T-011 (編集) | PUT /api/private/journal/entries/{id} |
| US-T-012 (削除) | DELETE /api/private/journal/entries/{id} |
| US-T-013 (タグ付与) | POST /api/private/journal/entries（tagIds）+ GET/POST/DELETE /api/private/journal/tags |
| US-T-014 (タイムライン) | GET /api/public/journal/entries + GET /api/private/journal/entries/mine |
| US-T-021 (感情カテゴリ) | タグ統合実装（is_emotion=true） |

## OpenAPI Swagger UI

開発時に `openapi.yaml` を Swagger UI で閲覧する手順:

```bash
npx @redocly/cli preview-docs openapi.yaml
# または
npx swagger-ui-watcher openapi.yaml
```

将来 `pages/api/docs.tsx` で内製 Swagger UI を配信することも可能（NODE_ENV=development のみ動作）。
