// Google ID Token のローカル検証ユーティリティ
//
// バンドル済み JWKS (google-jwks.json) で署名検証・iss / aud / exp を検証する。
// Google への外部通信は発生しない (Docker build 時に JWKS を焼き込む設計)。
//
// 設計詳細: aidlc-docs/construction/auth-externalization.md
import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';
import googleJwks from './google-jwks.json';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleIdTokenClaims extends JWTPayload {
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  sub: string;
}

// JWKS はモジュールロード時に 1 回だけ解析（以後キャッシュ）
const jwkSet = createLocalJWKSet(googleJwks as { keys: Array<Record<string, unknown>> });

/**
 * Google ID Token を検証する。
 *
 * 検証項目:
 * - 署名 (JWKS で Google 公開鍵検証)
 * - iss: accounts.google.com
 * - aud: audience パラメータと一致
 * - exp: 未失効
 * - nonce: 呼び出し元で検証すること（本関数では扱わない）
 *
 * @throws JOSEError 系の例外 (ERR_JWT_INVALID / ERR_JWKS_NO_MATCHING_KEY 等)
 */
export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
): Promise<GoogleIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, jwkSet, {
    issuer: GOOGLE_ISSUERS,
    audience,
  });

  // 型安全のための最低限のチェック
  if (typeof payload.email !== 'string') {
    throw new Error('ID Token: email claim missing or invalid');
  }
  if (payload.email_verified !== true) {
    throw new Error('ID Token: email_verified must be true');
  }
  if (typeof payload.sub !== 'string') {
    throw new Error('ID Token: sub claim missing');
  }

  return payload as GoogleIdTokenClaims;
}
