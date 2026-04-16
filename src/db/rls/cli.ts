import { writeFileSync, readFileSync, existsSync } from 'fs';
import { policies } from './policies';
import { generateAllSql } from './generator';

const OUT_PATH = 'src/db/rls/generated.sql';
const command = process.argv[2];

switch (command) {
  case 'generate': {
    const sql = generateAllSql(policies);
    writeFileSync(OUT_PATH, sql);
    console.log(`Generated: ${OUT_PATH} (${policies.length} policies)`);
    break;
  }

  case 'check': {
    const expected = generateAllSql(policies);
    const actual = existsSync(OUT_PATH) ? readFileSync(OUT_PATH, 'utf-8') : '';
    if (expected !== actual) {
      console.error('RLS policies are out of sync. Run: pnpm rls:generate');
      process.exit(1);
    }
    console.log('RLS policies are in sync.');
    break;
  }

  default:
    console.error('Usage: tsx src/db/rls/cli.ts <generate|check>');
    process.exit(1);
}
