// Anthropic API 呼出し (AnthropicProxy Lambda 経由)
// AppRunner は VPC 内 (PRIVATE_ISOLATED, egress 不可) のため Anthropic API を直接呼べない。
// VPC 外 Lambda の Function URL 経由で呼出す。
// ローカル開発でも同じ経路 (.env.local に ANTHROPIC_PROXY_URL / ANTHROPIC_PROXY_SECRET を設定)
//
// 設計書: aidlc-docs/construction/weekly-summary-design.md § 11
// インフラ: infra/lib/data-shared-stack.ts AnthropicProxy Lambda

export const ANTHROPIC_MODEL_HAIKU = 'claude-haiku-4-5-20251001';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export interface AnthropicResponse {
  content: Array<AnthropicTextBlock | { type: string }>;
}

export interface CallAnthropicParams {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
}

export async function callAnthropicMessages(
  params: CallAnthropicParams,
): Promise<AnthropicResponse> {
  const proxyUrl = process.env.ANTHROPIC_PROXY_URL;
  const proxySecret = process.env.ANTHROPIC_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) {
    throw new Error(
      'ANTHROPIC_PROXY_URL or ANTHROPIC_PROXY_SECRET is not set',
    );
  }

  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-anthropic-proxy-secret': proxySecret,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AnthropicProxy returned ${res.status}: ${text}`);
  }
  return (await res.json()) as AnthropicResponse;
}
