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
import { classes, students, batonNotes } from '@/db/schema';
import { studentRepo } from '@/features/baton-relay/lib/batonRelayRepository';

// TestDb と repo が期待する DrizzleDb は構造同一だが型名が違うため吸収する。
type RepoDb = Parameters<typeof studentRepo.delete>[0];

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

  // ── その日の印象 (0062: 印テーブルを廃止し baton_notes に統合) ─────
  it('サインだけの印象を残せる (コメント無し)', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.insert(batonNotes).values({
        tenantId: tenantA.id,
        studentId: studentX.id,
        authorUserId: teacherA1.id,
        noteDate: TODAY,
        sign: 'good',
      }),
    );
    const rows = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx.select().from(batonNotes).where(eq(batonNotes.sign, 'good')),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBeNull();
  });

  it('サインもコメントも無い行は CHECK で弾かれる', async () => {
    await expect(
      withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        tx.insert(batonNotes).values({
          tenantId: tenantA.id,
          studentId: studentX.id,
          authorUserId: teacherA1.id,
          noteDate: TODAY,
        }),
      ),
    ).rejects.toThrow();
  });

  it('同じ教員が同じ日に何度でも印象を残せる (append-only)', async () => {
    for (const sign of ['good', 'concern'] as const) {
      await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        tx.insert(batonNotes).values({
          tenantId: tenantA.id,
          studentId: studentX.id,
          authorUserId: teacherA1.id,
          noteDate: TODAY,
          sign,
        }),
      );
    }
    // beforeEach のコメント1件 + サイン2件
    const rows = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.select().from(batonNotes).where(eq(batonNotes.studentId, studentX.id)),
    );
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.sign !== null)).toHaveLength(2);
  });

  it('サインとコメントを同じ行に持てる (コメントに印象が紐づく)', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.insert(batonNotes).values({
        tenantId: tenantA.id,
        studentId: studentX.id,
        authorUserId: teacherA1.id,
        noteDate: TODAY,
        sign: 'concern',
        content: '休み時間ひとりでいた',
      }),
    );
    const [row] = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx.select().from(batonNotes).where(eq(batonNotes.sign, 'concern')),
    );
    expect(row.sign).toBe('concern');
    expect(row.content).toBe('休み時間ひとりでいた');
  });
  // ── 誤登録の取り消し (生徒の削除) ─────────────────────────
  it('生徒を削除すると、その子の印象・コメントも消える (cascade)', async () => {
    // 既に beforeEach でコメント1件が付いている
    const before = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.select().from(batonNotes).where(eq(batonNotes.studentId, studentX.id)),
    );
    expect(before.length).toBeGreaterThan(0);

    const n = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      studentRepo.delete(tx as unknown as RepoDb, { userId: teacherA2.id, tenantId: tenantA.id }, studentX.id),
    );
    expect(n).toBe(1);

    const after = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.select().from(batonNotes).where(eq(batonNotes.studentId, studentX.id)),
    );
    expect(after).toHaveLength(0);
  });

  it('他テナントの生徒は削除できない (0 件 → 呼び出し側で 404)', async () => {
    const n = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      studentRepo.delete(tx as unknown as RepoDb, { userId: teacherB.id, tenantId: tenantB.id }, studentX.id),
    );
    expect(n).toBe(0);
    // 元の生徒は残っている (自テナントの文脈で確認)
    const rows = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.select().from(students).where(eq(students.id, studentX.id)),
    );
    expect(rows).toHaveLength(1);
  });
  // ── 一括操作 ───────────────────────────────────────────
  it('一括削除は1トランザクション。他テナントの分は数えられない', async () => {
    const ctxA = { userId: teacherA1.id, tenantId: tenantA.id };
    // tenantB の生徒 ID を混ぜても、RLS で弾かれて A の分だけ消える
    const [classB] = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx
        .insert(classes)
        .values({ tenantId: tenantB.id, name: 'B組' })
        .returning({ id: classes.id }),
    );
    const [studentB] = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx
        .insert(students)
        .values({ tenantId: tenantB.id, classId: classB.id, displayName: 'B の子' })
        .returning({ id: students.id }),
    );
    const n = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      studentRepo.deleteMany(tx as unknown as RepoDb, ctxA, [studentX.id, studentB.id]),
    );
    expect(n).toBe(1);
    // B の生徒は残っている
    const remainB = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx.select().from(students).where(eq(students.id, studentB.id)),
    );
    expect(remainB).toHaveLength(1);
  });

  it('一括クラス移動ができる', async () => {
    const ctxA = { userId: teacherA1.id, tenantId: tenantA.id };
    const [classA2] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx
        .insert(classes)
        .values({ tenantId: tenantA.id, name: '2-B' })
        .returning({ id: classes.id }),
    );
    const n = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      studentRepo.updateMany(tx as unknown as RepoDb, ctxA, [studentX.id], {
        classId: classA2.id,
      }),
    );
    expect(n).toBe(1);
    const [moved] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.select().from(students).where(eq(students.id, studentX.id)),
    );
    expect(moved.classId).toBe(classA2.id);
  });
});
