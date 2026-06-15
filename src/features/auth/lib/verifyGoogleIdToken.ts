// Google ID Token のローカル検証ユーティリティ
//
// JWKS の取得元 (chimo 2026-06-15 恒久対策):
//   1. プロセス内キャッシュ (TTL 1h)
//   2. Secrets Manager の Secret (jwks-refresher Lambda が定期更新・VPC Endpoint 経由で読む)
//   3. kid 不一致時は refresher Lambda を on-demand invoke して即更新 (クールダウン 60s)
//   4. 上記すべて失敗時は build 時焼き込み JSON にフォールバック (安全網・現状維持)
// AppRunner は PRIVATE_ISOLATED で外向き通信できないため、Google を直接 fetch しない。
// env (GOOGLE_JWKS_SECRET_ARN / JWKS_REFRESHER_LAMBDA_ARN) 未設定のローカル/CI では焼き込みのみで成立。
//
// 設計詳細: docs (JWKS 恒久対策) / 旧: aidlc-docs/construction/auth-externalization.md
import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { logger } from '@/shared/lib/logger';
import bakedJwks from './google-jwks.json';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const SECRET_ARN = process.env.GOOGLE_JWKS_SECRET_ARN ?? '';
const REFRESHER_ARN = process.env.JWKS_REFRESHER_LAMBDA_ARN ?? '';
const REGION = process.env.AWS_REGION ?? 'ap-northeast-1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h: Secret を読み直す間隔
const TRIGGER_COOLDOWN_MS = 60 * 1000; // 60s: kid 不一致トリガーの濫用防止

export interface GoogleIdTokenClaims extends JWTPayload {
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  sub: string;
}

type JwkSet = ReturnType<typeof createLocalJWKSet>;
type JwksJson = { keys: Array<Record<string, unknown>> };

function buildSet(jwks: JwksJson): JwkSet {
  return createLocalJWKSet(jwks);
}

// 焼き込み JSON を最終フォールバックの初期値に。Secret 取得まではこれで検証する。
let cachedJwkSet: JwkSet = buildSet(bakedJwks as JwksJson);
let cacheLoadedAt = 0; // 0 = まだ Secret から読めていない (焼き込みのみ)
let lastTriggerAt = 0;

const secretsClient = SECRET_ARN
  ? new SecretsManagerClient({ region: REGION })
  : null;
const lambdaClient = REFRESHER_ARN ? new LambdaClient({ region: REGION }) : null;

function isJwksJson(v: unknown): v is JwksJson {
  return (
    !!v &&
    typeof v === 'object' &&
    Array.isArray((v as { keys?: unknown }).keys) &&
    (v as JwksJson).keys.length > 0
  );
}

// Secret から JWKS を読み込みキャッシュ更新。成功で true。
async function loadFromSecret(): Promise<boolean> {
  if (!secretsClient) return false;
  try {
    const out = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: SECRET_ARN }),
    );
    if (!out.SecretString) return false;
    const parsed: unknown = JSON.parse(out.SecretString);
    if (!isJwksJson(parsed)) return false;
    cachedJwkSet = buildSet(parsed);
    cacheLoadedAt = Date.now();
    return true;
  } catch (err) {
    logger.warn({
      event: 'auth.jwks.secret_load_failed',
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// キャッシュが新鮮でなければ Secret を読み直す。失敗時は現在のキャッシュ (焼き込み or 旧値) を維持。
async function ensureJwkSet(): Promise<void> {
  if (cacheLoadedAt > 0 && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return;
  await loadFromSecret();
}

// kid 不一致時に refresher Lambda を on-demand invoke し、応答 JWKS でキャッシュを即更新。
// クールダウンで偽 kid 連打による invoke storm を防ぐ。成功で true。
async function triggerRefresh(): Promise<boolean> {
  if (!lambdaClient) return false;
  if (Date.now() - lastTriggerAt < TRIGGER_COOLDOWN_MS) return false;
  lastTriggerAt = Date.now();
  try {
    const res = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: REFRESHER_ARN,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify({ source: 'kid_miss' })),
      }),
    );
    if (!res.Payload) return false;
    const parsed = JSON.parse(Buffer.from(res.Payload).toString('utf-8')) as {
      ok?: boolean;
      jwks?: unknown;
    };
    if (!parsed.ok || !isJwksJson(parsed.jwks)) return false;
    cachedJwkSet = buildSet(parsed.jwks);
    cacheLoadedAt = Date.now();
    logger.info({
      event: 'auth.jwks.refreshed_on_kid_miss',
      count: parsed.jwks.keys.length,
    });
    return true;
  } catch (err) {
    logger.warn({
      event: 'auth.jwks.refresh_trigger_failed',
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function isNoMatchingKey(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'ERR_JWKS_NO_MATCHING_KEY'
  );
}

async function doVerify(
  idToken: string,
  audience: string,
): Promise<GoogleIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, cachedJwkSet, {
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

/**
 * Google ID Token を検証する。
 *
 * 検証項目: 署名 (JWKS) / iss / aud / exp / email_verified。
 * kid 不一致 (鍵ローテ直後等) は refresher Lambda を起動して 1 回だけ retry する。
 *
 * @throws JOSEError 系の例外 (ERR_JWT_INVALID / ERR_JWKS_NO_MATCHING_KEY 等)
 */
export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
): Promise<GoogleIdTokenClaims> {
  await ensureJwkSet();
  try {
    return await doVerify(idToken, audience);
  } catch (err) {
    if (isNoMatchingKey(err) && (await triggerRefresh())) {
      return doVerify(idToken, audience); // 更新後に 1 回だけ retry
    }
    throw err;
  }
}
