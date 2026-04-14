// SP-03: シークレットキャッシュパターン（5分 TTL）
// Secrets Manager への過剰な API コールを防ぎつつ、ローテーション後を反映する
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { logger } from './logger';

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION ?? 'ap-northeast-1',
});

const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getSecret(secretId: string): Promise<string> {
  const cached = cache.get(secretId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  const value = response.SecretString;
  if (!value) {
    throw new Error(`Secret ${secretId} has no string value`);
  }

  cache.set(secretId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

// 起動時の一括プリロード。失敗した場合はプロセスを終了する（RP-01 フェイルセーフ）
export async function preloadSecrets(secretIds: string[]): Promise<void> {
  // ローカル開発時は Secrets Manager をスキップ
  if (process.env.SKIP_SECRETS_MANAGER === 'true') {
    logger.info({ event: 'secrets.preload.skipped' }, 'Secrets Manager skipped (local dev)');
    return;
  }

  logger.info({ event: 'secrets.preload.start', count: secretIds.length }, 'Preloading secrets');

  await Promise.all(
    secretIds.map(async (id) => {
      try {
        await getSecret(id);
        logger.info({ event: 'secrets.preload.ok', secretId: id });
      } catch (err) {
        logger.error({ event: 'secrets.preload.failed', secretId: id, err }, 'Failed to load secret');
        throw err; // 呼び出し元でプロセス終了を行う
      }
    })
  );

  logger.info({ event: 'secrets.preload.complete', count: secretIds.length }, 'All secrets loaded');
}
