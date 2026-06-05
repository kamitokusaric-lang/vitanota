# auth — オンボーディング (招待フロー)

> 親: [overview.md](./overview.md)。ロール定義は [roles-and-rls.md](./roles-and-rls.md)、エラーは [error-catalog.md](./error-catalog.md)。
> 実装: `src/features/auth/lib/invitationService.ts`, `pages/api/invitations/`, `pages/api/auth/`。

## Step 0〜5 の流れ

### Step 0: 初回ブートストラップ (1 回限り)
`system_admin` が DB に未存在のとき。本番は `db-migrator` Lambda の `bootstrap-admin` コマンド、開発は SQL seed で `users` + `user_tenant_roles (tenant_id=NULL, role='system_admin')` を作る。

### Step 1: テナント作成 (`system_admin` のみ)
`POST /api/system/tenants` で `{ name, slug }`。同一トランザクションで `seedSystemDefaults()` がデフォルトタグ/カテゴリを作る。slug は `^[a-z0-9-]+$`・3〜50 文字・unique。

### Step 2: 招待トークン発行 (`system_admin` 任意テナント / `school_admin` 自テナントのみ)
`POST /api/invitations` で `{ email, role: teacher|school_admin, tenantId }`。
- 同一 `(tenantId, email)` の未使用トークンがあれば物理削除して再発行
- `crypto.randomBytes(48).base64url` で 384bit トークン生成、`expiresAt = now()+7日`
- MVP では自動メール送信なし。発行された inviteUrl を呼び出し元が手動配達

### Step 3: トークン検証 (認証不要) — `GET /api/invitations/[token]`
検証順: 存在しない→404 `NOT_FOUND` / 使用済み→410 `INVITE_USED` / 期限切れ→410 `INVITE_EXPIRED` / 正常→200 で `{ email, role, expiresAt }`。

### Step 4-5: 承諾 (2 パターン)

**パターン A — 未登録ユーザー** (`POST /api/auth/accept-invite`, 認証不要):
1. ID Token 検証 (署名・aud・exp・email_verified)
2. 招待トークンを (未使用・未期限切れ) で検索
3. `session.user.email === invitation.email` を確認 (不一致は 403 `EMAIL_MISMATCH`)
4. `users` に未登録なら INSERT (Google の name/picture から)
5. `user_tenant_roles` に `(userId, tenantId, role)` INSERT (重複は ON CONFLICT DO NOTHING)
6. `invitation.usedAt = now()` で消費
7. セッション発行 (Cookie)

**パターン B — 既登録ユーザー** (`POST /api/invitations/[token]`, 既存セッション必須):
A と同様だがユーザー作成はスキップ。メール一致確認は必須。

## ビジネスルール (抜粋)

- BR-INVITE-04: 再発行時は同 (tenant, email) の旧未使用トークンを物理削除 (重複回避)
- 招待トークンの有効期限は発行から 7 日
- メール不一致は必ず拒否 (招待先と Google アカウントの一致が前提)

シーケンス図は [foundation/sequence-diagrams.md](../../foundation/sequence-diagrams.md)。
