import { describe, it, expect } from 'vitest';
import {
  taskFilterSettingsSchema,
  periodValueSchema,
} from '@/schemas/userFilterPreferences';

const validUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('periodValueSchema', () => {
  it('mode=default を受け入れる', () => {
    const result = periodValueSchema.safeParse({ mode: 'default' });
    expect(result.success).toBe(true);
  });

  it('mode=range + from/to (YYYY-MM-DD) を受け入れる', () => {
    const result = periodValueSchema.safeParse({
      mode: 'range',
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(result.success).toBe(true);
  });

  it('mode=range で from が YYYY-MM-DD 形式じゃないと拒否', () => {
    const result = periodValueSchema.safeParse({
      mode: 'range',
      from: '01/01/2026',
      to: '2026-01-31',
    });
    expect(result.success).toBe(false);
  });

  it('mode=range で from 欠落だと拒否', () => {
    const result = periodValueSchema.safeParse({
      mode: 'range',
      to: '2026-01-31',
    });
    expect(result.success).toBe(false);
  });

  it('未知の mode を拒否', () => {
    const result = periodValueSchema.safeParse({ mode: 'unknown' });
    expect(result.success).toBe(false);
  });
});

describe('taskFilterSettingsSchema', () => {
  describe('正常系', () => {
    it('全フィールド初期値 (filterOwner=null) を受け入れる', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: null,
        filterTagIds: [],
        filterCategoryIds: [],
        showDelegated: false,
        period: { mode: 'default' },
      });
      expect(result.success).toBe(true);
    });

    it('filterOwner が UUID なら受け入れる', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: validUuid,
        filterTagIds: [validUuid],
        filterCategoryIds: [validUuid],
        showDelegated: true,
        period: { mode: 'range', from: '2026-01-01', to: '2026-01-31' },
      });
      expect(result.success).toBe(true);
    });

    it('tagIds / categoryIds が複数件 OK', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: null,
        filterTagIds: [validUuid, '550e8400-e29b-41d4-a716-446655440001'],
        filterCategoryIds: [validUuid],
        showDelegated: false,
        period: { mode: 'default' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('異常系', () => {
    it('filterOwner が不正 UUID なら拒否', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: 'not-a-uuid',
        filterTagIds: [],
        filterCategoryIds: [],
        showDelegated: false,
        period: { mode: 'default' },
      });
      expect(result.success).toBe(false);
    });

    it('filterTagIds に不正 UUID が混ざると拒否', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: null,
        filterTagIds: [validUuid, 'not-a-uuid'],
        filterCategoryIds: [],
        showDelegated: false,
        period: { mode: 'default' },
      });
      expect(result.success).toBe(false);
    });

    it('showDelegated が boolean でないと拒否', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: null,
        filterTagIds: [],
        filterCategoryIds: [],
        showDelegated: 'true',
        period: { mode: 'default' },
      });
      expect(result.success).toBe(false);
    });

    it('period が不正だと拒否', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: null,
        filterTagIds: [],
        filterCategoryIds: [],
        showDelegated: false,
        period: { mode: 'unknown' },
      });
      expect(result.success).toBe(false);
    });

    it('必須フィールド (period) 欠落を拒否', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: null,
        filterTagIds: [],
        filterCategoryIds: [],
        showDelegated: false,
        // period 欠落
      });
      expect(result.success).toBe(false);
    });

    it('必須フィールド (showDelegated) 欠落を拒否', () => {
      const result = taskFilterSettingsSchema.safeParse({
        filterOwner: null,
        filterTagIds: [],
        filterCategoryIds: [],
        period: { mode: 'default' },
        // showDelegated 欠落
      });
      expect(result.success).toBe(false);
    });
  });
});
