import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PoolClient } from 'pg';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('AWS_REGION', 'ap-northeast-1');
  vi.stubEnv('RDS_ENDPOINT', 'mock-host');
  vi.stubEnv('DB_USER', 'mock-user');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type ConnectImpl = 'success' | 'pam-failed' | { code: string; message: string };

const PAM_ERROR = () =>
  Object.assign(new Error('PAM authentication failed for user "vitanota_app"'), {
    code: '28000',
  });

function setupMocks(connectImpls: ConnectImpl[], signerTokens: string[] = ['token-1', 'token-2']) {
  const getAuthToken = vi.fn();
  for (const token of signerTokens) {
    getAuthToken.mockResolvedValueOnce(token);
  }
  vi.doMock('@aws-sdk/rds-signer', () => ({
    // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
    // arrow ではなく通常関数で object を返す (arrow は new 不可)。
    Signer: vi.fn().mockImplementation(function () {
      return { getAuthToken };
    }),
  }));
  vi.doMock('drizzle-orm/node-postgres', () => ({
    drizzle: vi.fn(),
  }));

  const connectMock = vi.fn();
  let clientCount = 0;
  for (const impl of connectImpls) {
    if (impl === 'success') {
      const id = `client-${++clientCount}`;
      connectMock.mockImplementationOnce(
        (
          cb?: (
            err: Error | undefined,
            client: PoolClient | undefined,
            done: (release?: unknown) => void,
          ) => void,
        ) => {
          const client = { __id: id, release: vi.fn() } as unknown as PoolClient;
          if (cb) {
            cb(undefined, client, () => {});
            return undefined;
          }
          return Promise.resolve(client);
        },
      );
    } else {
      const err =
        impl === 'pam-failed'
          ? PAM_ERROR()
          : Object.assign(new Error(impl.message), { code: impl.code });
      connectMock.mockImplementationOnce(
        (
          cb?: (
            err: Error | undefined,
            client: PoolClient | undefined,
            done: (release?: unknown) => void,
          ) => void,
        ) => {
          if (cb) {
            cb(err, undefined, () => {});
            return undefined;
          }
          return Promise.reject(err);
        },
      );
    }
  }

  vi.doMock('pg', () => {
    class FakePool {
      totalCount = 0;
      idleCount = 0;
      waitingCount = 0;
      on() {
        // no-op
      }
      connect(
        cb?: (
          err: Error | undefined,
          client: PoolClient | undefined,
          done: (release?: unknown) => void,
        ) => void,
      ): Promise<PoolClient> | void {
        return connectMock(cb);
      }
    }
    return { Pool: FakePool };
  });

  return { getAuthToken, connectMock };
}

async function createPool() {
  const { ObservablePool } = await import('@/shared/lib/db');
  return new ObservablePool({
    host: 'mock',
    port: 5432,
    user: 'mock',
    database: 'mock',
    password: () => Promise.resolve('mock-token'),
  });
}

describe('ObservablePool.connect retry (PAM failed + token invalidate)', () => {
  it('(c-promise) 1 回目 PAM failed → invalidate → 2 回目成功 (promise 形式)', async () => {
    const { getAuthToken, connectMock } = setupMocks(['pam-failed', 'success']);
    const { getDbAuthToken, getCurrentTokenMeta } = await import('@/shared/lib/db-auth');
    await getDbAuthToken();
    const oldMeta = getCurrentTokenMeta()!;

    const pool = await createPool();
    const client = await pool.connect();

    expect((client as unknown as { __id: string }).__id).toBe('client-1');
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(getAuthToken).toHaveBeenCalledTimes(2);

    const newMeta = getCurrentTokenMeta()!;
    expect(newMeta.generationId).not.toBe(oldMeta.generationId);
  });

  it('(c-callback) 1 回目 PAM failed → invalidate → 2 回目成功 (callback 形式)', async () => {
    const { getAuthToken, connectMock } = setupMocks(['pam-failed', 'success']);
    const { getDbAuthToken } = await import('@/shared/lib/db-auth');
    await getDbAuthToken();

    const pool = await createPool();

    const client = await new Promise<PoolClient>((resolve, reject) => {
      pool.connect((err, c, done) => {
        if (err || !c) {
          reject(err ?? new Error('no client'));
        } else {
          done();
          resolve(c);
        }
      });
    });

    expect((client as unknown as { __id: string }).__id).toBe('client-1');
    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(getAuthToken).toHaveBeenCalledTimes(2);
  });

  it('(d) code === 28000 でも message が PAM failed を含まなければ retry しない', async () => {
    const { connectMock } = setupMocks([{ code: '28000', message: 'some other auth error' }]);
    const { getDbAuthToken } = await import('@/shared/lib/db-auth');
    await getDbAuthToken();

    const pool = await createPool();
    await expect(pool.connect()).rejects.toThrow('some other auth error');
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('(d-2) PAM message を含むが code が 28000 以外なら retry しない', async () => {
    const { connectMock } = setupMocks([
      { code: '08006', message: 'PAM authentication failed (connection lost)' },
    ]);
    const { getDbAuthToken } = await import('@/shared/lib/db-auth');
    await getDbAuthToken();

    const pool = await createPool();
    await expect(pool.connect()).rejects.toThrow('PAM authentication failed');
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('(e) token_age が TTL 以上なら retry しない', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T00:00:00Z'));
    const { connectMock } = setupMocks(['pam-failed']);
    const { getDbAuthToken } = await import('@/shared/lib/db-auth');
    await getDbAuthToken();

    // 9 分後に時計を進めて TTL (8 分) を超える
    vi.setSystemTime(new Date('2026-05-15T00:09:00Z'));

    const pool = await createPool();
    await expect(pool.connect()).rejects.toThrow('PAM authentication failed');
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('(f) 2 回目も失敗したら throw (storm protect)', async () => {
    const { connectMock } = setupMocks(['pam-failed', 'pam-failed']);
    const { getDbAuthToken } = await import('@/shared/lib/db-auth');
    await getDbAuthToken();

    const pool = await createPool();
    await expect(pool.connect()).rejects.toThrow('PAM authentication failed');
    // 1 回目 + retry の 1 回目で 2 回。それ以上は呼ばない (storm protect)
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  // (b) retry.same_generation assertion は production 監視用の safety net。
  // 実装上、randomUUID() で新 token は必ず異なる generation_id を持つため、
  // 本番でこの assertion が発火するのは「forceRefresh が cache を更新しなかった」race のみ。
  // unit test で artificial に同 generation を作るには randomUUID か getCurrentTokenMeta を
  // mock する必要があるが、いずれも production code 側の改変が必要なため Phase 2 送り。
  // assertion 行 (db.ts の db.connect.retry.same_generation) は本番 CloudWatch logs で監視する。
});
