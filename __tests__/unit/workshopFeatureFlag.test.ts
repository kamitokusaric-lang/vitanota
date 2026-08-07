// 研修 (workshop) のテナント単位フラグ判定。
// env はモジュール読み込み時に確定するため、毎回 resetModules して読み直す。
//
// 一番落としたくないのは「allowlist 空 = 全テナント ON」の意味づけ。
// 本番では cdk.json context にニセコ中の tenant_id を固定して、空にならないようにしている。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const NISEKO = 'c5e917a0-a90b-44ee-9f57-8508279a019a';
const OTHER = '63efcae6-18a1-4360-9301-d91bc57fa4be';

async function loadFlag(env: {
  ENABLE_WORKSHOP?: string;
  WORKSHOP_ALLOWLIST_TENANT_IDS?: string;
}) {
  vi.resetModules();
  vi.stubEnv('ENABLE_WORKSHOP', env.ENABLE_WORKSHOP ?? '');
  vi.stubEnv(
    'WORKSHOP_ALLOWLIST_TENANT_IDS',
    env.WORKSHOP_ALLOWLIST_TENANT_IDS ?? '',
  );
  const mod = await import('@/features/workshop/featureFlag');
  return mod.isWorkshopEnabledForTenant;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isWorkshopEnabledForTenant', () => {
  it('master flag 未設定なら既定で OFF', async () => {
    const fn = await loadFlag({});
    expect(fn(NISEKO)).toBe(false);
  });

  it('ENABLE_WORKSHOP=false なら allowlist に居ても OFF', async () => {
    const fn = await loadFlag({
      ENABLE_WORKSHOP: 'false',
      WORKSHOP_ALLOWLIST_TENANT_IDS: NISEKO,
    });
    expect(fn(NISEKO)).toBe(false);
  });

  it('allowlist に居るテナントだけ ON', async () => {
    const fn = await loadFlag({
      ENABLE_WORKSHOP: 'true',
      WORKSHOP_ALLOWLIST_TENANT_IDS: NISEKO,
    });
    expect(fn(NISEKO)).toBe(true);
    expect(fn(OTHER)).toBe(false);
  });

  it('allowlist は CSV・空白を許容する', async () => {
    const fn = await loadFlag({
      ENABLE_WORKSHOP: 'true',
      WORKSHOP_ALLOWLIST_TENANT_IDS: ` ${NISEKO} , ${OTHER} `,
    });
    expect(fn(NISEKO)).toBe(true);
    expect(fn(OTHER)).toBe(true);
  });

  it('allowlist が空なら全テナント ON になる (本番で空にしてはいけない理由)', async () => {
    const fn = await loadFlag({ ENABLE_WORKSHOP: 'true' });
    expect(fn(NISEKO)).toBe(true);
    expect(fn(OTHER)).toBe(true);
  });

  it('大文字の TRUE も有効', async () => {
    const fn = await loadFlag({
      ENABLE_WORKSHOP: 'TRUE',
      WORKSHOP_ALLOWLIST_TENANT_IDS: NISEKO,
    });
    expect(fn(NISEKO)).toBe(true);
  });

  it('tenantId が無ければ常に false', async () => {
    const fn = await loadFlag({ ENABLE_WORKSHOP: 'true' });
    expect(fn(undefined)).toBe(false);
    expect(fn(null)).toBe(false);
    expect(fn('')).toBe(false);
  });
});
