// H7-B 職員室ボード (staffroom) データ基盤の RLS 境界統合テスト
// 実 PostgreSQL で RLS・複合 FK・公開/非公開可視性・enum 制約を検証する。
//
// 確定モデル (chimo 2026-06-10):
//   - board 投稿は journal_entries(kind IN ('keep','concern','thanks','help'))。補助列なし。
//   - is_public は本人選択 (default true)。board 専用 RLS は持たず既存 journal RLS で回す:
//       公開 board (is_public=true) → テナント内全教員が読める (journal_entry_public_read)
//       非公開 board (is_public=false) → 本人のみ (journal_entry_owner_all)
//   - フィード (boardRepo.findList) は app 層で「公開 OR 自分」に絞る
//     (school_admin が他人の非公開を覗かないよう RLS と二重)。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withTenantContext,
  rawQueryAsSuperuser,
  type TestDb,
} from './helpers/testDb';
import { seedTenant, seedUser } from './helpers/seed';
import { classes, students, journalEntries } from '@/db/schema';
import { boardRepo } from '@/features/staffroom/lib/staffroomRepository';

// テスト DB (TestDb) と repo が期待する DrizzleDb は構造同一だが型名が違うため吸収する。
type RepoDb = Parameters<typeof boardRepo.findList>[0];

type Tenant = Awaited<ReturnType<typeof seedTenant>>;
type User = Awaited<ReturnType<typeof seedUser>>;

