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
// と callback 形式で self-call する。callback path で user callback が forward されない実装だと
// リクエストが forever pending → CloudFront 30s で 504 となる。
// 2026-05-15 retry 実装で callback path も promise helper 経由に統一したため、
// super.connect は promise 形式で呼ばれる。user callback への forward が崩れていないことを検証する。
describe('ObservablePool — callback 経路 (5/9 事故の再発防止)', () => {
  it('callback 形式で呼ばれた場合、成功した client が user callback に forward される', async () => {
    const fakeClient = { release: vi.fn() } as unknown as PoolClient;
    spyOnPoolConnectPromise().mockResolvedValue(fakeClient);

    const p = new ObservablePool();
    const userCb = vi.fn();
    p.connect(userCb);

    // promise resolve まで microtask を待つ
    await new Promise((r) => setImmediate(r));

    expect(userCb).toHaveBeenCalledTimes(1);
    expect(userCb.mock.calls[0]![0]).toBeUndefined();
    expect(userCb.mock.calls[0]![1]).toBe(fakeClient);
    expect(typeof userCb.mock.calls[0]![2]).toBe('function');
  });

  it('callback 形式の失敗時 (非 PAM)、failed ログ + user callback に error forward', async () => {
    const otherErr = Object.assign(new Error('non-pam connection error'), { code: '08006' });
    spyOnPoolConnectPromise().mockRejectedValue(otherErr);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const p = new ObservablePool();
    const userCb = vi.fn();
    p.connect(userCb);

    await new Promise((r) => setImmediate(r));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]![0]).toMatchObject({
      event: 'db.client.connect.failed',
      err_code: '08006',
    });
    expect(userCb).toHaveBeenCalledTimes(1);
    expect(userCb.mock.calls[0]![0]).toBe(otherErr);
  });

  it('callback 形式の override が void を返す (Promise を返さない)', () => {
    spyOnPoolConnectPromise().mockResolvedValue({ release: vi.fn() } as unknown as PoolClient);
    const p = new ObservablePool();
    const ret = p.connect(() => {});
    expect(ret).toBeUndefined();
  });
});
