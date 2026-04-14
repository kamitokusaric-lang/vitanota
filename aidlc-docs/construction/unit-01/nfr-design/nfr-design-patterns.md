# Unit-01 NFR設計パターン

## 適用パターン一覧

| カテゴリ | パターン | 対象 |
|---|---|---|
| セキュリティ | Redact パターン | 構造化ログ（pino redact） |
| セキュリティ | IAM トークン認証 | RDS Proxy 接続 |
| セキュリティ | シークレットキャッシュ | Secrets Manager SDK |
| セキュリティ | 多層防御 | 認証・テナント隔離・RLS |
| 信頼性 | フェイルセーフデフォルト | 認証エラー・DB エラー |
| 信頼性 | ヘルスチェック | App Runner |
| パフォーマンス | コネクション再利用 | Drizzle + RDS Proxy |
| 可観測性 | 構造化ログ | pino + CloudWatch |
| 可観測性 | メトリクス監視 | CloudWatch アラーム |

---

## セキュリティパターン

### SP-01: Redact パターン（pino）

**目的**: SECURITY-03 準拠。機密情報がログに混入することを仕組みとして防ぐ。

**設計**:

```typescript
// src/shared/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',   // Bearer トークン
      'req.headers.cookie',           // セッションクッキー
      '*.password',                   // パスワード全般
      '*.token',                      // トークン全般
      '*.secret',                     // シークレット全般
      '*.accessToken',                // OAuth アクセストークン
      '*.refreshToken',               // OAuth リフレッシュトークン
      'DATABASE_URL',                 // DB 接続文字列
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'vitanota',
    unit: 'unit-01',
  },
});
```

**ログフォーマット**:

```json
{
  "level": "info",
  "time": "2026-04-14T00:00:00.000Z",
  "service": "vitanota",
  "unit": "unit-01",
  "requestId": "req-abc-123",
  "event": "auth.login.success",
  "userId": "user-uuid",
  "tenantId": "tenant-uuid"
}
```

**禁止事項**: メールアドレス・氏名・感情スコア等の個人情報もログに含めない。

---

### SP-02: IAM トークン認証パターン（RDS Proxy）

**目的**: SECURITY-06（最小権限）・SECURITY-12（認証管理）準拠。静的パスワードを持たない。

**仕組み**:

```
App Runner（IAM ロール付き）
        ↓
① IAM トークン生成（aws-sdk で自動）
   有効期限: 15分
        ↓
② RDS Proxy へ接続
   host: <proxy-endpoint>.proxy-xxx.ap-northeast-1.rds.amazonaws.com
   user: <db-user>
   password: <IAM トークン>（15分で失効）
   ssl: require
```

**接続文字列の生成**:

```typescript
// src/shared/lib/db-auth.ts
import { Signer } from '@aws-sdk/rds-signer';

const signer = new Signer({
  hostname: process.env.RDS_PROXY_ENDPOINT!,
  port: 5432,
  region: 'ap-northeast-1',
  username: process.env.DB_USER!,
});

export async function getDbConnectionToken(): Promise<string> {
  return signer.getAuthToken();
}
```

**トークンキャッシュ**: IAM トークンは 15分有効。12分でキャッシュを破棄し再生成することでパフォーマンスと安全性を両立する。

---

### SP-03: シークレットキャッシュパターン（Secrets Manager）

**目的**: ローテーション後 5分以内に新しい値を反映しつつ、Secrets Manager への過剰な API コールを防ぐ。

**設計**:

```typescript
// src/shared/lib/secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'ap-northeast-1' });
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getSecret(secretId: string): Promise<string> {
  const cached = cache.get(secretId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  const value = response.SecretString!;

  cache.set(secretId, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return value;
}
```

**管理対象シークレット**:

| シークレット名 | 内容 | ローテーション |
|---|---|---|
| `vitanota/db-user` | DB ユーザー名 | なし（固定） |
| `vitanota/nextauth-secret` | JWT 署名キー | 90日ごと（手動） |
| `vitanota/google-client-id` | Google OAuth ID | なし |
| `vitanota/google-client-secret` | Google OAuth シークレット | 必要時 |

---

### SP-04: 多層防御パターン

