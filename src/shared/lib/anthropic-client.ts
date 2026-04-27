// Anthropic SDK シングルトン
// 環境変数 ANTHROPIC_API_KEY を読み込む
// 設計書: aidlc-docs/construction/weekly-summary-design.md § 11
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  client = new Anthropic({ apiKey });
  return client;
}

// モデル定数 (集中管理、モデル更新時はここを変えるだけで済む)
export const ANTHROPIC_MODEL_HAIKU = 'claude-haiku-4-5-20251001';
