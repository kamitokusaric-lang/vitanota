# auth — API

> **OpenAPI 対象外**: `/api/auth/*`・`/api/invitations/*` は `scripts/check-openapi-coverage.ts` の `IGNORE_PREFIXES` に登録済み。
> 理由: 認証はユーザー向け業務 API ではなく内部実装。契約の最新は実コード (`pages/api/auth/`, `pages/api/invitations/`) を見る。

`IGNORE_PREFIXES` = `/api/system/`, `/api/auth/`, `/api/dev/`, `/api/school/`, `/api/test/`。

| メソッド | パス | 用途 | 認可 |
|---|---|---|---|
| POST | `/api/auth/google-signin` | ログイン (ID Token → セッション) | anonymous |
| POST | `/api/auth/accept-invite` | 招待受諾 (未登録ユーザー + ID Token) | anonymous |
| GET | `/api/auth/[...nextauth]` | NextAuth catch-all (signin/signout 等) | — |
| POST | `/api/invitations` | 招待トークン発行 | system_admin / school_admin (自テナント) |
| GET | `/api/invitations/[token]` | 招待トークン検証 | anonymous |
| POST | `/api/invitations/[token]` | 招待受諾 (既セッション) | 認証済み (email 一致) |

挙動の詳細: [onboarding.md](./onboarding.md)。エラーコードは [error-catalog.md](./error-catalog.md)。

> 補足: Google OAuth は VPC 内バックエンドから Google へ直接通信できず、かつ Web client は `client_secret` 必須のため、VPC 外の **Lambda Proxy** が Secrets Manager から secret を取得して `/token` 交換を代行する。詳細は [foundation/infrastructure.md](../../foundation/infrastructure.md)。
