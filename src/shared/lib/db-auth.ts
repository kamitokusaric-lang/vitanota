// SP-02: IAM トークン認証パターン（SECURITY-06・SECURITY-12 準拠）
// 静的パスワード不要。IAM ロールで RDS Proxy に接続する
import { Signer } from '@aws-sdk/rds-signer';
import { randomUUID } from 'node:crypto';
import { logger } from './logger';

const IAM_TOKEN_TTL_MS = 12 * 60 * 1000; // 12分（IAM トークン有効期限 15分の前にリフレッシュ）

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
  hostname: process.env.RDS_PROXY_ENDPOINT ?? '',
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

export async function getDbAuthToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
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

// Test 用: cache を完全リセットする。production code から呼ばないこと。
export function __resetTokenCacheForTest(): void {
  tokenCache = null;
  inflight = null;
}
