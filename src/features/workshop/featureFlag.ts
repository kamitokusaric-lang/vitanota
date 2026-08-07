// 研修 (workshop) 機能のテナント単位フラグ判定 (chimo 2026-07-29 設計)。
// src/features/ai-chat/featureFlag.ts の isRetroRecommendEnabledForTenant と同型。
//
// 判定ルール (上位優先):
//   1. ENABLE_WORKSHOP=false (既定) → 全テナント OFF
//   2. WORKSHOP_ALLOWLIST_TENANT_IDS 未設定 or 空 → 全テナント ON
//   3. WORKSHOP_ALLOWLIST_TENANT_IDS=<uuid>,<uuid>... → 該当テナントのみ ON
//
// 研修は当面ニセコ中だけの決め打ち運用のため allowlist で絞る。
// 観測者原則: allowlist 外テナントには route 側で 404 を返し、機能の存在を悟らせない。
//
// 注意: 新 env は AppRunner に流すため、本番反映は cdk deploy が必要
// (deploy.yml の image 更新だけでは env は入らない)。

const MASTER_ENABLED =
  (process.env.ENABLE_WORKSHOP ?? 'false').toLowerCase() === 'true';

// Lazy parse して memo (process.env はコールド起動時に確定)
let cachedAllowlist: ReadonlySet<string> | null = null;

function getAllowlist(): ReadonlySet<string> {
  if (cachedAllowlist) return cachedAllowlist;
  const raw = process.env.WORKSHOP_ALLOWLIST_TENANT_IDS ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  cachedAllowlist = new Set(ids);
  return cachedAllowlist;
}

/**
 * 当該テナントで研修機能が利用可能か判定。
 * 全テナント停止 / 未割当テナント / unknown tenant に対しては false。
 */
export function isWorkshopEnabledForTenant(
  tenantId: string | undefined | null,
): boolean {
  if (!MASTER_ENABLED) return false;
  if (!tenantId) return false;
  const allowlist = getAllowlist();
  if (allowlist.size === 0) return true; // 未設定 = 全テナント ON
  return allowlist.has(tenantId);
}
