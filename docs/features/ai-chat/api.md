# ai-chat — API

> **契約の正本は `src/openapi/registry.ts` (tag: `AI Chat`) と `src/openapi/aiChatFeedbackSchemas.ts`、生成物 `openapi.yaml`。**
> 本ファイルは索引。ボディ定義を複写しない。契約変更時は registry 更新 → `pnpm gen:openapi` → `openapi:check`/`coverage` 緑 (OpenAPI DoD)。

| メソッド | パス | 用途 | tag |
|---|---|---|---|
| POST | `/api/ai-chat/extract` | テキストから候補抽出 (Bedrock 呼出) | AI Chat |
| POST | `/api/ai-chat/confirm` | 候補の確定または破棄 | AI Chat |
| POST | `/api/ai-chat/events` | 利用計測イベント記録 | AI Chat |
| POST | `/api/ai-chat/feedback` | 編集/破棄理由の記録 | AI Chat |

権限: teacher / school_admin。レート制限: 教員ごと 1 日上限 (`AI_CHAT_RATE_LIMIT_PER_DAY`、PostgreSQL Fixed Window)。

関連 env: `AI_CHAT_LAMBDA_ARN` (Bedrock Lambda)、`AI_CHAT_LOCAL_MOCK` (ローカルはモック抽出 `mockExtraction.ts`)。挙動・踏み絵は [overview.md](./overview.md)。
