// SP-02: IAM トークン認証パターン（SECURITY-06・SECURITY-12 準拠）
// 静的パスワード不要。IAM ロールで RDS Proxy に接続する
import { Signer } from '@aws-sdk/rds-signer';
import { logger } from './logger';

const IAM_TOKEN_TTL_MS = 12 * 60 * 1000; // 12分（IAM トークン有効期限 15分の前にリフレッシュ）

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

const signer = new Signer({
  hostname: process.env.RDS_PROXY_ENDPOINT ?? '',
  port: 5432,
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
  username: process.env.DB_USER ?? '',
});

export async function getDbAuthToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  logger.info({ event: 'db.iam.token.refresh' }, 'Refreshing IAM auth token');

  const token = await signer.getAuthToken();

  tokenCache = { token, expiresAt: Date.now() + IAM_TOKEN_TTL_MS };

  return token;
}
