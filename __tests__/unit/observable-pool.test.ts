import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { ObservablePool } from '@/shared/lib/db';
import { logger } from '@/shared/lib/logger';
import { __resetTokenCacheForTest } from '@/shared/lib/db-auth';

// pg.Pool.connect は callback / promise の overload を持つため vi.spyOn の戻り値型が
// callback 版 (void 戻り) に解決されてしまう。テスト用に明示的に Promise<PoolClient>
// シグネチャに絞ってモックを当てるためのヘルパ。
function spyOnPoolConnect() {
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

describe('ObservablePool', () => {
  it('成功時はそのまま client を返し、エラーログを出さない', async () => {
    const fakeClient = { release: vi.fn() } as unknown as PoolClient;
    const superConnect = spyOnPoolConnect().mockResolvedValue(fakeClient);
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
    spyOnPoolConnect().mockRejectedValue(pamErr);
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
    spyOnPoolConnect().mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const p = new ObservablePool();
    await expect(p.connect()).rejects.toThrow('boom');

    const payload = errorSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.token_generation_id).toBeUndefined();
    expect(payload.token_age_at_connect_ms).toBeNull();
  });
});
