// PP-01: Drizzle シングルトン + withTenant パターン
// App Runner はコンテナを再利用するため接続プールが維持される
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  getDbAuthToken,
  getCurrentTokenMeta,
  invalidateTokenGeneration,
  IAM_TOKEN_TTL_MS,
  type TokenMeta,
} from './db-auth';
import { logger } from './logger';
import * as schema from '@/db/schema';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

// pg-pool は public API として callback 形式 (`pool.connect(cb)`) を持ち、
// さらに pg-pool 内部 (index.js 449 付近、pool.query() のショートカット実装) で
// `this.connect((err, client) => ...)` と self-call する経路を持つ。
// Promise 専用の override にすると internal callback が永久に呼ばれず、
// その経路を踏んだリクエストが forever pending → CloudFront 30s で 504 になる。
// (5/9 14:14 deploy 直後の本番 504 で確認済み・即 revert 済み)
//
// よって両形式を正しく forward するシグネチャで定義し直す。
// drizzle.transaction 経路は promise 形式しか叩かないが、内部経路の保険を取る。
type PgConnectCallback = (
  err: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

function sleepJitter(minMs: number, maxMs: number): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function isRetryablePamFailure(err: unknown, tokenAgeMs: number | null): boolean {
  if (tokenAgeMs === null || tokenAgeMs >= IAM_TOKEN_TTL_MS) return false;
  const code = (err as { code?: string }).code;
  if (code !== '28000') return false;
  const message = err instanceof Error ? err.message : '';
  return message.includes('PAM authentication failed');
}

export class ObservablePool extends Pool {
  override connect(): Promise<PoolClient>;
  override connect(cb: PgConnectCallback): void;
  override connect(cb?: PgConnectCallback): Promise<PoolClient> | void {
    if (cb) {
      // callback path も promise helper 経由で統一 (5/9 callback overload 事故ポイント、
      // pg-pool 内部 self-call (index.js 449 付近) はここを通る)。
      this.connectWithRetry().then(
        (client) => {
          const release = (releaseArg?: unknown) => {
            if (releaseArg instanceof Error || releaseArg === true) {
              client.release(releaseArg as Error | true);
            } else {
              client.release();
            }
          };
          cb(undefined, client, release);
        },
        (err: Error) => {
          cb(err, undefined, () => {});
        },
      );
      return;
    }
    return this.connectWithRetry();
  }

  // PAM auth failed を検出した場合に「同世代の cache を invalidate して新 token で 1 回 retry」する。
  // incident #6 (2026-05-12 4 分継続) の構造に対する本丸対応:
  // 旧 token が RDS 側で拒否された後、新 token は 40ms で成功する。アプリ側は cache TTL 8 分の
  // 手前で問題発生するため refresh のトリガーが無く、死んだ token を握って障害が伸びる。
  // ここで invalidate + forceRefresh + retry を 1 回挟むことで 4 分障害 → ~50ms に短縮する。
  private async connectWithRetry(): Promise<PoolClient> {
    const failedMeta = getCurrentTokenMeta();
    const attempt0StartedAt = Date.now();

    try {
      return await super.connect();
    } catch (err) {
      this.logConnectFailure(err, failedMeta, attempt0StartedAt, 0);
      const tokenAgeMs = failedMeta ? Date.now() - failedMeta.createdAt : null;

      if (!failedMeta || !isRetryablePamFailure(err, tokenAgeMs)) {
        throw err;
      }

      // compare-and-invalidate (世代 fence)。旧世代の遅延 failure が新 token cache を消さない。
      const invalidated = invalidateTokenGeneration(failedMeta.generationId, 'pam_auth_failed');

      // 複数 instance / 並列 callsite の signer storm 分散
      await sleepJitter(100, 300);

      // 強制 refresh して新 token を取りに行く (inflight があれば集約)
      await getDbAuthToken({ forceRefresh: true });
      const retryMeta = getCurrentTokenMeta();

      // assertion: forceRefresh 後も同 generation なら race detection
      if (retryMeta && retryMeta.generationId === failedMeta.generationId) {
        logger.error(
          {
            event: 'db.connect.retry.same_generation',
            failed_generation_id: failedMeta.generationId,
            retry_generation_id: retryMeta.generationId,
            invalidated,
          },
          'Retry attempted with same token generation (forceRefresh path race)',
        );
      }

      const attempt1StartedAt = Date.now();
      try {
        const client = await super.connect();
        logger.info(
          {
            event: 'db.connect.retry.succeeded',
            failed_generation_id: failedMeta.generationId,
            current_generation_id_before_invalidate: failedMeta.generationId,
            invalidated,
            retry_generation_id: retryMeta?.generationId,
            failed_token_age_ms: tokenAgeMs,
            connect_duration_ms: Date.now() - attempt1StartedAt,
          },
          'pool.connect() succeeded after token invalidate + retry',
        );
        return client;
      } catch (retryErr) {
        this.logConnectFailure(retryErr, retryMeta ?? failedMeta, attempt1StartedAt, 1);
        logger.error(
          {
            event: 'db.connect.retry.failed',
            failed_generation_id: failedMeta.generationId,
            retry_generation_id: retryMeta?.generationId,
            invalidated,
          },
          'pool.connect() retry also failed (storm protect: no further retry)',
        );
        throw retryErr;
      }
    }
  }

  private logConnectFailure(
    err: unknown,
    meta: TokenMeta | null,
    startedAt: number,
    attempt: 0 | 1,
  ): void {
    const tokenAge = meta ? Date.now() - meta.createdAt : null;
    const errCode = (err as { code?: string }).code;
    const errMessage = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        event: 'db.client.connect.failed',
        token_generation_id: meta?.generationId,
        token_age_at_connect_ms: tokenAge,
        connect_duration_ms: Date.now() - startedAt,
        err_code: errCode,
        err_message: errMessage,
        pool_total: this.totalCount,
        pool_idle: this.idleCount,
        pool_waiting: this.waitingCount,
        attempt,
      },
      'pool.connect() failed',
    );
  }
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;

  // IAM トークンは 15 分で expire するため、Pool 側で保持すると
  // 新規 backend connection 時に古い token で PAM 認証失敗する。
  // pg は password に関数を渡すと新規 Client 毎に評価する仕様なので、
  // getDbAuthToken (12 分 TTL キャッシュ) を毎回呼ばせて fresh token を使わせる。
  const password: string | (() => Promise<string>) = process.env.DB_PASSWORD
    ? process.env.DB_PASSWORD
    : () => getDbAuthToken();

  pool = new ObservablePool({
    host: process.env.RDS_PROXY_ENDPOINT,
    port: 5432,
    user: process.env.DB_USER,
    password,
    database: process.env.DB_NAME,
    // MVP β: AWS RDS の CA チェーン（デフォルトで Node.js に信頼されていない）
    // を検証せず接続する。通信は VPC 内で閉じており MITM リスクは実質ゼロ。
    // Phase 2 で RDS CA bundle を Docker に同梱して rejectUnauthorized: true に戻す。
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,              // RDS Proxy がプール管理するためアプリ側は小さく
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (err) => {
    logger.error({ event: 'db.pool.error', err }, 'Unexpected DB pool error');
  });

  // 観測 A: client の生成と認証に使った IAM token のメタデータを attach する。
  // PAM auth failed 調査で「stale な token を保持した client が pool 内に残るか」を
  // 識別するため、後段（Phase 4 D-passive）の age 判定にも使う。
  pool.on('connect', (client) => {
    const now = Date.now();
    const meta = getCurrentTokenMeta();
    const augmented = client as PoolClient & {
      __clientId?: string;
      __createdAt?: number;
      __tokenGenerationId?: string;
      __tokenCreatedAt?: number;
    };
    augmented.__clientId = randomUUID();
    augmented.__createdAt = now;
    if (meta) {
      augmented.__tokenGenerationId = meta.generationId;
      augmented.__tokenCreatedAt = meta.createdAt;
    }

    logger.info(
      {
        event: 'db.client.connect',
        pool_client_id: augmented.__clientId,
        token_generation_id: meta?.generationId,
        token_age_at_connect_ms: meta ? now - meta.createdAt : null,
      },
      'New DB pool client connected',
    );
  });

  logger.info({ event: 'db.pool.created' }, 'DB connection pool created');

  return pool;
}

