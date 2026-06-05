// OpenAPI カバレッジ check (DoD ゲート)
// pages/api/** の全 route が openapi.yaml に登録されているかを検証する。
// 機能追加時に仕様書更新を忘れると CI が fail する (= 仕様書更新を Definition of Done に組み込む)。
//
// 実行: pnpm openapi:coverage
//
// 意図的に仕様書から除外する route は下の IGNORE に理由付きで追加する
// (新しいトップレベル領域を足すと「文書化するか除外するか」の判断を強制される)。
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const API_DIR = join(process.cwd(), 'pages/api');
const OPENAPI = join(process.cwd(), 'openapi.yaml');

// 仕様書 (ユーザー向け API) のスコープ外。chimo 合意 2026-06-05。
const IGNORE_PREFIXES = [
  '/api/system/', // system_admin 横断の社内管理 API
  '/api/auth/', // 認証 (next-auth / 招待受諾 / google-signin)
  '/api/dev/', // 開発用ログイン
  '/api/school/', // 学校レポート (集計ダッシュボード、chimo 指示で除外)
  '/api/test/', // テスト専用 seed
];
const IGNORE_EXACT = ['/api/health'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

// pages/api/tasks/[id]/comments/[commentId].ts → /api/tasks/{id}/comments/{commentId}
// pages/api/tasks/index.ts → /api/tasks
// pages/api/auth/[...nextauth].ts → null (catch-all は対象外)
function fileToRoute(file: string): string | null {
  let route = '/api/' + relative(API_DIR, file).replace(/\.tsx?$/, '');
  if (route.includes('[...')) return null;
  route = route.replace(/\/index$/, '');
  route = route.replace(/\[([^\]]+)\]/g, '{$1}');
  return route;
}

const routes = walk(API_DIR)
  .map(fileToRoute)
  .filter((r): r is string => r !== null);

const yaml = readFileSync(OPENAPI, 'utf8');
const documented = new Set(
  [...yaml.matchAll(/^ {2}(\/api\/\S+):/gm)].map((m) => m[1]),
);

const isIgnored = (r: string) =>
  IGNORE_EXACT.includes(r) || IGNORE_PREFIXES.some((p) => r.startsWith(p));

const missing = routes
  .filter((r) => !isIgnored(r) && !documented.has(r))
  .sort();
const stale = [...documented].filter((d) => !routes.includes(d)).sort();

let failed = false;

if (missing.length > 0) {
  failed = true;
  console.error(
    `\n❌ 仕様書 (openapi.yaml) に未登録の API route が ${missing.length} 件あります。`,
  );
  console.error(
    '   DoD: 機能の追加・変更時は OpenAPI 登録までを完了に含めること。\n',
  );
  for (const m of missing) console.error(`   - ${m}`);
  console.error(
    '\n   対応: src/openapi/registry.ts に registerPath を追加 → pnpm gen:openapi。',
  );
  console.error(
    '         意図的に対象外なら scripts/check-openapi-coverage.ts の IGNORE に理由付きで追加。',
  );
}

if (stale.length > 0) {
  failed = true;
  console.error(
    `\n❌ 対応する route が無いのに openapi.yaml に残っている path が ${stale.length} 件:`,
  );
  for (const s of stale) console.error(`   - ${s}`);
  console.error('   対応: route 削除時は registry.ts の登録も削除すること。');
}

if (failed) {
  process.exit(1);
}

const ignoredCount = routes.filter(isIgnored).length;
console.log(
  `✅ OpenAPI coverage OK: ${routes.length - ignoredCount} routes documented, ${ignoredCount} intentionally ignored.`,
);
