import { describe, it, expect, vi } from 'vitest';
import { pickDbRole, mapErrorToResponse } from '@/features/journal/lib/apiHelpers';
import {
  JournalNotFoundError,
  TagNotFoundError,
  InvalidTagReferenceError,
  ForbiddenError,
  SystemTagDeleteError,
} from '@/features/journal/lib/errors';

vi.mock('@/shared/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('pickDbRole', () => {
  it('returns school_admin when roles include school_admin', () => {
    expect(pickDbRole({ userId: 'u', tenantId: 't', roles: ['school_admin', 'teacher'] }))
      .toBe('school_admin');
  });

  it('returns teacher when roles include teacher only', () => {
    expect(pickDbRole({ userId: 'u', tenantId: 't', roles: ['teacher'] }))
      .toBe('teacher');
  });

  it('returns teacher as fallback for empty roles', () => {
    expect(pickDbRole({ userId: 'u', tenantId: 't', roles: [] }))
      .toBe('teacher');
  });

  it('returns school_admin over teacher when both present', () => {
    expect(pickDbRole({ userId: 'u', tenantId: 't', roles: ['teacher', 'school_admin'] }))
      .toBe('school_admin');
  });
});

describe('mapErrorToResponse', () => {
  function mockRes() {
    const res: Record<string, unknown> = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res as unknown as import('next').NextApiResponse;
  }

  it('maps JournalNotFoundError to 404', () => {
    const res = mockRes();
    mapErrorToResponse(new JournalNotFoundError(), res, 'test');
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('maps TagNotFoundError to 404', () => {
    const res = mockRes();
    mapErrorToResponse(new TagNotFoundError(), res, 'test');
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('maps InvalidTagReferenceError to 400', () => {
    const res = mockRes();
    mapErrorToResponse(new InvalidTagReferenceError(['id-1']), res, 'test');
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps ForbiddenError to 403', () => {
    const res = mockRes();
    mapErrorToResponse(new ForbiddenError(), res, 'test');
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps SystemTagDeleteError to 403', () => {
    const res = mockRes();
    mapErrorToResponse(new SystemTagDeleteError(), res, 'test');
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps unknown error to 500 without exposing details', () => {
    const res = mockRes();
    mapErrorToResponse(new Error('secret info'), res, 'test');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'INTERNAL_ERROR',
      message: '処理中にエラーが発生しました',
    });
  });
});
