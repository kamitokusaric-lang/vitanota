// H7 朝のバトンリレー (baton-relay) データ基盤の RLS 境界統合テスト
// 実 PostgreSQL で RLS・複合 FK・append-only・トグル一意制約を検証する。
//
// 確定仕様 (chimo 2026-06-08):
//   - teacher と school_admin は同一権限 (相互関心層・全教員可視)
//   - 書込はノート/リアクションとも著者本人の行のみ
//   - baton_notes は append-only (同著者同日複数行可)
//   - student_reactions は (tenant, student, user, type) で一意 (トグル)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withTenantContext,
  rawQuery,
  type TestDb,
} from './helpers/testDb';
import { seedTenant, seedUser } from './helpers/seed';
import { classes, students, batonNotes, studentReactions } from '@/db/schema';

type Tenant = Awaited<ReturnType<typeof seedTenant>>;
type User = Awaited<ReturnType<typeof seedUser>>;

const TODAY = '2026-06-08';

describe('baton-relay RLS 境界', () => {
  let db: TestDb;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let teacherA1: User;
  let teacherA2: User;
  let adminA: User; // school_admin in A
  let teacherB: User;

  // tenantA のクラス/生徒/ノート
  let classA: { id: string };
  let studentX: { id: string };
  let noteByA1: { id: string };

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

    // teacherA1 がクラス・生徒・ノートを作る
    [classA] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .insert(classes)
        .values({ tenantId: tenantA.id, name: '2-A', goalText: 'あいさつ' })
        .returning({ id: classes.id }),
    );
    [studentX] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .insert(students)
        .values({ tenantId: tenantA.id, classId: classA.id, displayName: 'さくら' })
        .returning({ id: students.id }),
    );
    [noteByA1] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .insert(batonNotes)
        .values({
          tenantId: tenantA.id,
          studentId: studentX.id,
          authorUserId: teacherA1.id,
          noteDate: TODAY,
          content: '朝は元気そう',
        })
        .returning({ id: batonNotes.id }),
    );
  });

  // ── クロステナント遮断 ──────────────────────────────────────
  it('tenantB の teacher は tenantA のクラス/生徒/ノートを読めない', async () => {
    const [cls, studs, notes] = await Promise.all([
      withTenantContext(db, tenantB.id, teacherB.id, (tx) => tx.select().from(classes)),
      withTenantContext(db, tenantB.id, teacherB.id, (tx) => tx.select().from(students)),
      withTenantContext(db, tenantB.id, teacherB.id, (tx) => tx.select().from(batonNotes)),
    ]);
    expect(cls).toHaveLength(0);
    expect(studs).toHaveLength(0);
    expect(notes).toHaveLength(0);
  });

  it('複合 FK: 別テナントの class_id を参照する student の INSERT は DB レベルで失敗', async () => {
    await expect(
      rawQuery(
        `INSERT INTO students (tenant_id, class_id, display_name) VALUES ($1, $2, $3)`,
        [tenantB.id, classA.id, 'なりすまし'],
      ),
    ).rejects.toThrow();
  });

  // ── 相互関心層: teacher / school_admin 同等の全教員可視 ──────
  it('別の teacher も school_admin も、A1 が書いたノートを読める', async () => {
    const asA2 = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx.select().from(batonNotes).where(eq(batonNotes.id, noteByA1.id)),
    );
    const asAdmin = await withTenantContext(
      db,
      tenantA.id,
      adminA.id,
      (tx) => tx.select().from(batonNotes).where(eq(batonNotes.id, noteByA1.id)),
      'school_admin',
    );
    expect(asA2).toHaveLength(1);
    expect(asAdmin).toHaveLength(1);
    expect(asAdmin[0].content).toBe('朝は元気そう');
  });

  // ── 書込は本人の行のみ ──────────────────────────────────────
  it('他の teacher は A1 のノートを更新できない (0 行)', async () => {
    const updated = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx
        .update(batonNotes)
        .set({ content: '改ざん' })
        .where(eq(batonNotes.id, noteByA1.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it('school_admin も他人のノートは削除できない (0 行)', async () => {
    const deleted = await withTenantContext(
      db,
      tenantA.id,
      adminA.id,
      (tx) => tx.delete(batonNotes).where(eq(batonNotes.id, noteByA1.id)).returning(),
      'school_admin',
    );
    expect(deleted).toHaveLength(0);
  });

  // ── append-only ─────────────────────────────────────────────
  it('同じ著者・同じ生徒・同じ日に複数のノートを追加できる (append-only)', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.insert(batonNotes).values({
        tenantId: tenantA.id,
        studentId: studentX.id,
        authorUserId: teacherA1.id,
        noteDate: TODAY,
        content: '2 件目',
      }),
    );
    const rows = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .select()
        .from(batonNotes)
        .where(
          and(eq(batonNotes.studentId, studentX.id), eq(batonNotes.noteDate, TODAY)),
        ),
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  // ── reaction トグル一意 ─────────────────────────────────────
  it('同じ生徒・同じ教員・同じ種別のリアクション二重 INSERT は一意制約で弾かれる', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.insert(studentReactions).values({
        tenantId: tenantA.id,
        studentId: studentX.id,
        userId: teacherA1.id,
        reactionType: 'concern',
      }),
    );
    await expect(
      withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        tx.insert(studentReactions).values({
          tenantId: tenantA.id,
          studentId: studentX.id,
          userId: teacherA1.id,
          reactionType: 'concern',
        }),
      ),
    ).rejects.toThrow();
  });

  it('別の教員は同じ生徒に独立してリアクションを付けられる', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.insert(studentReactions).values({
        tenantId: tenantA.id,
        studentId: studentX.id,
        userId: teacherA1.id,
        reactionType: 'positive',
      }),
    );
    await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx.insert(studentReactions).values({
        tenantId: tenantA.id,
        studentId: studentX.id,
        userId: teacherA2.id,
        reactionType: 'positive',
      }),
    );
    const rows = await withTenantContext(
      db,
      tenantA.id,
      adminA.id,
      (tx) =>
        tx.select().from(studentReactions).where(eq(studentReactions.studentId, studentX.id)),
      'school_admin',
    );
    expect(rows).toHaveLength(2);
  });
});
