import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from '@/shared/lib/rate-limit';

// モジュールキャッシュをリセットして各テストで独立したストアを使う
beforeEach(async () => {
  vi.resetModules();
});

describe('checkRateLimit', () => {
  it('制限内のリクエストは許可される', () => {
    const result = checkRateLimit('192.168.0.1', 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('制限に達したリクエストは拒否される', () => {
    const ip = '10.0.0.1-limit';
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, 60_000);
    }
    const result = checkRateLimit(ip, 10, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('異なる IP は独立してカウントされる', () => {
    checkRateLimit('10.0.0.2', 10, 60_000);
    checkRateLimit('10.0.0.2', 10, 60_000);
    const result = checkRateLimit('10.0.0.3', 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('ウィンドウが経過するとカウントがリセットされる', () => {
    const ip = '10.0.0.4-window';
    // 1ms ウィンドウを使い、確実に期限切れにする
    for (let i = 0; i < 10; i++) {
      checkRateLimit(ip, 10, 1);
    }
    // ウィンドウ経過を待つ
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const result = checkRateLimit(ip, 10, 1);
        expect(result.allowed).toBe(true);
        resolve();
      }, 10);
    });
  });

  it('resetAt は現在時刻からウィンドウ後の日時を返す', () => {
    const before = Date.now();
    const result = checkRateLimit('10.0.0.5-time', 5, 60_000);
    const after = Date.now();

    const resetMs = result.resetAt.getTime();
    expect(resetMs).toBeGreaterThanOrEqual(before + 60_000);
    expect(resetMs).toBeLessThanOrEqual(after + 60_000);
  });
});
