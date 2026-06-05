# Unit-01 コード生成サマリー

## 実装ストーリー

| ストーリーID | タイトル | ステータス |
|---|---|---|
| US-T-001 | Google アカウントでログインする | 実装済み |
| US-T-002 | ログアウトする | 実装済み |
| US-S-001 | 新規学校テナントを作成する | 実装済み |
| US-S-002 | テナントを停止する | 実装済み |

---

## 生成ファイル一覧

### プロジェクト設定

| ファイル | 説明 |
|---|---|
| `package.json` | 依存関係定義 |
| `tsconfig.json` | TypeScript 設定（strict モード・paths 設定） |
| `next.config.js` | セキュリティヘッダー（BR-SEC-02）・画像ドメイン |
| `tailwind.config.ts` | Tailwind CSS 設定 |
| `postcss.config.js` | PostCSS 設定 |
| `vitest.config.ts` | テスト設定（jsdom・coverage 80%） |
| `.env.example` | 必要な環境変数一覧 |
| `.gitignore` | Git 除外設定 |
| `Dockerfile` | マルチステージビルド（deps/builder/runner） |
| `.dockerignore` | Docker 除外設定 |

### 型定義

| ファイル | 説明 |
|---|---|
| `next-auth.d.ts` | Session・JWT 型拡張 |
| `src/shared/types/auth.ts` | VitanotaJWT・VitanotaSession・Role 型 |

### データベース

| ファイル | 説明 |
|---|---|
| `src/db/schema.ts` | Drizzle ORM スキーマ（5テーブル） |
| `migrations/0001_unit01_initial.sql` | 初期マイグレーション SQL（RLS 設定含む） |

### 共有インフラライブラリ

| ファイル | 実装パターン |
|---|---|
| `src/shared/lib/logger.ts` | SP-01 Redact パターン（pino） |
| `src/shared/lib/secrets.ts` | SP-03 シークレットキャッシュ（5分 TTL） |
| `src/shared/lib/db-auth.ts` | SP-02 IAM トークン認証（12分キャッシュ） |
| `src/shared/lib/db.ts` | PP-01 Drizzle シングルトン + withTenant |
| `src/shared/lib/rate-limit.ts` | BR-SEC-01 IP ごとレート制限 |

### Auth.js

| ファイル | 説明 |
|---|---|
| `src/features/auth/lib/auth-options.ts` | signIn / jwt / session コールバック |
| `pages/api/auth/[...nextauth].ts` | Auth.js ハンドラー |

### API Routes

| ファイル | エンドポイント | 権限 |
|---|---|---|
| `pages/api/health.ts` | GET /api/health | 不要 |
| `pages/api/system/tenants.ts` | GET/POST/PATCH /api/system/tenants | system_admin |
| `pages/api/invitations/index.ts` | POST /api/invitations | system_admin / school_admin |
| `pages/api/invitations/[token].ts` | GET/POST /api/invitations/[token] | GET 不要 / POST 認証済み |

### 共有 UI コンポーネント

| ファイル | 説明 |
|---|---|
| `src/shared/components/Button.tsx` | 汎用ボタン（variant・isLoading・data-testid） |
| `src/shared/components/LoadingSpinner.tsx` | ローディングスピナー（アクセシビリティ対応） |
| `src/shared/components/ErrorMessage.tsx` | エラーメッセージ（onRetry オプション） |
| `src/shared/components/Layout.tsx` | ナビゲーションバー付きレイアウト |

### 認証 HOC

| ファイル | 説明 |
|---|---|
| `src/features/auth/components/TenantGuard.tsx` | セッション検証・停止中テナント表示 |
| `src/features/auth/components/RoleGuard.tsx` | ロール不足時 fallback |

### ページ

| ファイル | 説明 |
|---|---|
| `pages/_app.tsx` | SessionProvider ラッパー |
| `pages/index.tsx` | ロール別リダイレクト（BR-ROLE-03） |
| `pages/auth/signin.tsx` | Google ログインページ |
| `pages/auth/invite.tsx` | 招待トークン処理ページ |
| `pages/dashboard/teacher.tsx` | 教員ダッシュボード（プレースホルダー） |
| `pages/dashboard/admin.tsx` | 管理者ダッシュボード（プレースホルダー） |
| `pages/admin/tenants.tsx` | テナント管理画面（system_admin） |

### テスト

| ファイル | テスト対象 |
|---|---|
| `__tests__/setup.ts` | jest-dom セットアップ |
| `__tests__/unit/rate-limit.test.ts` | レート制限ロジック（5ケース） |
| `__tests__/unit/auth-callbacks.test.ts` | Auth コールバック・ロール別リダイレクト |
| `__tests__/unit/TenantGuard.test.tsx` | セッションなし・停止中・正常（3ケース） |
| `__tests__/unit/RoleGuard.test.tsx` | ロールあり・なし・fallback・複数ロール（4ケース） |

### デプロイ成果物

| ファイル | 説明 |
|---|---|
| `.github/workflows/ci.yml` | PR 時: Lint・型チェック・テスト |
| `.github/workflows/deploy.yml` | main マージ時: Build→ECR→Dev→Prod（手動承認） |

---

## セキュリティルール実装状況

| ルール | 実装ファイル |
|---|---|
| BR-SEC-01 レート制限 | `src/shared/lib/rate-limit.ts` |
| BR-SEC-02 HTTP ヘッダー | `next.config.js` |
| BR-SEC-03 クッキー | `src/features/auth/lib/auth-options.ts`（Auth.js JWT 設定） |
| BR-SEC-04 エラー情報漏洩防止 | 全 API routes |
| BR-SEC-05 入力バリデーション | Zod スキーマ（tenants・invitations API） |
| BR-SEC-06 構造化ログ | `src/shared/lib/logger.ts`（pino redact） |
