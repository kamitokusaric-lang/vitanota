# Unit-01 コード生成プラン

## 実行チェックリスト

### PART 1: プランニング
- [x] Step 1: ユニットコンテキスト分析（設計成果物・ストーリーマップ読み込み）
- [x] Step 2: コード生成プラン作成（本ファイル）
- [x] Step 3: ユーザーへの提示・承認待ち

### PART 2: 生成
- [x] Step 4: プロジェクト構造セットアップ（package.json・tsconfig・next.config.js 等）
- [x] Step 5: 型定義（src/shared/types/auth.ts・next-auth.d.ts）
- [x] Step 6: データベーススキーマ（src/db/schema.ts・マイグレーション SQL）
- [x] Step 7: 共有インフラライブラリ（logger・secrets・db-auth・db・rate-limit）
- [x] Step 8: Auth.js 設定（auth-options.ts・pages/api/auth/[...nextauth].ts）
- [x] Step 9: API — ヘルスチェック（pages/api/health.ts）
- [x] Step 10: API — テナント管理（pages/api/system/tenants.ts）
- [x] Step 11: API — 招待（pages/api/invitations/index.ts・[token].ts）
- [x] Step 12: 共有 UI コンポーネント（Button・LoadingSpinner・ErrorMessage・Layout）
- [x] Step 13: 認証 HOC コンポーネント（TenantGuard・RoleGuard）
- [x] Step 14: ページ（signin・invite・dashboard placeholders・_app・index）
- [x] Step 15: ユニットテスト（rate-limit・auth-callbacks・TenantGuard・RoleGuard）
- [x] Step 16: デプロイ成果物（Dockerfile・GitHub Actions ワークフロー）
- [x] Step 17: ドキュメントサマリー（aidlc-docs/construction/unit-01/code/code-summary.md）
- [x] Step 18: 進捗更新（aidlc-state.md）・audit.md 記録
- [x] Step 19: 完了メッセージ提示

---

## ユニットコンテキスト

### 担当ストーリー

| ストーリーID | タイトル | 優先度 |
|---|---|---|
| US-T-001 | Google アカウントでログインする | 🔴 Must |
| US-T-002 | ログアウトする | 🔴 Must |
| US-S-001 | 新規学校テナントを作成する | 🔴 Must |
| US-S-002 | テナントを停止する | 🟡 Should |

### 依存関係

- **上流依存**: なし（Unit-01 は基盤ユニット）
- **下流提供**: Unit-02〜04 が利用する認証基盤・withTenant・DB 接続
- **外部依存**: Google OAuth、AWS (App Runner・RDS Proxy・Secrets Manager・IAM)

### DB エンティティ（Unit-01 所有）

- `tenants` — テナント（学校）
- `users` — ユーザー
- `user_tenant_roles` — ユーザーとテナントのロール紐づけ
- `invitation_tokens` — 招待トークン
- `accounts` — Auth.js OAuth アカウント（自動管理）

---

## 生成ファイル一覧

### アプリケーションコード（ワークスペースルート）

```
vitanota/
├── package.json
├── tsconfig.json
├── next.config.js                            (セキュリティヘッダー含む)
├── .env.example
├── .gitignore
├── Dockerfile
├── .dockerignore
├── next-auth.d.ts                            (型拡張)
│
├── src/
│   ├── shared/
│   │   ├── types/
│   │   │   └── auth.ts                       (VitanotaJWT・VitanotaSession 型)
│   │   ├── lib/
│   │   │   ├── logger.ts                     (pino + redact)
│   │   │   ├── secrets.ts                    (Secrets Manager + 5分キャッシュ)
│   │   │   ├── db-auth.ts                    (IAM トークン + 12分キャッシュ)
│   │   │   ├── db.ts                         (Drizzle シングルトン + withTenant)
│   │   │   └── rate-limit.ts                 (IP ごとメモリベースレート制限)
│   │   └── components/
│   │       ├── Button.tsx
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorMessage.tsx
│   │       └── Layout.tsx
│   ├── features/
│   │   └── auth/
│   │       ├── lib/
│   │       │   └── auth-options.ts           (NextAuth authOptions)
│   │       └── components/
│   │           ├── TenantGuard.tsx
│   │           └── RoleGuard.tsx
│   └── db/
│       └── schema.ts                         (Drizzle スキーマ定義)
│
├── pages/
│   ├── _app.tsx
│   ├── index.tsx                             (ロール別リダイレクト)
│   ├── auth/
│   │   ├── signin.tsx
│   │   └── invite.tsx                        (招待トークン処理)
│   ├── dashboard/
│   │   ├── teacher.tsx                       (プレースホルダー)
│   │   └── admin.tsx                         (プレースホルダー)
│   ├── admin/
│   │   └── tenants.tsx                       (プレースホルダー)
│   └── api/
│       ├── health.ts
│       ├── auth/
│       │   └── [...nextauth].ts
│       ├── system/
│       │   └── tenants.ts                    (POST: 作成, GET: 一覧, PATCH: 停止/再開)
│       └── invitations/
│           ├── index.ts                      (POST: 招待発行)
│           └── [token].ts                    (GET: トークン検証, POST: 招待承諾)
│
├── __tests__/
│   ├── unit/
│   │   ├── rate-limit.test.ts
│   │   ├── auth-callbacks.test.ts
│   │   ├── TenantGuard.test.tsx
│   │   └── RoleGuard.test.tsx
│   └── setup.ts                              (Vitest セットアップ)
│
└── .github/
    └── workflows/
        ├── ci.yml
        └── deploy.yml
```

