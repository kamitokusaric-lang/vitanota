// SP-02: IAM トークン認証パターン（SECURITY-06・SECURITY-12 準拠）
// 静的パスワード不要。IAM ロールで RDS に直接接続する (RDS Proxy 経由ではない)
import { Signer } from '@aws-sdk/rds-signer';
import { randomUUID } from 'node:crypto';
import { logger } from './logger';

// IAM トークンは仕様上 RDS 側 TTL 15 分。ただし 5/9 観測 (`db.client.connect.failed` の
// token_age_at_connect_ms が 11.3 分台に集中) により、実効 TTL は 11 分前後で reject 開始
// することが判明 (H5 stale retention 確定)。cache TTL 12 分では「賞味期限切れ token を
// 抱えた pool client」が pool 内に残り、新規 PAM 認証要求で reject される波の引き金になっていた。
// 8 分に短縮し、RDS 実効 TTL ~11 分に対し 3 分以上のマージンを確保する。
export const IAM_TOKEN_TTL_MS = 8 * 60 * 1000;

interface TokenCache {
  token: string;
  expiresAt: number;
  generationId: string;
  createdAt: number;
}

export interface TokenMeta {
  generationId: string;
  createdAt: number;
}

let tokenCache: TokenCache | null = null;
// singleflight: cache miss が並列に来たとき、IAM signer 呼び出しを 1 本に集約する。
// 旧実装は N 並列 cache miss が N 個の token を生成し、最後勝ちで cache 上書きしていた
// （PAM auth failed の波の trigger 候補のひとつ）。
let inflight: Promise<string> | null = null;

const signer = new Signer({
  hostname: process.env.RDS_ENDPOINT ?? '',
  port: 5432,
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  username: process.env.DB_USER ?? '',
});

async function refreshToken(): Promise<string> {
  const generationId = randomUUID();
  logger.info(
    { event: 'db.iam.token.refresh', token_generation_id: generationId },
    'Refreshing IAM auth token',
  );
  const fetchedToken = await signer.getAuthToken();
  const createdAt = Date.now();
  tokenCache = {
    token: fetchedToken,
    expiresAt: createdAt + IAM_TOKEN_TTL_MS,
    generationId,
    createdAt,
  };
  return fetchedToken;
}

export async function getDbAuthToken(opts?: { forceRefresh?: boolean }): Promise<string> {
  const forceRefresh = opts?.forceRefresh === true;
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  // forceRefresh でも inflight があれば集約する (signer storm 防止)。
  // 1 instance 内で複数 callsite が同時に PAM failed を踏むのは全部同じ古い世代へのもので、
  // invalidate 1 回 + refresh 1 回で十分。
  if (inflight) return inflight;

  inflight = refreshToken().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function getCurrentTokenMeta(): TokenMeta | null {
  return tokenCache
    ? { generationId: tokenCache.generationId, createdAt: tokenCache.createdAt }
    : null;
}

// compare-and-invalidate: 現在 cache の generationId と一致するときだけ消す。
// 不一致 = 旧世代の遅延 failure。新 token cache を巻き添えで消さない。
// incident #6 (2026-05-12) で旧 token failure が新 token 成功の 0.4 秒後に到着する race を観測済。
export function invalidateTokenGeneration(generationId: string, reason: string): boolean {
  if (tokenCache && tokenCache.generationId === generationId) {
    const tokenAgeMs = Date.now() - tokenCache.createdAt;
    logger.warn(
      {
        event: 'db.iam.token.invalidated',
        generation_id: generationId,
        reason,
        token_age_ms: tokenAgeMs,
      },
      'IAM auth token invalidated (compare-and-invalidate matched)',
    );
    tokenCache = null;
    return true;
  }
  logger.info(
    {
      event: 'db.iam.token.invalidate.skipped',
      failed_generation_id: generationId,
      current_generation_id: tokenCache?.generationId ?? null,
      reason,
    },
    'IAM auth token invalidation skipped (generation mismatch)',
  );
  return false;
}

// Test 用: cache を完全リセットする。production code から呼ばないこと。
export function __resetTokenCacheForTest(): void {
  tokenCache = null;
  inflight = null;
}
