// JWKS バリデーション (純粋関数・AWS 非依存なので単体テスト対象)。
// 壊れた/空の応答を Secret に保管して全プロセスを道連れにする事故を防ぐための門番。

export interface Jwk {
  kty?: string;
  kid?: string;
  n?: string;
  e?: string;
  [k: string]: unknown;
}
export interface Jwks {
  keys: Jwk[];
}

// Google OAuth の JWKS として妥当か:
//   - { keys: [...] } 形式で鍵が 1 個以上
//   - 各鍵が RSA 公開鍵で kid / n / e が揃っている
export function isValidJwks(value: unknown): value is Jwks {
  if (!value || typeof value !== 'object') return false;
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || keys.length === 0) return false;
  return keys.every((k) => {
    if (!k || typeof k !== 'object') return false;
    const j = k as Jwk;
    return (
      j.kty === 'RSA' &&
      typeof j.kid === 'string' &&
      j.kid.length > 0 &&
      typeof j.n === 'string' &&
      j.n.length > 0 &&
      typeof j.e === 'string' &&
      j.e.length > 0
    );
  });
}