### ドキュメント（aidlc-docs/）

```
aidlc-docs/construction/unit-01/code/
└── code-summary.md
```

---

## ステップ詳細

### Step 4: プロジェクト構造セットアップ

生成対象:
- `package.json` — 依存関係: next・react・react-dom・next-auth・drizzle-orm・pg・pino・zod + AWS SDK (@aws-sdk/client-secrets-manager・@aws-sdk/rds-signer)
- `tsconfig.json` — strict モード・paths 設定（@/→src/）
- `next.config.js` — セキュリティヘッダー（BR-SEC-02）・画像ドメイン設定
- `.env.example` — 必要な環境変数一覧
- `.gitignore`
- `Dockerfile` — マルチステージビルド（deps→builder→runner）
- `.dockerignore`

### Step 5: 型定義

生成対象:
- `src/shared/types/auth.ts` — `VitanotaJWT`・`VitanotaSession`・ロール型
- `next-auth.d.ts` — `Session`・`JWT` 型拡張（next-auth モジュール augmentation）

### Step 6: データベーススキーマ

生成対象:
- `src/db/schema.ts` — Drizzle ORM スキーマ（tenants・users・user_tenant_roles・invitation_tokens・accounts）
- `migrations/0001_unit01_initial.sql` — 初期マイグレーション SQL（テーブル作成・RLS 設定）

### Step 7: 共有インフラライブラリ

生成対象（NFR設計パターンの実装）:
- `src/shared/lib/logger.ts` — SP-01 Redact パターン
- `src/shared/lib/secrets.ts` — SP-03 シークレットキャッシュパターン（5分TTL）
- `src/shared/lib/db-auth.ts` — SP-02 IAM トークン認証（12分キャッシュ）
- `src/shared/lib/db.ts` — PP-01 Drizzle シングルトン + `withTenant()`
- `src/shared/lib/rate-limit.ts` — BR-SEC-01 IP ごとレート制限（メモリベース）

### Step 8: Auth.js 設定

生成対象:
- `src/features/auth/lib/auth-options.ts` — `authOptions`（GoogleProvider・JWT コールバック・signIn コールバック・リダイレクト）
- `pages/api/auth/[...nextauth].ts` — Auth.js ハンドラー

**BP-01 ログインフロー実装**:
- `signIn` コールバック: users テーブル存在確認（招待なし拒否: BR-AUTH-01）
- `jwt` コールバック: user_tenant_roles・tenants からロール・テナント情報を取得してJWTに付与
- `session` コールバック: JWTペイロードをセッションに反映
- `pages` 設定: `signIn: '/auth/signin'`
- セッション: JWT方式、maxAge・updateAge = 86400（24時間: BR-AUTH-02）

### Step 9: API — ヘルスチェック

生成対象:
- `pages/api/health.ts` — RP-02 ヘルスチェックパターン

```typescript
// GET /api/health → 200 { status: 'ok', timestamp: '...' }
// DB 接続チェックなし
```

### Step 10: API — テナント管理

生成対象:
- `pages/api/system/tenants.ts`

| メソッド | 処理 | 権限 |
|---|---|---|
| GET | テナント一覧取得 | system_admin |
| POST | テナント作成（BP-03） | system_admin |
| PATCH | テナント状態変更（停止/再開: BP-04） | system_admin |

