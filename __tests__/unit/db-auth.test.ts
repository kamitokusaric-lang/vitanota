import { describe, it, expect, beforeEach, vi } from 'vitest';

// signer.getAuthToken をモック化するため、モジュールキャッシュを毎回リセット
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('getDbAuthToken (singleflight + cache + meta)', () => {
  it('cache hit のときは signer を呼ばずキャッシュ済み token を返す', async () => {
    const getAuthToken = vi.fn().mockResolvedValue('token-A');
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { getDbAuthToken } = await import('@/shared/lib/db-auth');

    const t1 = await getDbAuthToken();
    const t2 = await getDbAuthToken();

    expect(t1).toBe('token-A');
    expect(t2).toBe('token-A');
    expect(getAuthToken).toHaveBeenCalledTimes(1);
  });

  it('並列の cache miss を 1 回の signer 呼び出しに集約する', async () => {
    let resolveSigner: (value: string) => void = () => {};
    const signerPromise = new Promise<string>((resolve) => {
      resolveSigner = resolve;
    });
    const getAuthToken = vi.fn().mockReturnValue(signerPromise);
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { getDbAuthToken } = await import('@/shared/lib/db-auth');

    // 10 並列で叩く（旧実装ならここで signer が 10 回呼ばれる）
    const calls = Array.from({ length: 10 }, () => getDbAuthToken());
    // singleflight が効いていれば、まだ resolve していなくても signer 呼び出しは 1 回だけ
    await Promise.resolve();
    expect(getAuthToken).toHaveBeenCalledTimes(1);

    resolveSigner('token-B');
    const results = await Promise.all(calls);

    expect(results).toEqual(Array(10).fill('token-B'));
    expect(getAuthToken).toHaveBeenCalledTimes(1);
  });

  it('getCurrentTokenMeta は最新の generationId / createdAt を返す', async () => {
    const getAuthToken = vi.fn().mockResolvedValue('token-C');
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { getDbAuthToken, getCurrentTokenMeta } = await import('@/shared/lib/db-auth');

    expect(getCurrentTokenMeta()).toBeNull();

    const before = Date.now();
    await getDbAuthToken();
    const after = Date.now();

    const meta = getCurrentTokenMeta();
    expect(meta).not.toBeNull();
    expect(meta!.generationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(meta!.createdAt).toBeGreaterThanOrEqual(before);
    expect(meta!.createdAt).toBeLessThanOrEqual(after);
  });

  it('cache 期限切れ後は新しい token と新しい generationId を発行する', async () => {
    const getAuthToken = vi
      .fn()
      .mockResolvedValueOnce('token-D1')
      .mockResolvedValueOnce('token-D2');
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { getDbAuthToken, getCurrentTokenMeta, __resetTokenCacheForTest } =
      await import('@/shared/lib/db-auth');

    const t1 = await getDbAuthToken();
    const meta1 = getCurrentTokenMeta()!;

    // 時間経過 = TTL 切れを模擬するためキャッシュ手動リセット
    __resetTokenCacheForTest();

    const t2 = await getDbAuthToken();
    const meta2 = getCurrentTokenMeta()!;

    expect(t1).toBe('token-D1');
    expect(t2).toBe('token-D2');
    expect(meta1.generationId).not.toBe(meta2.generationId);
    expect(getAuthToken).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateTokenGeneration (compare-and-invalidate)', () => {
  it('現 cache.generationId と一致するときに cache を消し true を返す', async () => {
    const getAuthToken = vi.fn().mockResolvedValue('token-INV1');
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { getDbAuthToken, getCurrentTokenMeta, invalidateTokenGeneration } =
      await import('@/shared/lib/db-auth');

    await getDbAuthToken();
    const meta = getCurrentTokenMeta()!;

    const result = invalidateTokenGeneration(meta.generationId, 'test_reason');

    expect(result).toBe(true);
    expect(getCurrentTokenMeta()).toBeNull();
  });

  it('世代不一致のときは cache 不変で false を返す (stale failure protect)', async () => {
    const getAuthToken = vi.fn().mockResolvedValue('token-INV2');
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { getDbAuthToken, getCurrentTokenMeta, invalidateTokenGeneration } =
      await import('@/shared/lib/db-auth');

    await getDbAuthToken();
    const meta = getCurrentTokenMeta()!;

    const staleGenerationId = '00000000-0000-0000-0000-000000000000';
    const result = invalidateTokenGeneration(staleGenerationId, 'stale_test');

    expect(result).toBe(false);
    expect(getCurrentTokenMeta()).not.toBeNull();
    expect(getCurrentTokenMeta()!.generationId).toBe(meta.generationId);
  });

  it('cache が空のときの invalidate は false を返す', async () => {
    const getAuthToken = vi.fn().mockResolvedValue('token-INV3');
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { invalidateTokenGeneration, getCurrentTokenMeta } =
      await import('@/shared/lib/db-auth');

    expect(getCurrentTokenMeta()).toBeNull();

    const result = invalidateTokenGeneration('any-gen-id', 'empty_cache_test');

    expect(result).toBe(false);
  });
});

describe('getDbAuthToken { forceRefresh: true }', () => {
  it('forceRefresh で既存 cache を無視して signer を再呼び出しする', async () => {
    const getAuthToken = vi
      .fn()
      .mockResolvedValueOnce('token-F1')
      .mockResolvedValueOnce('token-F2');
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { getDbAuthToken, getCurrentTokenMeta } = await import('@/shared/lib/db-auth');

    const t1 = await getDbAuthToken();
    const meta1 = getCurrentTokenMeta()!;

    const t2 = await getDbAuthToken({ forceRefresh: true });
    const meta2 = getCurrentTokenMeta()!;

    expect(t1).toBe('token-F1');
    expect(t2).toBe('token-F2');
    expect(meta1.generationId).not.toBe(meta2.generationId);
    expect(getAuthToken).toHaveBeenCalledTimes(2);
  });

  it('forceRefresh でも inflight があれば集約する (signer 1 回)', async () => {
    let resolveSigner: (value: string) => void = () => {};
    const signerPromise = new Promise<string>((resolve) => {
      resolveSigner = resolve;
    });
    const getAuthToken = vi.fn().mockReturnValue(signerPromise);
    vi.doMock('@aws-sdk/rds-signer', () => ({
      // vitest 4: new Signer() は実装関数を constructor として呼ぶため、
      // arrow ではなく通常関数で object を返す (arrow は new 不可)。
      Signer: vi.fn().mockImplementation(function () {
        return { getAuthToken };
      }),
    }));

    const { getDbAuthToken } = await import('@/shared/lib/db-auth');

    // 1 つ目を inflight 化、その後 forceRefresh で 5 つ並列に呼ぶ
    const first = getDbAuthToken();
    await Promise.resolve();

    const forced = Array.from({ length: 5 }, () => getDbAuthToken({ forceRefresh: true }));
    await Promise.resolve();
    expect(getAuthToken).toHaveBeenCalledTimes(1);

    resolveSigner('token-AGG');

    const results = await Promise.all([first, ...forced]);

    expect(results).toEqual(Array(6).fill('token-AGG'));
    expect(getAuthToken).toHaveBeenCalledTimes(1);
  });
});
