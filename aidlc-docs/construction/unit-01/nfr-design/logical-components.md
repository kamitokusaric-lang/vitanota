# Unit-01 論理コンポーネント

## コンポーネント一覧

| コンポーネント | ファイルパス | 責務 |
|---|---|---|
| Logger | `src/shared/lib/logger.ts` | 構造化ログ（pino + redact） |
| SecretsLoader | `src/shared/lib/secrets.ts` | Secrets Manager SDK + 5分キャッシュ |
| DbAuthProvider | `src/shared/lib/db-auth.ts` | IAM トークン生成・12分キャッシュ |
| DbClient | `src/shared/lib/db.ts` | Drizzle + Pool シングルトン |
| RateLimiter | `src/shared/lib/rate-limit.ts` | IP ごとのレート制限（メモリベース） |
| HealthCheck | `pages/api/health.ts` | App Runner ヘルスチェックエンドポイント |
| withTenant | `src/shared/lib/db.ts` | PostgreSQL RLS 設定ラッパー |

---

## Logger

**ファイル**: `src/shared/lib/logger.ts`

**依存**: `pino`・`pino-http`

**インターフェース**:

```typescript
// アプリケーションログ
export const logger: pino.Logger;

// HTTP リクエストログ（API Routes で使用）
export const httpLogger: pino.middleware;

// リクエストスコープのロガー（requestId 付き）
export function createRequestLogger(requestId: string): pino.Logger;
```

**CloudWatch への転送**: App Runner の stdout が自動的に CloudWatch Logs に転送される。追加設定不要。

---

## SecretsLoader

**ファイル**: `src/shared/lib/secrets.ts`

**依存**: `@aws-sdk/client-secrets-manager`

**インターフェース**:

```typescript
// シークレット取得（5分キャッシュ付き）
export async function getSecret(secretId: string): Promise<string>;

// 起動時の一括プリロード
export async function preloadSecrets(secretIds: string[]): Promise<void>;
```

**キャッシュ戦略**:

```
取得 → メモリキャッシュに保存（TTL: 5分）
         ↓ 5分後
       キャッシュ無効化 → 次回アクセス時に再取得
```

**エラー処理**: 取得失敗時はアプリ起動を中止（フェイルセーフ）。

---

## DbAuthProvider

**ファイル**: `src/shared/lib/db-auth.ts`

**依存**: `@aws-sdk/rds-signer`

**インターフェース**:

```typescript
// IAM 認証トークン取得（12分キャッシュ付き）
export async function getDbAuthToken(): Promise<string>;
```

**キャッシュ戦略**:

```
IAM トークン有効期限: 15分
キャッシュ TTL: 12分（余裕を持って期限前に更新）

取得 → キャッシュ保存
         ↓ 12分後
       キャッシュ無効化 → 次の DB 接続時に新トークン取得
```

---

## DbClient

**ファイル**: `src/shared/lib/db.ts`

**依存**: `drizzle-orm`・`pg`・`DbAuthProvider`

**インターフェース**:

```typescript
// Drizzle インスタンス取得
export async function getDb(): Promise<DrizzleDb>;

// テナント隔離ラッパー
export async function withTenant<T>(
  tenantId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T>;
```

**withTenant の実装**:

```typescript
export async function withTenant<T>(
  tenantId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    // PostgreSQL RLS: このトランザクション内の全クエリにテナントIDを適用
    await tx.execute(
      sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    );
    return fn(tx);
  });
}
```

**コネクションプール設定**:

```
max: 10         RDS Proxy がプール管理するためアプリ側は小さく設定
idleTimeout: 30秒
ssl: require    RDS Proxy との通信を暗号化
```

---

## RateLimiter

**ファイル**: `src/shared/lib/rate-limit.ts`

**依存**: なし（メモリベース）

**インターフェース**:

```typescript
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// IP ごとのレート制限チェック
export function checkRateLimit(
  ip: string,
  limit: number,      // 最大リクエスト数
  windowMs: number    // 時間ウィンドウ（ミリ秒）
): RateLimitResult;
```

**制限設定**:

```
ログインエンドポイント（/api/auth/signin）:
  limit: 10回
  window: 60秒（1分）
  超過時: 429 Too Many Requests
```

**制約**: App Runner が複数インスタンスに水平スケールした場合、インスタンス間でカウンタは共有されない。MVP スケール（同時数百セッション）ではこの制約を許容する。

---

## HealthCheck

**ファイル**: `pages/api/health.ts`

**インターフェース**: `GET /api/health`

**レスポンス**:

```json
{
  "status": "ok",
  "timestamp": "2026-04-14T00:00:00.000Z"
}
```

**意図的に含めないもの**: DB 接続チェック（重い処理を避け、App Runner のチェック間隔内に応答する）

---

## コンポーネント起動フロー

```
App Runner コンテナ起動
        ↓
[1] SecretsLoader.preloadSecrets()
    - vitanota/nextauth-secret
    - vitanota/google-client-id
    - vitanota/google-client-secret
        ↓ 失敗 → プロセス終了（フェイルセーフ）
[2] DbAuthProvider: IAM トークン初期取得
        ↓ 失敗 → プロセス終了（フェイルセーフ）
[3] DbClient: Pool 初期化
        ↓
[4] Next.js サーバー起動
        ↓
[5] /api/health が 200 を返す
        ↓
App Runner がトラフィックを向ける（デプロイ完了）
```

---

## インフラ論理構成図

```
                   インターネット
                        |
              [AWS ALB / App Runner Ingress]
                        |
              [App Runner コンテナ]
              ┌──────────────────┐
              │ Logger           │ → CloudWatch Logs
              │ SecretsLoader    │ → Secrets Manager
              │ DbAuthProvider   │ → IAM（トークン生成）
              │ DbClient         │
              │ RateLimiter      │
              └────────┬─────────┘
                       │ VPC コネクター
              [RDS Proxy]（VPC 内）
                       │ IAM 認証・SSL
              [RDS PostgreSQL]（VPC 内・Multi-AZ）
```

---

## 環境変数マッピング（Unit-01）

| 環境変数 | 取得元 | 用途 |
|---|---|---|
| `RDS_PROXY_ENDPOINT` | App Runner 環境変数 | DB 接続先ホスト |
| `DB_USER` | App Runner 環境変数 | DB ユーザー名 |
| `DB_NAME` | App Runner 環境変数 | DB 名 |
| `AWS_REGION` | App Runner 環境変数 | リージョン（ap-northeast-1） |
| `NEXTAUTH_URL` | App Runner 環境変数 | Auth.js コールバック URL |
| `NEXTAUTH_SECRET` | Secrets Manager → SecretsLoader | JWT 署名キー |
| `GOOGLE_CLIENT_ID` | Secrets Manager → SecretsLoader | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Secrets Manager → SecretsLoader | Google OAuth |