**実装ポイント**:
- Zod で入力バリデーション（BR-SEC-05）
- withTenant なし（system_admin は全テナント管理）
- エラーレスポンス形式: `{ error: 'CODE', message: '...' }`（BR-SEC-04）

### Step 11: API — 招待

生成対象:
- `pages/api/invitations/index.ts` — POST: 招待発行（BP-02 Step 1〜3）
- `pages/api/invitations/[token].ts` — GET: トークン検証、POST: 招待承諾（BP-02 Step 4〜7）

| メソッド | エンドポイント | 処理 | 権限 |
|---|---|---|---|
| POST | /api/invitations | 招待トークン発行 | system_admin または school_admin |
| GET | /api/invitations/[token] | トークン情報取得 | 認証不要（招待ページで使用） |
| POST | /api/invitations/[token] | 招待承諾（ユーザー+ロール作成） | 認証済みユーザー |

### Step 12: 共有 UI コンポーネント

生成対象（Tailwind CSS を使用したシンプルなスタイル）:
- `src/shared/components/Button.tsx` — variant（primary/secondary/danger）・isLoading・data-testid
- `src/shared/components/LoadingSpinner.tsx` — size（sm/md/lg）・role="status"・aria-label
- `src/shared/components/ErrorMessage.tsx` — message・onRetry オプション
- `src/shared/components/Layout.tsx` — ナビゲーションバー（ロール別リンク）・signOut 連携

### Step 13: 認証 HOC コンポーネント

生成対象:
- `src/features/auth/components/TenantGuard.tsx` — セッション検証・停止中テナント表示
- `src/features/auth/components/RoleGuard.tsx` — ロール不足時 fallback

### Step 14: ページ

生成対象:
- `pages/_app.tsx` — SessionProvider 設定
- `pages/index.tsx` — getServerSideProps でロール別リダイレクト（BR-ROLE-03）
- `pages/auth/signin.tsx` — Google ログインボタン・エラー表示（LoginPage）
- `pages/auth/invite.tsx` — トークン検証・Google OAuth 誘導
- `pages/dashboard/teacher.tsx` — プレースホルダー（Unit-02 で実装）
- `pages/dashboard/admin.tsx` — プレースホルダー（Unit-04 で実装）
- `pages/admin/tenants.tsx` — system_admin 用テナント管理画面（create/suspend）

**全保護ページに getServerSideProps パターン適用**（BR-ROLE-04）

### Step 15: ユニットテスト

生成対象（Vitest + @testing-library/react）:
- `__tests__/setup.ts` — テスト環境設定
- `__tests__/unit/rate-limit.test.ts` — レート制限ロジック（制限内/超過/リセット）
- `__tests__/unit/auth-callbacks.test.ts` — signIn・jwt・session コールバック（招待なし拒否・ロール付与・テナント状態）
- `__tests__/unit/TenantGuard.test.tsx` — セッションなし・停止中・正常
- `__tests__/unit/RoleGuard.test.tsx` — ロールあり・なし・fallback

**カバレッジ目標**: ビジネスロジック 80%（NFR要件）

### Step 16: デプロイ成果物

生成対象:
- `Dockerfile` — マルチステージビルド（deps/builder/runner）
- `.dockerignore`
- `.github/workflows/ci.yml` — PR 時: Lint・型チェック・テスト
- `.github/workflows/deploy.yml` — main マージ時: Build→ECR Push→App Runner Deploy

### Step 17: ドキュメントサマリー

生成対象:
- `aidlc-docs/construction/unit-01/code/code-summary.md` — 生成ファイル一覧・実装した BR/SP 参照

---

## セキュリティ拡張機能 コンプライアンス

| ルール | ステータス | 対応 |
|---|---|---|
| SECURITY-03（ログ機密情報） | 適用 | SP-01 pino redact で実装 |
| SECURITY-04（HTTP ヘッダー） | 適用 | next.config.js headers() で実装 |
| SECURITY-05（入力検証） | 適用 | Zod スキーマバリデーション |
| SECURITY-06（最小権限） | 適用 | IAM トークン認証・ロール検証 |
| SECURITY-11（レート制限） | 適用 | rate-limit.ts で実装 |
| SECURITY-12（クッキー） | 適用 | Auth.js HttpOnly・SameSite=Lax |
| SECURITY-15（エラー情報） | 適用 | フェイルセーフパターン |
