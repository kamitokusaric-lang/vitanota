# feedback — API

> **契約の正本は `src/openapi/registry.ts` (tag: `Feedback`) と `src/openapi/aiChatFeedbackSchemas.ts`、生成物 `openapi.yaml`。**
> 本ファイルは索引。ボディ定義を複写しない。

## 教員向け (OpenAPI 対象)

| メソッド | パス | 用途 | tag |
|---|---|---|---|
| GET | `/api/feedback/topics` | トピック一覧 (active のみ) | Feedback |
| POST | `/api/feedback/submissions` | フィードバック投稿 | Feedback |
| GET | `/api/feedback/my-threads` | 自分のスレッド一覧 (?summary=1 で要約) | Feedback |
| POST | `/api/feedback/mark-read` | スレッド一括既読化 | Feedback |

## 管理者向け (OpenAPI 対象外: `/api/system/` IGNORE)

| メソッド | パス | 用途 | 権限 |
|---|---|---|---|
| GET | `/api/system/feedback` | 全投稿一覧 (tenant/topic フィルタ) | system_admin |
| GET/POST | `/api/system/feedback/topics` | トピック一覧/作成 | system_admin |
| PATCH | `/api/system/feedback/topics/[id]` | トピック更新 | system_admin |
| GET | `/api/system/feedback/submissions/[id]/replies` | 返信一覧 | system_admin |
| POST | `/api/system/feedback/submissions/[id]/replies` | 返信投稿 (body 1〜5000 字) | system_admin |

挙動は [overview.md](./overview.md)。