**目的**: SECURITY-11 準拠。単一の防御が突破されても次の層が防ぐ。

```
[Layer 1] レート制限
  └─ ログインエンドポイント: IP ごと 10回/分
        ↓
[Layer 2] Auth.js セッション検証
  └─ JWT 署名検証・有効期限確認
        ↓
[Layer 3] テナント状態確認
  └─ suspended → 423 Locked
        ↓
[Layer 4] ロール検証（RoleGuard）
  └─ 必要ロール不足 → 403 Forbidden
        ↓
[Layer 5] withTenant()
  └─ PostgreSQL RLS による DB レベル隔離
```

---

## 信頼性パターン

### RP-01: フェイルセーフデフォルトパターン

**目的**: SECURITY-15 準拠。エラー時は必ず「拒否」に倒す。

**ルール**:

| 状況 | フェイルセーフ動作 |
|---|---|
| セッション取得失敗 | 未認証として扱い → 401 |
| テナント状態取得失敗 | 停止中として扱い → 423 |
| ロール取得失敗 | 権限なしとして扱い → 403 |
| DB 接続失敗 | 500 を返す（詳細は露出しない） |
| Secrets Manager 取得失敗 | 起動を中止（シークレットなしでは動作しない） |

**エラーレスポンス形式**（SECURITY-15 準拠）:

```typescript
// 内部エラーを露出しない
{ error: 'INTERNAL_ERROR', message: '処理中にエラーが発生しました' }

// スタックトレース・DB エラー・ファイルパスは含めない
```

---

### RP-02: App Runner ヘルスチェックパターン

**目的**: デプロイ時のゼロダウンタイムと障害の自動検知。

**設定**:

```
ヘルスチェックエンドポイント: GET /api/health
期待レスポンス: 200 OK
チェック間隔: 10秒
失敗閾値: 3回連続失敗でインスタンス置換
```

**ヘルスチェックの内容**:

```typescript
// pages/api/health.ts
export default function handler(req, res) {
  // DB 接続チェックはしない（重い処理を避ける）
  // アプリが起動しているかのみ確認
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}
```

---

## パフォーマンスパターン

### PP-01: Drizzle コネクション管理パターン

**目的**: App Runner コンテナの再利用時に接続を使い回す。

**設計**:

```typescript
// src/shared/lib/db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// モジュールレベルでシングルトン管理
// App Runner はコンテナを再利用するため接続プールが維持される
let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (pool) return pool;

  const token = await getDbConnectionToken(); // SP-02 のIAMトークン

  pool = new Pool({
    host: process.env.RDS_PROXY_ENDPOINT!,
    port: 5432,
    user: process.env.DB_USER!,
    password: token,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: true },
    max: 10,           // RDS Proxy 側でプール管理するため小さく設定
    idleTimeoutMillis: 30000,
  });

  return pool;
}

export async function getDb() {
  const p = await getPool();
  return drizzle(p);
}
```

---

## 可観測性パターン

### OP-01: 構造化ログイベント定義

**認証イベント**（必須記録）:

| イベント | レベル | 記録内容 |
|---|---|---|
| `auth.login.attempt` | info | requestId・IP（ハッシュ化） |
| `auth.login.success` | info | requestId・userId・tenantId |
| `auth.login.failed` | warn | requestId・理由コード |
| `auth.login.blocked` | warn | requestId・理由: rate_limit |
| `auth.logout` | info | requestId・userId |
| `auth.invite.created` | info | requestId・tenantId・role |
| `auth.invite.used` | info | requestId・userId・tenantId |
| `tenant.created` | info | requestId・tenantId |
| `tenant.suspended` | info | requestId・tenantId |

### OP-02: CloudWatch アラーム設計

| アラーム名 | 条件 | アクション |
|---|---|---|
| `vitanota-auth-errors` | 認証失敗ログ ≥ 20件/5分 | SNS 通知 |
| `vitanota-app-errors` | ERROR ログ ≥ 10件/5分 | SNS 通知 |
| `vitanota-rds-cpu` | RDS CPU ≥ 80%/5分 | SNS 通知 |
| `vitanota-app-runner-errors` | App Runner 5xx ≥ 5%/5分 | SNS 通知 |
