// verifyGoogleIdToken.ts の動作検証
//
// jose.jwtVerify を mock し、payload の post-check (email / email_verified / sub)
// および正常系の claims 返却を検証する。
// 署名検証・iss / aud / exp の検証は jose ライブラリの責任とし、本テストでは扱わない。
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    jwtVerify: vi.fn(),
  };
});

import { jwtVerify } from 'jose';
import { verifyGoogleIdToken } from '@/features/auth/lib/verifyGoogleIdToken';

const mockedJwtVerify = vi.mocked(jwtVerify);

function mockPayload(payload: Record<string, unknown>) {
  mockedJwtVerify.mockResolvedValueOnce({
    payload,
    protectedHeader: { alg: 'RS256' },
    key: {} as never,
  } as never);
}

describe('verifyGoogleIdToken', () => {
  beforeEach(() => {
    mockedJwtVerify.mockReset();
  });

  describe('正常系', () => {
    it('全 claim 揃っていれば GoogleIdTokenClaims を返す', async () => {
      mockPayload({
        email: 'teacher@example.com',
        email_verified: true,
        name: 'Teacher Example',
        picture: 'https://example.com/pic.jpg',
        sub: 'google-subject-id-123',
        iss: 'https://accounts.google.com',
        aud: 'test-audience',
      });

      const result = await verifyGoogleIdToken('any-token', 'test-audience');

      expect(result.email).toBe('teacher@example.com');
      expect(result.email_verified).toBe(true);
      expect(result.name).toBe('Teacher Example');
      expect(result.sub).toBe('google-subject-id-123');
    });

    it('jwtVerify に正しい issuer / audience が渡される', async () => {
      mockPayload({
        email: 'a@b.c',
        email_verified: true,
        sub: 's',
      });

      await verifyGoogleIdToken('token', 'my-audience');

      expect(mockedJwtVerify).toHaveBeenCalledWith(
        'token',
        expect.anything(),
        expect.objectContaining({
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: 'my-audience',
        }),
      );
    });
  });

  describe('post-check: email claim', () => {
    it('email が無い場合はエラー', async () => {
      mockPayload({
        email_verified: true,
        sub: 'sub',
      });

      await expect(verifyGoogleIdToken('token', 'aud')).rejects.toThrow(
        'email claim missing or invalid',
      );
    });

    it('email が string でない場合はエラー', async () => {
      mockPayload({
        email: 123,
        email_verified: true,
        sub: 'sub',
      });

      await expect(verifyGoogleIdToken('token', 'aud')).rejects.toThrow(
        'email claim missing or invalid',
      );
    });
  });

  describe('post-check: email_verified claim', () => {
    it('email_verified=false はエラー (個人 Google アカウント等で稀)', async () => {
      mockPayload({
        email: 'a@b.c',
        email_verified: false,
        sub: 'sub',
      });

      await expect(verifyGoogleIdToken('token', 'aud')).rejects.toThrow(
        'email_verified must be true',
      );
    });

    it('email_verified 自体が無い (undefined) もエラー', async () => {
      mockPayload({
        email: 'a@b.c',
        sub: 'sub',
      });

      await expect(verifyGoogleIdToken('token', 'aud')).rejects.toThrow(
        'email_verified must be true',
      );
    });
  });

  describe('post-check: sub claim', () => {
    it('sub が無い場合はエラー', async () => {
      mockPayload({
        email: 'a@b.c',
        email_verified: true,
      });

      await expect(verifyGoogleIdToken('token', 'aud')).rejects.toThrow(
        'sub claim missing',
      );
    });

    it('sub が string でない場合はエラー', async () => {
      mockPayload({
        email: 'a@b.c',
        email_verified: true,
        sub: 999,
      });

      await expect(verifyGoogleIdToken('token', 'aud')).rejects.toThrow(
        'sub claim missing',
      );
    });
  });

  describe('jwtVerify エラーの propagate', () => {
    it('署名検証失敗時は jose のエラーをそのまま throw', async () => {
      const joseError = new Error('ERR_JWT_INVALID: bad signature');
      mockedJwtVerify.mockRejectedValueOnce(joseError);

      await expect(verifyGoogleIdToken('bad-token', 'aud')).rejects.toThrow(
        'bad signature',
      );
    });
  });
});
