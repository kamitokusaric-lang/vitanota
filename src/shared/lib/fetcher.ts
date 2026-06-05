// SWR 等で使う汎用 JSON fetcher。
// fetch → !ok なら HTTP ステータスで throw → JSON parse、という各所のコピペを一本化したもの。
export async function jsonFetcher<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// キャッシュを使わず毎回サーバーへ取りに行く版 (集計ダッシュボード等、鮮度優先の箇所向け)。
export function noStoreJsonFetcher<T = unknown>(url: string): Promise<T> {
  return jsonFetcher<T>(url, { cache: 'no-store' });
}
