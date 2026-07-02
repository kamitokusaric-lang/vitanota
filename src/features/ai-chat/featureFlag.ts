// AI チャット機能のテナント単位フラグ判定 (chimo 2026-05-13 設計)。
//
// 判定ルール (上位優先):
//   1. ENABLE_AI_CHAT_EXTRACTION=false → 全テナント OFF (緊急停止)
//   2. AI_CHAT_ALLOWLIST_TENANT_IDS 未設定 or 空 → 全テナント ON (後方互換、Phase 7 全公開時)
//   3. AI_CHAT_ALLOWLIST_TENANT_IDS=<uuid>,<uuid>... 設定済 → 該当テナントのみ ON
//
// memory project_ai_strategy_20260511.md は「全テナント一斉 ON/OFF」を MVP 範囲とし、
// テナント単位フラグは「将来必要なら拡張」と明記。今回 H1 検証フェーズの先行 ON 用途で
// 軽量 allowlist のみ追加。DB ベースのフラグ管理に拡張する話は post-mvp-backlog 行き。
//
// 観測者原則: 「自分のテナントでは AI 機能がない」状態を school_admin が気づきにくい設計
// (404 を返す)。allowlist に入ってるか否かは公開情報にしない。

const MASTER_ENABLED =
  (process.env.ENABLE_AI_CHAT_EXTRACTION ?? 'false').toLowerCase() === 'true';

// ふりかえり → AIリコメンド機能の master flag (AI チャットとは独立に段階公開できるよう別 env)。
// allowlist (AI_CHAT_ALLOWLIST_TENANT_IDS) は AI チャットと共有する (同じ先行テナント群)。
const RETRO_RECOMMEND_ENABLED =
  (process.env.ENABLE_RETRO_RECOMMEND ?? 'false').toLowerCase() === 'true';

// Lazy parse して memo (process.env は env reload で変わらない、コールド起動時に確定)
let cachedAllowlist: ReadonlySet<string> | null = null;

function getAllowlist(): ReadonlySet<string> {
  if (cachedAllowlist) return cachedAllowlist;
  const raw = process.env.AI_CHAT_ALLOWLIST_TENANT_IDS ?? '';
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  cachedAllowlist = new Set(ids);
  return cachedAllowlist;
}

/**
 * 当該テナントで AI チャット機能が利用可能か判定。
 * 全テナント停止 / 未割当テナント / unknown tenant に対しては false。
 */
export function isAiChatEnabledForTenant(tenantId: string | undefined | null): boolean {
  if (!MASTER_ENABLED) return false;
  if (!tenantId) return false;
  const allowlist = getAllowlist();
  if (allowlist.size === 0) return true; // 未設定 = 全テナント ON (Phase 7 公開時)
  return allowlist.has(tenantId);
}

/**
 * 当該テナントで「ふりかえり → AIリコメンド」機能が利用可能か判定。
 * ENABLE_RETRO_RECOMMEND が master。allowlist は AI チャットと共有 (空なら全テナント ON)。
 * 観測者原則: allowlist 外は route 側で 404 を返し、機能の存在を悟らせない。
 */
export function isRetroRecommendEnabledForTenant(
  tenantId: string | undefined | null,
): boolean {
  if (!RETRO_RECOMMEND_ENABLED) return false;
  if (!tenantId) return false;
  const allowlist = getAllowlist();
  if (allowlist.size === 0) return true;
  return allowlist.has(tenantId);
}
