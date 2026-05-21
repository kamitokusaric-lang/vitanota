// system_admin 用 journal CSV エクスポートの回帰防止テスト。
//
// chimo 絶対指示: 公開されている journal だけを出すこと。
// public_journal_entries VIEW (`is_public=true` を VIEW 定義に組み込み)
// 経由を担保するため、非公開エントリが混入しないことを最重要 assert で固定する。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withSystemAdminContext,
  rawQueryAsSuperuser,
  type TestDb,
} from './helpers/testDb';
import {
  seedTenant,
  seedUser,
  seedEntry,
  seedTag,
  attachTag,
} from './helpers/seed';
import { selectJournalExportRows } from '@/features/system/lib/journalExportQuery';

const SYSTEM_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000099';
const WINDOW_FROM = '2026-05-07';
const WINDOW_TO = '2026-05-21';

async function setEntryCreatedAt(entryId: string, createdAt: string): Promise<void> {
  await rawQueryAsSuperuser(
    `UPDATE journal_entries SET created_at = $1, updated_at = $1 WHERE id = $2`,
    [createdAt, entryId],
  );
}

async function attachKnowledgeTag(
  db: TestDb,
  args: { tenantId: string; userId: string; entryId: string; name: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${args.userId}, true)`);
    const inserted = await tx.execute(sql`
      INSERT INTO knowledge_tags (tenant_id, name, created_by)
      VALUES (${args.tenantId}::uuid, ${args.name}, ${args.userId}::uuid)
      RETURNING id
    `);
    const tagId = (inserted.rows[0] as { id: string }).id;
    await tx.execute(sql`
      INSERT INTO journal_entry_knowledge_tags (journal_entry_id, knowledge_tag_id, tenant_id)
      VALUES (${args.entryId}::uuid, ${tagId}::uuid, ${args.tenantId}::uuid)
    `);
  });
}

describe('journal-export integration', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
  });

  it('chimo 絶対指示: is_public=false のエントリは絶対に CSV に含まれない', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const user = await seedUser(db, tenant.id, 'teacher', 'a@test.example.com');

    const publicEntries = await Promise.all(
      ['公開 1', '公開 2', '公開 3'].map((c) =>
        seedEntry(db, { tenantId: tenant.id, userId: user.id, content: c, isPublic: true }),
      ),
    );
    const privateEntries = await Promise.all(
      ['非公開 1', '非公開 2', '非公開 3', '非公開 4', '非公開 5'].map((c) =>
        seedEntry(db, { tenantId: tenant.id, userId: user.id, content: c, isPublic: false }),
      ),
    );

    // すべてのエントリを期間内に揃える (created_at default は now、明示する)
    for (const e of [...publicEntries, ...privateEntries]) {
      await setEntryCreatedAt(e.id, '2026-05-14T10:00:00+09:00');
    }

    const rows = await withSystemAdminContext(db, SYSTEM_ADMIN_USER_ID, async (tx) => {
      return selectJournalExportRows(tx as unknown as Parameters<typeof selectJournalExportRows>[0], {
        tenantId: tenant.id,
        from: WINDOW_FROM,
        to: WINDOW_TO,
      });
    });

    expect(rows).toHaveLength(3);
    const returnedIds = rows.map((r) => r.id).sort();
    const expectedPublicIds = publicEntries.map((e) => e.id).sort();
    expect(returnedIds).toEqual(expectedPublicIds);

    // 非公開エントリの id が 1 件たりとも返ってきていない
    const privateIdSet = new Set(privateEntries.map((e) => e.id));
    for (const r of rows) {
      expect(privateIdSet.has(r.id)).toBe(false);
    }

    // content にも非公開の本文が混入していない
    const privateContents = new Set(privateEntries.map((_e, i) => `非公開 ${i + 1}`));
    for (const r of rows) {
      expect(privateContents.has(r.content)).toBe(false);
    }
  });

  it('別テナントの公開エントリは混ざらない', async () => {
    const tenantA = await seedTenant(db, '学校 A');
    const tenantB = await seedTenant(db, '学校 B');
    const userA = await seedUser(db, tenantA.id, 'teacher', 'a@test.example.com');
    const userB = await seedUser(db, tenantB.id, 'teacher', 'b@test.example.com');

    const aPub = await seedEntry(db, {
      tenantId: tenantA.id,
      userId: userA.id,
      content: 'A 公開',
      isPublic: true,
    });
    const bPub = await seedEntry(db, {
      tenantId: tenantB.id,
      userId: userB.id,
      content: 'B 公開',
      isPublic: true,
    });
    await setEntryCreatedAt(aPub.id, '2026-05-14T10:00:00+09:00');
    await setEntryCreatedAt(bPub.id, '2026-05-14T10:00:00+09:00');

    const rows = await withSystemAdminContext(db, SYSTEM_ADMIN_USER_ID, async (tx) => {
      return selectJournalExportRows(tx as unknown as Parameters<typeof selectJournalExportRows>[0], {
        tenantId: tenantA.id,
        from: WINDOW_FROM,
        to: WINDOW_TO,
      });
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(aPub.id);
    expect(rows[0].content).toBe('A 公開');
  });

  it('期間外のエントリは除外される (JST 日付ベース、両端包含)', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const user = await seedUser(db, tenant.id, 'teacher', 'a@test.example.com');

    const beforeWindow = await seedEntry(db, {
      tenantId: tenant.id,
      userId: user.id,
      content: '期間前',
      isPublic: true,
    });
    const fromBoundary = await seedEntry(db, {
      tenantId: tenant.id,
      userId: user.id,
      content: '開始日',
      isPublic: true,
    });
    const middle = await seedEntry(db, {
      tenantId: tenant.id,
      userId: user.id,
      content: '期間内',
      isPublic: true,
    });
    const toBoundary = await seedEntry(db, {
      tenantId: tenant.id,
      userId: user.id,
      content: '終了日',
      isPublic: true,
    });
    const afterWindow = await seedEntry(db, {
      tenantId: tenant.id,
      userId: user.id,
      content: '期間後',
      isPublic: true,
    });

    await setEntryCreatedAt(beforeWindow.id, '2026-05-06T23:59:00+09:00');
    await setEntryCreatedAt(fromBoundary.id, '2026-05-07T00:00:00+09:00');
    await setEntryCreatedAt(middle.id, '2026-05-14T12:00:00+09:00');
    await setEntryCreatedAt(toBoundary.id, '2026-05-21T23:59:00+09:00');
    await setEntryCreatedAt(afterWindow.id, '2026-05-22T00:00:00+09:00');

    const rows = await withSystemAdminContext(db, SYSTEM_ADMIN_USER_ID, async (tx) => {
      return selectJournalExportRows(tx as unknown as Parameters<typeof selectJournalExportRows>[0], {
        tenantId: tenant.id,
        from: WINDOW_FROM,
        to: WINDOW_TO,
      });
    });

    const contents = rows.map((r) => r.content);
    expect(contents).toContain('開始日');
    expect(contents).toContain('期間内');
    expect(contents).toContain('終了日');
    expect(contents).not.toContain('期間前');
    expect(contents).not.toContain('期間後');
  });

  it('emotion_tags / knowledge_tags が ; 区切り・name 昇順で集約される', async () => {
    const tenant = await seedTenant(db, '学校 A');
    const user = await seedUser(db, tenant.id, 'teacher', 'a@test.example.com');
    const entry = await seedEntry(db, {
      tenantId: tenant.id,
      userId: user.id,
      content: '集約テスト',
      isPublic: true,
    });
    await setEntryCreatedAt(entry.id, '2026-05-14T10:00:00+09:00');

    // emotion_tags を 2 つ attach
    const tagBeta = await seedTag(db, {
      tenantId: tenant.id,
      userId: user.id,
      name: 'β タグ',
      category: 'neutral',
    });
    const tagAlpha = await seedTag(db, {
      tenantId: tenant.id,
      userId: user.id,
      name: 'α タグ',
      category: 'positive',
    });
    await attachTag(db, {
      tenantId: tenant.id,
      userId: user.id,
      entryId: entry.id,
      tagId: tagBeta.id,
    });
    await attachTag(db, {
      tenantId: tenant.id,
      userId: user.id,
      entryId: entry.id,
      tagId: tagAlpha.id,
    });

    // knowledge_tags を 2 つ attach
    await attachKnowledgeTag(db, {
      tenantId: tenant.id,
      userId: user.id,
      entryId: entry.id,
      name: 'znowledge',
    });
    await attachKnowledgeTag(db, {
      tenantId: tenant.id,
      userId: user.id,
      entryId: entry.id,
      name: 'aknowledge',
    });

    const rows = await withSystemAdminContext(db, SYSTEM_ADMIN_USER_ID, async (tx) => {
      return selectJournalExportRows(tx as unknown as Parameters<typeof selectJournalExportRows>[0], {
        tenantId: tenant.id,
        from: WINDOW_FROM,
        to: WINDOW_TO,
      });
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].emotion_tags).toBe('α タグ;β タグ');
    expect(rows[0].knowledge_tags).toBe('aknowledge;znowledge');
  });
});