export async function getDb(): Promise<DrizzleDb> {
  const p = await getPool();
  return drizzle(p, { schema });
}

// テナントユーザー用: RLS の 3 変数を設定してトランザクション内で fn を実行
export async function withTenantUser<T>(
  tenantId: string,
  userId: string,
  role: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  if (!tenantId) throw new Error('withTenantUser: tenantId is required');
  if (!userId) throw new Error('withTenantUser: userId is required');
  if (!role) throw new Error('withTenantUser: role is required');

  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', ${role}, true)`);
    return fn(tx as unknown as DrizzleDb);
  });
}

// system_admin 用: 全テナントにアクセス可能
// app.tenant_id は設定しない（system_admin にテナントは不要。CASE で先に判定される）
export async function withSystemAdmin<T>(
  adminUserId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  if (!adminUserId) throw new Error('withSystemAdmin: adminUserId is required');

  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${adminUserId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.role', 'system_admin', true)`
    );
    return fn(tx as unknown as DrizzleDb);
  });
}

// セッション解決専用: ログイン直後に自分の user_tenant_roles を読むためだけのロール
// user_tenant_roles の bootstrap ポリシーでのみ許可（user_id = 自分の行の SELECT のみ）
// 他テーブルへのアクセスは CASE の ELSE false で拒否される
export async function withSessionBootstrap<T>(
  userId: string,
  fn: (db: DrizzleDb) => Promise<T>
): Promise<T> {
  if (!userId) throw new Error('withSessionBootstrap: userId is required');

  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.user_id', ${userId}, true)`
    );
    await tx.execute(
      sql`SELECT set_config('app.role', 'bootstrap', true)`
    );
    return fn(tx as unknown as DrizzleDb);
  });
}
