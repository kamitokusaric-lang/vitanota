# Unit-01 NFR設計パターン

## 適用パターン一覧

| カテゴリ | パターン | 対象 |
|---|---|---|
| セキュリティ | Redact パターン | 構造化ログ（pino redact） |
| セキュリティ | IAM トークン認証 | RDS Proxy 接続 |
| セキュリティ | シークレットキャッシュ | Secrets Manager SDK |
| セキュリティ | 多層防御 | 認証・テナント隔離・RLS |
| セキュリティ | エッジ防御（CDN+WAF） | CloudFront + AWS WAF v2 |
| セキュリティ | オリジン保護（署名ヘッダー） | CloudFront → App Runner |
| セキュリティ | Database セッション戦略 | Auth.js sessions テーブル・即時失効可能 |
| セキュリティ | Permission Boundary | IAM 境界ポリシーによる最大権限制限 |
| セキュリティ | シークレットローテーション自動化 | CloudFront 署名ヘッダー月次ローテーション |
| セキュリティ | シークレット流出防止 | gitleaks プリコミットフック + CI |
| 信頼性 | フェイルセーフデフォルト | 認証エラー・DB エラー |
| 信頼性 | ヘルスチェック | App Runner |
| パフォーマンス | コネクション再利用 | Drizzle + RDS Proxy |
| パフォーマンス | エッジキャッシュ | CloudFront（s-maxage, SWR） |
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
| `vitanota/nextauth-secret` | Auth.js CSRF トークン・PKCE 署名キー（database セッション戦略でも必要） | 90日ごと（手動） |
| `vitanota/google-client-id` | Google OAuth ID | なし |
| `vitanota/google-client-secret` | Google OAuth シークレット | 必要時 |

---

### SP-07: Database セッション戦略パターン（Auth.js）

**目的**: JWT の「発行後失効不可」問題を解消し、教員退職時・トークン流出時に即座にログアウトを強制できるようにする。教育機関向け BtoB SaaS の信頼性要件。

**戦略変更**:
- Auth.js v4 の `session.strategy` を `"jwt"` から `"database"` に変更
- Auth.js PostgreSQL Drizzle アダプタ（`@auth/drizzle-adapter`）を導入
- セッションは `sessions` テーブルに保存、HttpOnly Cookie で `session_token` のみを配布

**sessions テーブル設計**:
```sql
CREATE TABLE sessions (
  session_token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires TIMESTAMP NOT NULL,
  last_accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_tenant_id_idx ON sessions(tenant_id);
CREATE INDEX sessions_expires_idx ON sessions(expires);
```

**セッションライフサイクル**:

| イベント | 動作 |
|---|---|
| ログイン成功 | `INSERT INTO sessions (session_token, user_id, tenant_id, expires, ...)`、Cookie で配布 |
| 毎リクエスト | `SELECT * FROM sessions WHERE session_token = ? AND expires > NOW()` |
| アイドルタイムアウト | `last_accessed_at` から30分経過で 401、Cookie クリア |
| 絶対最大寿命 | `expires`（作成から8時間）で 401 |
| ログアウト | `DELETE FROM sessions WHERE session_token = ?` |
| 管理者による強制ログアウト | `DELETE FROM sessions WHERE user_id = ?` |
| ロール変更時 | `DELETE FROM sessions WHERE user_id = ?`（該当ユーザーの全セッション） |
| テナント停止時 | `DELETE FROM sessions WHERE tenant_id = ?`（テナント内全ユーザー） |
| 期限切れクリーンアップ | 日次バッチで `DELETE FROM sessions WHERE expires < NOW() - INTERVAL '7 days'` |

**認証チェックフロー（毎リクエスト）**:
```ts
// lib/auth/getSession.ts（Auth.js が自動処理）
const session = await db.query.sessions.findFirst({
  where: and(
    eq(sessions.sessionToken, cookieValue),
    gt(sessions.expires, new Date()),
    gt(sessions.lastAccessedAt, thirtyMinutesAgo), // アイドルタイムアウト
  ),
  with: { user: { with: { tenant: true } } },
})
if (!session) throw new UnauthorizedError()
// last_accessed_at を更新（非同期、レスポンスをブロックしない）
await db.update(sessions).set({ lastAccessedAt: new Date() })
  .where(eq(sessions.sessionToken, cookieValue))
```

**レイテンシ影響**:
- 1リクエストあたり +5〜10ms（インデックス付き PRIMARY KEY lookup）
- RDS Proxy 接続プールで接続オーバーヘッド ~ゼロ
- NFR P95 500ms 目標に対して影響は誤差レベル

**`last_accessed_at` の非同期更新**:
毎リクエストで UPDATE を実行すると書き込み負荷が増えるため、以下の工夫:
- **5分以内の更新はスキップ**（直近更新から5分未満なら UPDATE しない）
- **fire-and-forget**：レスポンスを待たずに UPDATE を発火
- **バッチ更新**：累積した更新を定期的にまとめて適用（将来最適化）

**管理画面での活用**（将来 Unit-03/04 で実装想定）:
- `GET /api/admin/sessions` で現在アクティブなセッション一覧
- `DELETE /api/admin/sessions/:session_token` で個別ログアウト
- `DELETE /api/admin/users/:user_id/sessions` で該当ユーザー全セッション削除

