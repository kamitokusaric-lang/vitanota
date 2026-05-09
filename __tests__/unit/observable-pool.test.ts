import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { ObservablePool } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
import { __resetTokenCacheForTest } from '@/shared/lib/db-auth';

// pg.Pool.connect は callback / promise の overload を持つ。
// 両 path をテストでカバーするため、シグネチャごとに別の spy を用意する。
function spyOnPoolConnectPromise() {
  return vi.spyOn(
    Pool.prototype as unknown as { connect: () => Promise<PoolClient> },
    'connect',
  );
}

function spyOnPoolConnectCallback() {
  return vi.spyOn(
    Pool.prototype as unknown as {
      connect: (
        cb: (
          err: Error | undefined,
          client: PoolClient | undefined,
          done: (release?: unknown) => void,
        ) => void,
      ) => void;
    },
    'connect',
  );
}

beforeEach(() => {
  __resetTokenCacheForTest();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ObservablePool — promise 経路', () => {
  it('成功時はそのまま client を返し、エラーログを出さない', async () => {
    const fakeClient = { release: vi.fn() } as unknown as PoolClient;
    const superConnect = spyOnPoolConnectPromise().mockResolvedValue(fakeClient);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const p = new ObservablePool();
    const got = await p.connect();

    expect(got).toBe(fakeClient);
    expect(superConnect).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('失敗時は db.client.connect.failed を構造化ログ出力したうえで throw する', async () => {
    const pamErr = Object.assign(
      new Error('PAM authentication failed for user "vitanota_app"'),
      { code: '28000' },
    );
    spyOnPoolConnectPromise().mockRejectedValue(pamErr);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const p = new ObservablePool();
    await expect(p.connect()).rejects.toThrow(pamErr);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [payload, msg] = errorSpy.mock.calls[0]!;
    expect(msg).toBe('pool.connect() failed');
    expect(payload).toMatchObject({
      event: 'db.client.connect.failed',
      err_code: '28000',
      err_message: 'PAM authentication failed for user "vitanota_app"',
    });
    expect(payload).toHaveProperty('connect_duration_ms');
    expect(payload).toHaveProperty('pool_total');
    expect(payload).toHaveProperty('pool_idle');
    expect(payload).toHaveProperty('pool_waiting');
  });

  it('token cache が空の状態で失敗した場合 token_age_at_connect_ms は null になる', async () => {
    spyOnPoolConnectPromise().mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const p = new ObservablePool();
    await expect(p.connect()).rejects.toThrow('boom');

    const payload = errorSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.token_generation_id).toBeUndefined();
    expect(payload.token_age_at_connect_ms).toBeNull();
  });
});

// ★ 5/9 14:14 の本番事故の再発防止テスト。
// pg-pool 内部 (pool.query() の implementation) は this.connect((err, client, done) => …)
// と callback 形式で self-call する。Promise 専用の override を書くと callback が
// 永久に呼ばれず、リクエストが forever pending → CloudFront 30s で 504 となる。
// 今回の override が「callback を必ず forward する」ことを構造的に検証する。
describe('ObservablePool — callback 経路 (本番 504 再発防止)', () => {
  it('callback 形式で呼ばれた場合、super.connect も callback で呼ばれて結果が forward される', () => {
    const fakeClient = { release: vi.fn() } as unknown as PoolClient;
    const fakeDone = vi.fn();
    let capturedSuperCb:
      | ((
          err: Error | undefined,
          client: PoolClient | undefined,
          done: (release?: unknown) => void,
        ) => void)
      | null = null;
    spyOnPoolConnectCallback().mockImplementation((cb) => {
      capturedSuperCb = cb;
    });

    const p = new ObservablePool();
    const userCb = vi.fn();
    p.connect(userCb);

    // ObservablePool は super.connect(callback) を必ず呼んだはず
    expect(capturedSuperCb).not.toBeNull();

    // super 側 callback を成功で発火 → user の callback が forward される
    capturedSuperCb!(undefined, fakeClient, fakeDone);
    expect(userCb).toHaveBeenCalledWith(undefined, fakeClient, fakeDone);
  });

  it('callback 形式の失敗時、failed ログが出たうえで user callback にも error が forward される', () => {
    const pamErr = Object.assign(
      new Error('PAM authentication failed for user "vitanota_app"'),
      { code: '28000' },
    );
    spyOnPoolConnectCallback().mockImplementation((cb) => {
      cb(pamErr, undefined, () => {});
    });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const p = new ObservablePool();
    const userCb = vi.fn();
    p.connect(userCb);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]![0]).toMatchObject({
      event: 'db.client.connect.failed',
      err_code: '28000',
    });
    expect(userCb).toHaveBeenCalledTimes(1);
    expect(userCb.mock.calls[0]![0]).toBe(pamErr);
  });

  it('callback 形式の override が void を返す (Promise を返さない)', () => {
    spyOnPoolConnectCallback().mockImplementation(() => {});
    const p = new ObservablePool();
    const ret = p.connect(() => {});
    expect(ret).toBeUndefined();
  });
});
