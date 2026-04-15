// Step 18: OpenAPI 仕様を openapi.yaml に書き出すスクリプト
// 実行: pnpm gen:openapi
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { buildOpenApiDocument } from '../src/openapi/registry';

const document = buildOpenApiDocument();
const yamlContent = stringify(document, { lineWidth: 120 });
const outputPath = resolve(process.cwd(), 'openapi.yaml');

writeFileSync(outputPath, yamlContent, 'utf8');

const pathCount = Object.keys(document.paths ?? {}).length;
const operationCount = Object.values(document.paths ?? {}).reduce(
  (acc, path) => acc + Object.keys(path).length,
  0
);

// eslint-disable-next-line no-console
console.log(`✅ openapi.yaml を生成しました`);
// eslint-disable-next-line no-console
console.log(`   - ${pathCount} paths, ${operationCount} operations`);
// eslint-disable-next-line no-console
console.log(`   - ${outputPath}`);
