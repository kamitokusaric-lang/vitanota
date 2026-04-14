# Unit-01 ドメインエンティティ

## エンティティ一覧

| エンティティ | テーブル名 | 説明 |
|---|---|---|
| Tenant | `tenants` | 学校（組織）単位のテナント |
| User | `users` | 認証ユーザー（Auth.js 管理） |
| UserTenantRole | `user_tenant_roles` | ユーザーとテナントのロール紐づけ |
| InvitationToken | `invitation_tokens` | 招待リンクトークン |
| Account | `accounts` | Auth.js が管理する OAuth アカウント |
| Session | `sessions` | Auth.js が管理するセッション（DB セッション方式使用しない場合は不要） |
| VerificationToken | `verification_tokens` | Auth.js が管理するメール認証トークン |

---

## Tenant

```
tenants
├── id            UUID          PK, DEFAULT gen_random_uuid()
├── name          VARCHAR(100)  NOT NULL  学校名
├── slug          VARCHAR(50)   NOT NULL UNIQUE  URLキー（例: honjo-elementary）
├── status        VARCHAR(20)   NOT NULL DEFAULT 'active'  ('active' | 'suspended')
├── created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
└── updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
```

**RLS ポリシー**:
- system_admin: 全テナントにアクセス可
- 一般ユーザー: tenants テーブルへの直接アクセスは API 経由のみ（RLS は各テーブルで設定）

---

## User

```
users
├── id            UUID          PK, DEFAULT gen_random_uuid()
├── email         VARCHAR(255)  NOT NULL UNIQUE
├── name          VARCHAR(100)
├── image         TEXT          プロフィール画像 URL（Google から取得）
├── email_verified TIMESTAMPTZ  Auth.js 管理（Google OAuth では自動で設定）
├── created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
└── updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
```

**注記**: Auth.js v4 の標準スキーマに準拠。tenant_id はこのテーブルに持たず、
`user_tenant_roles` で管理する（複数ロール・複数テナント対応）。

---

## UserTenantRole

```
user_tenant_roles
├── id            UUID          PK, DEFAULT gen_random_uuid()
├── user_id       UUID          NOT NULL FK → users.id ON DELETE CASCADE
├── tenant_id     UUID          FK → tenants.id ON DELETE CASCADE  NULL許可（system_admin用）
├── role          VARCHAR(20)   NOT NULL  ('teacher' | 'school_admin' | 'system_admin')
├── created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
└── UNIQUE(user_id, tenant_id, role)
```

**ロール別の tenant_id**:
- system_admin: `tenant_id = NULL`
- school_admin: `tenant_id = <テナントID>`
- teacher: `tenant_id = <テナントID>`

**RLS ポリシー**:
- `SET LOCAL app.tenant_id = <tenantId>` 後、`tenant_id = current_setting('app.tenant_id')::uuid` でフィルタリング

---

## InvitationToken

```
invitation_tokens
├── id            UUID          PK, DEFAULT gen_random_uuid()
├── tenant_id     UUID          NOT NULL FK → tenants.id ON DELETE CASCADE
├── email         VARCHAR(255)  NOT NULL  招待先メールアドレス
├── role          VARCHAR(20)   NOT NULL  付与するロール ('teacher' | 'school_admin')
├── token         VARCHAR(64)   NOT NULL UNIQUE  ランダムトークン（UUID v4 を base64url エンコード）
├── invited_by    UUID          NOT NULL FK → users.id  招待者
├── expires_at    TIMESTAMPTZ   NOT NULL  発行から 7 日後
├── used_at       TIMESTAMPTZ   NULL  使用済みの場合に記録
└── created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
```

**有効条件**: `used_at IS NULL AND expires_at > now()`

---

## Account（Auth.js 標準）

```
accounts
├── id                   UUID          PK
├── user_id              UUID          NOT NULL FK → users.id ON DELETE CASCADE
├── type                 VARCHAR(50)   NOT NULL  ('oauth')
├── provider             VARCHAR(50)   NOT NULL  ('google')
├── provider_account_id  VARCHAR(255)  NOT NULL
├── refresh_token        TEXT
├── access_token         TEXT
├── expires_at           INTEGER
├── token_type           VARCHAR(50)
├── scope                TEXT
├── id_token             TEXT
└── UNIQUE(provider, provider_account_id)
```

---

## JWT ペイロード定義（TypeScript）

```typescript
interface VitanotaJWT {
  userId: string;
  email: string;
  name: string;
  image: string | null;
  tenantId: string | null;    // null = system_admin
  roles: ('teacher' | 'school_admin' | 'system_admin')[];
  tenantStatus: 'active' | 'suspended' | null;  // null = system_admin
  iat: number;
  exp: number;
}

interface VitanotaSession {
  user: {
    userId: string;
    email: string;
    name: string;
    image: string | null;
    tenantId: string | null;
    roles: ('teacher' | 'school_admin' | 'system_admin')[];
    tenantStatus: 'active' | 'suspended' | null;
  };
  expires: string;
}
```

---

## エンティティ関係図

```
tenants (1) ─────────────── (*) user_tenant_roles
              tenant_id

users (1) ───────────────── (*) user_tenant_roles
              user_id

users (1) ───────────────── (*) accounts
              user_id

users (1) ───────────────── (*) invitation_tokens (invited_by)
              invited_by

tenants (1) ─────────────── (*) invitation_tokens
              tenant_id
```

---

## DB 初期設定（RLS 有効化）

```sql
-- RLS を有効化するテーブル（Unit-01）
ALTER TABLE user_tenant_roles ENABLE ROW LEVEL SECURITY;

-- アプリケーション設定変数
-- withTenant() が SET LOCAL app.tenant_id = '<tenantId>' を発行する
-- RLS ポリシーはこの変数を参照してフィルタリングする

-- user_tenant_roles の RLS ポリシー
CREATE POLICY tenant_isolation ON user_tenant_roles
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    OR current_setting('app.tenant_id', true) = 'system_admin'
  );
```

**注記**: `tenants` テーブル・`users` テーブル・`invitation_tokens` テーブルの
RLS ポリシーはアプリケーションレベルの認証チェックで管理し、
DB レベルの RLS は後続ユニットのデータテーブルに集中させる。