**セッション監査ログ**（OP-01 拡張）:
```ts
logger.info({ event: 'session_created', sessionId, userId, tenantId, ip, userAgent })
logger.info({ event: 'session_revoked', sessionId, userId, tenantId, reason })
logger.info({ event: 'session_expired', sessionId, userId, reason: 'idle_timeout' | 'absolute_max' })
```

**RLS ポリシー**:
```sql
-- sessions テーブルにも RLS 適用
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 所有者のみ自分のセッションを参照可能（将来の「セッション一覧」UI 用）
CREATE POLICY sessions_owner_read ON sessions
  AS PERMISSIVE FOR SELECT
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- school_admin はテナント内の全セッションを参照・削除可能
CREATE POLICY sessions_admin_all ON sessions
  AS PERMISSIVE FOR ALL
  USING (
    tenant_id = current_setting('app.tenant_id', true)::uuid
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = current_setting('app.user_id', true)::uuid
      AND u.role = 'school_admin'
    )
  );
```

**設計判断の根拠**:
- JWT の失効不可は教育機関向け BtoB では商用化の障壁
- 追加インフラ不要（既存 PostgreSQL を活用）
- レイテンシ増は 5〜10ms で誤差レベル
- Auth.js 公式サポートで実装コストが小さい（設定変更 + アダプタ追加）

---

### SP-04: 多層防御パターン

**目的**: SECURITY-11 準拠。単一の防御が突破されても次の層が防ぐ。

```
[Layer 0] AWS WAF v2 / Shield
  └─ SQLi/XSS/共通攻撃・IPレピュテーション・WAFレート制限
        ↓
[Layer 1] アプリ内レート制限
  └─ ログインエンドポイント: IP ごと 10回/分
        ↓
[Layer 2] Auth.js セッション検証（database 戦略）
  └─ HttpOnly Cookie の session_token で sessions テーブル lookup
  └─ 失効時は DB から削除済みのため 401 即時返却
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

### SP-05: エッジ防御パターン（CloudFront + WAF）

**目的**: SECURITY-01/02/11 準拠。アプリ層に到達する前にエッジで攻撃を遮断する。

**構成**:
```
[インターネット]
      ↓
[AWS Shield Standard] ← L3/L4 DDoS 保護（無料・自動）
      ↓
[CloudFront] ← TLS 終端・エッジキャッシュ
      ↓
[AWS WAF v2 Web ACL]
  ├─ AWSManagedRulesCommonRuleSet
  ├─ AWSManagedRulesKnownBadInputsRuleSet
  ├─ AWSManagedRulesSQLiRuleSet
  ├─ AWSManagedRulesAmazonIpReputationList
  └─ カスタム: IP レート制限（5分/1000req）
      ↓
[App Runner] ← X-CloudFront-Secret ヘッダー検証
```

**Next.js ミドルウェアでのオリジン検証**（`middleware.ts`）:
```ts
export function middleware(req: NextRequest) {
  const expected = process.env.CLOUDFRONT_SECRET_HEADER_VALUE
  const actual = req.headers.get(process.env.CLOUDFRONT_SECRET_HEADER_NAME ?? 'X-CloudFront-Secret')
  if (expected && actual !== expected) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  return NextResponse.next()
}
```

**運用上の注意**:
- ヘッダー値は四半期ごとにローテーション（Secrets Manager）
- ローテーション時は「新旧両方を許容する猶予期間」を CloudFront 側で設け、無停止で切替

---

### SP-06: オリジン保護パターン（署名ヘッダー）

**目的**: App Runner のパブリック URL への直アクセスを防ぎ、必ず CloudFront → WAF 経由でのみアクセス可能にする。

**仕組み**:
- CloudFront のオリジンカスタムヘッダー機能で `X-CloudFront-Secret: <値>` を付与
- App Runner 側ミドルウェア（SP-05 のコード）で検証
- ヘッダー値は Secrets Manager で管理（`vitanota/cloudfront-secret`）

**代替案検討**:
- VPC Endpoint 方式: App Runner は VPC 専用化非対応のため不採用
- IP 制限: CloudFront の IP 範囲は頻繁に変わり非現実的

---

## パフォーマンスパターン（エッジ）

### PP-02: エッジキャッシュパターン（CloudFront）

**目的**: 読み取り頻度の高い API レスポンスをエッジでキャッシュし、オリジン（App Runner + RDS）の負荷を軽減する。

**方針**:
- CloudFront の**デフォルトはキャッシュ無効**（`CachingDisabled` ポリシー）
- **API ハンドラ側で明示的に `Cache-Control` ヘッダーを返したエンドポイントのみキャッシュ対象**にする
- キャッシュ対象は個別の CloudFront Cache Policy（`CacheOptimized` 派生）を作成し、パスパターンで該当エンドポイントに適用

**使用例（Unit-02 NFR-U02-02）**:
```ts
// pages/api/journal/entries.ts
res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')
```

**キャッシュキー設計の注意**:
- `Authorization` / `Cookie` ヘッダーを含むリクエストは原則キャッシュしない（個人情報漏えい防止）
- ユーザー固有情報を返すエンドポイントは `Cache-Control: private` を付け、**必ず CloudFront キャッシュを回避**
- テナント共有データのみキャッシュ対象

**キャッシュ無効化**:
- デプロイ時: GitHub Actions で `create-invalidation --paths "/*"`
- 緊急時: 手動 invalidation（運用 Runbook）

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