describe('staffroom (職員室ボード) RLS 境界', () => {
  let db: TestDb;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let teacherA1: User;
  let teacherA2: User;
  let adminA: User; // school_admin in A
  let teacherB: User;

  let classA: { id: string };
  let studentX: { id: string };
  let studentB: { id: string }; // tenantB の生徒
  let publicBoardByA1: { id: string }; // is_public=true
  let privateBoardByA1: { id: string }; // is_public=false

  beforeAll(async () => {
    db = await startTestDb();
  });
  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await truncateAll(db);
    tenantA = await seedTenant(db, '学校 A');
    tenantB = await seedTenant(db, '学校 B');
    teacherA1 = await seedUser(db, tenantA.id, 'teacher');
    teacherA2 = await seedUser(db, tenantA.id, 'teacher');
    adminA = await seedUser(db, tenantA.id, 'school_admin');
    teacherB = await seedUser(db, tenantB.id, 'teacher');

    [classA] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.insert(classes).values({ tenantId: tenantA.id, name: '2-A' }).returning({ id: classes.id }),
    );
    [studentX] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .insert(students)
        .values({ tenantId: tenantA.id, classId: classA.id, displayName: 'さくら' })
        .returning({ id: students.id }),
    );
    const [classBId] = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx.insert(classes).values({ tenantId: tenantB.id, name: '1-B' }).returning({ id: classes.id }),
    );
    [studentB] = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx
        .insert(students)
        .values({ tenantId: tenantB.id, classId: classBId.id, displayName: 'べつ生徒' })
        .returning({ id: students.id }),
    );

    // teacherA1 の 公開 board (keep) と 非公開 board (concern)
    [publicBoardByA1] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .insert(journalEntries)
        .values({
          tenantId: tenantA.id,
          userId: teacherA1.id,
          kind: 'keep',
          isPublic: true,
          content: '朝の会の声かけが効いた',
          classId: classA.id,
        })
        .returning({ id: journalEntries.id }),
    );
    [privateBoardByA1] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .insert(journalEntries)
        .values({
          tenantId: tenantA.id,
          userId: teacherA1.id,
          kind: 'concern',
          isPublic: false,
          content: 'まだ自分の中だけのメモ',
        })
        .returning({ id: journalEntries.id }),
    );
  });

  // ── 1. クロステナント遮断 ───────────────────────────────────
  it('tenantB の teacher は tenantA の board を読めない', async () => {
    const boards = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx.select().from(journalEntries),
    );
    expect(boards).toHaveLength(0);
  });

  // ── 2. 公開 board は同僚 (teacher / school_admin) が読める ──
  it('公開 board は別の teacher も school_admin も読める', async () => {
    const asA2 = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx.select().from(journalEntries).where(eq(journalEntries.id, publicBoardByA1.id)),
    );
    const asAdmin = await withTenantContext(
      db,
      tenantA.id,
      adminA.id,
      (tx) => tx.select().from(journalEntries).where(eq(journalEntries.id, publicBoardByA1.id)),
      'school_admin',
    );
    expect(asA2).toHaveLength(1);
    expect(asAdmin).toHaveLength(1);
  });

  // ── 3. 非公開 board は本人だけ ───────────────────────────────
  it('非公開 board は別の teacher には見えない (本人は見える)', async () => {
    const asOther = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx.select().from(journalEntries).where(eq(journalEntries.id, privateBoardByA1.id)),
    );
    const asOwner = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.select().from(journalEntries).where(eq(journalEntries.id, privateBoardByA1.id)),
    );
    expect(asOther).toHaveLength(0);
    expect(asOwner).toHaveLength(1);
  });

  // ── 4. フィードは「公開 + 自分」に絞る (school_admin も他人の非公開は出ない) ──
  it('boardRepo.findList: teacher も school_admin も 公開 board は見え 他人の非公開は出ない', async () => {
    const asA2 = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      boardRepo.findList(tx as unknown as RepoDb, { userId: teacherA2.id, tenantId: tenantA.id }, {}),
    );
    const asAdmin = await withTenantContext(
      db,
      tenantA.id,
      adminA.id,
      (tx) => boardRepo.findList(tx as unknown as RepoDb, { userId: adminA.id, tenantId: tenantA.id }, {}),
      'school_admin',
    );
    const a2Ids = asA2.map((b) => b.id);
    const adminIds = asAdmin.map((b) => b.id);
    expect(a2Ids).toContain(publicBoardByA1.id);
    expect(a2Ids).not.toContain(privateBoardByA1.id);
    expect(adminIds).toContain(publicBoardByA1.id);
    expect(adminIds).not.toContain(privateBoardByA1.id);
  });

  it('boardRepo.findList: 自分の非公開 board は自分のフィードに出る', async () => {
    const own = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      boardRepo.findList(tx as unknown as RepoDb, { userId: teacherA1.id, tenantId: tenantA.id }, {}),
    );
    expect(own.map((b) => b.id)).toContain(privateBoardByA1.id);
  });

  // ── 5. board 書込は本人のみ (teacher) ───────────────────────
  it('他の teacher は A1 の board を更新できない (0 行)・本人は更新できる', async () => {
    const byOther = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx
        .update(journalEntries)
        .set({ content: '改ざん' })
        .where(eq(journalEntries.id, publicBoardByA1.id))
        .returning(),
    );
    expect(byOther).toHaveLength(0);
    const byOwner = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .update(journalEntries)
        .set({ content: '本人が修正' })
        .where(eq(journalEntries.id, publicBoardByA1.id))
        .returning(),
    );
    expect(byOwner).toHaveLength(1);
  });

  // ── 6. enum 制約 ────────────────────────────────────────────
  it('board kind の値域外は enum 制約で弾かれる', async () => {
    await expect(
      rawQueryAsSuperuser(
        `INSERT INTO journal_entries (tenant_id, user_id, content, kind, is_public)
         VALUES ($1, $2, '不正', 'not_a_kind', false)`,
        [tenantA.id, teacherA1.id],
      ),
    ).rejects.toThrow();
  });

  // ── 7. 複合 FK student / class (board ↔ students) ───────────
  it('別テナントの student_id を紐付けた board の INSERT は複合 FK で失敗', async () => {
    await expect(
      rawQueryAsSuperuser(
        `INSERT INTO journal_entries (tenant_id, user_id, content, kind, is_public, student_id)
         VALUES ($1, $2, 'なりすまし', 'keep', true, $3)`,
        [tenantA.id, teacherA1.id, studentB.id],
      ),
    ).rejects.toThrow();
  });

  it('紐づく student を削除すると board.student_id は SET NULL になり board は残る', async () => {
    const [boardWithStudent] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .insert(journalEntries)
        .values({
          tenantId: tenantA.id,
          userId: teacherA1.id,
          kind: 'keep',
          isPublic: true,
          content: 'さくらの様子',
          studentId: studentX.id,
        })
        .returning({ id: journalEntries.id }),
    );
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.delete(students).where(eq(students.id, studentX.id)),
    );
    const rows = await rawQueryAsSuperuser<{ id: string; student_id: string | null; content: string }>(
      `SELECT id, student_id, content FROM journal_entries WHERE id = $1`,
      [boardWithStudent.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].student_id).toBeNull();
    expect(rows[0].content).toBe('さくらの様子');
  });
});
