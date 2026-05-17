// computeShouldShow の純関数 unit test。
// SWR を絡めずにコーチマーク表示判定ロジックだけを検証する。
import { describe, expect, it } from 'vitest';
import { computeShouldShow } from '../useOnboardingState';

describe('computeShouldShow', () => {
  it('state が null (= 未保存) なら true を返す', () => {
    expect(
      computeShouldShow({
        isLoading: false,
        error: null,
        state: null,
      }),
    ).toBe(true);
  });

  it('state に dismissedAt が入っていれば false を返す (閉じた教員に再表示しない)', () => {
    expect(
      computeShouldShow({
        isLoading: false,
        error: null,
        state: {
          dismissedAt: '2026-05-19T09:00:00.000Z',
          completedStep: 1,
          version: 'v1-2026-05-19',
        },
      }),
    ).toBe(false);
  });

  it('completedStep のみ入っている (= 完走後) でも false を返す', () => {
    expect(
      computeShouldShow({
        isLoading: false,
        error: null,
        state: {
          completedStep: 3,
          version: 'v1-2026-05-19',
        },
      }),
    ).toBe(false);
  });

  it('SWR が読み込み中なら state に関わらず false を返す (誤表示防止)', () => {
    expect(
      computeShouldShow({
        isLoading: true,
        error: null,
        state: null,
      }),
    ).toBe(false);
  });

  it('SWR が error 時は false を返す (誤表示防止)', () => {
    expect(
      computeShouldShow({
        isLoading: false,
        error: new Error('network'),
        state: null,
      }),
    ).toBe(false);
  });
});
