import { describe, it, expect } from 'vitest';
import {
  bulkInvitationSchema,
  calculateInvitationStatus,
} from '@/features/auth/lib/invitationService';

describe('calculateInvitationStatus', () => {
  const now = new Date('2026-05-03T12:00:00Z');

  it('usedAt が設定されていれば accepted (期限切れ後でも accepted を優先)', () => {
    const usedAt = new Date('2026-05-01T00:00:00Z');
    const expiresAt = new Date('2026-04-30T00:00:00Z');
    expect(calculateInvitationStatus(usedAt, expiresAt, now)).toBe('accepted');
  });

  it('usedAt = null かつ expiresAt > now なら pending', () => {
    const expiresAt = new Date('2026-05-10T00:00:00Z');
    expect(calculateInvitationStatus(null, expiresAt, now)).toBe('pending');
  });

  it('usedAt = null かつ expiresAt = now なら expired (境界は expired 扱い)', () => {
    expect(calculateInvitationStatus(null, now, now)).toBe('expired');
  });

  it('usedAt = null かつ expiresAt < now なら expired', () => {
    const expiresAt = new Date('2026-04-30T00:00:00Z');
    expect(calculateInvitationStatus(null, expiresAt, now)).toBe('expired');
  });
});

describe('bulkInvitationSchema', () => {
  const validTenantId = '11111111-1111-1111-1111-111111111111';

  it('正常系: emails 1 件 + teacher', () => {
    const result = bulkInvitationSchema.safeParse({
      tenantId: validTenantId,
      emails: ['t1@example.com'],
      role: 'teacher',
    });
    expect(result.success).toBe(true);
  });

  it('正常系: emails 100 件 + school_admin', () => {
    const emails = Array.from({ length: 100 }, (_, i) => `t${i}@example.com`);
    const result = bulkInvitationSchema.safeParse({
      tenantId: validTenantId,
      emails,
      role: 'school_admin',
    });
    expect(result.success).toBe(true);
  });

  it('emails 0 件は VALIDATION_ERROR', () => {
    const result = bulkInvitationSchema.safeParse({
      tenantId: validTenantId,
      emails: [],
      role: 'teacher',
    });
    expect(result.success).toBe(false);
  });

  it('emails 101 件は VALIDATION_ERROR (最大 100 件)', () => {
    const emails = Array.from({ length: 101 }, (_, i) => `t${i}@example.com`);
    const result = bulkInvitationSchema.safeParse({
      tenantId: validTenantId,
      emails,
      role: 'teacher',
    });
    expect(result.success).toBe(false);
  });

  it('tenantId が UUID 形式でない場合は VALIDATION_ERROR', () => {
    const result = bulkInvitationSchema.safeParse({
      tenantId: 'not-a-uuid',
      emails: ['t@example.com'],
      role: 'teacher',
    });
    expect(result.success).toBe(false);
  });

  it('role が teacher / school_admin 以外は VALIDATION_ERROR (system_admin 不可)', () => {
    const result = bulkInvitationSchema.safeParse({
      tenantId: validTenantId,
      emails: ['t@example.com'],
      role: 'system_admin',
    });
    expect(result.success).toBe(false);
  });

  it('emails の中身は文字列なら何でも通る (個別 email validation はハンドラ側で実施)', () => {
    // schema は array<string> までしか縛らない。個別 email 検証はハンドラ内で
    // z.string().email() を per-item で実行し、不正なものは status=failed で返す
    // (1 件不正があっても他は成功させる仕様のため)
    const result = bulkInvitationSchema.safeParse({
      tenantId: validTenantId,
      emails: ['valid@example.com', 'not-an-email'],
      role: 'teacher',
    });
    expect(result.success).toBe(true);
  });
});
