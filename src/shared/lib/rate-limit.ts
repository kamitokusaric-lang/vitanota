// BR-SEC-01: IP ごとメモリベースレート制限（SECURITY-11 準拠）
// 制約: App Runner が複数インスタンスにスケールした場合、インスタンス間でカウンタは共有されない
// MVP スケール（同時数百セッション）ではこの制約を許容する

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

const store = new Map<string, RateLimitEntry>();

// メモリリークを防ぐため古いエントリを定期的に削除
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.windowStart > 5 * 60 * 1000) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function checkRateLimit(
  ip: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(ip, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: new Date(now + windowMs),
    };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(entry.windowStart + windowMs),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: new Date(entry.windowStart + windowMs),
  };
}
