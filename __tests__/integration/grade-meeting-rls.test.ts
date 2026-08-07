// 学年会 (grade-meeting) の RLS 境界統合テスト。
// 実 PostgreSQL で可視性・書込境界・無記名を検証する。
//
// 確定モデル (chimo 2026-08-07):
//   - 観察(observe)・状況判断(orient) は複数行。**1つに畳まない**のが設計の核。
//   - 次の一手(action) は 1回×1クラスで1行 (部分 UNIQUE インデックス)。
//   - 観察・判断の書換/削除は**本人のみ**。一手はテナント内なら誰でも (書記が交代できる)。
//   - Repository の返り値に author を含めない (無記名)。
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
import { classes, classMeetingNotes, gradeMeetings } from '@/db/schema';
import { gradeMeetingRepo } from '@/features/grade-meeting/lib/gradeMeetingRepository';

type RepoDb = Parameters<typeof gradeMeetingRepo.listNotes>[0];
type Tenant = Awaited<ReturnType<typeof seedTenant>>;
type User = Awaited<ReturnType<typeof seedUser>>;

const HELD_ON = '2026-08-20';

describe('grade-meeting (学年会) RLS 境界', () => {
  let db: TestDb;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let teacherA1: User;
  let teacherA2: User;
  let teacherB: User;
  let classA1: string; // tenantA / 1年
  let classA2: string; // tenantA / 1年
  let classA3: string; // tenantA / 学年なし
  let classB1: string; // tenantB / 1年

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
    teacherB = await seedUser(db, tenantB.id, 'teacher');

    const mkClass = async (
      tenantId: string,
      name: string,
      grade: number | null,
    ) => {
      const [row] = await rawQueryAsSuperuser<{ id: string }>(
        `INSERT INTO classes (tenant_id, name, grade) VALUES ($1, $2, $3) RETURNING id`,
        [tenantId, name, grade],
      );
      return row.id;
    };
    classA1 = await mkClass(tenantA.id, '1-A', 1);
    classA2 = await mkClass(tenantA.id, '1-B', 1);
    classA3 = await mkClass(tenantA.id, 'ひまわり', null);
    classB1 = await mkClass(tenantB.id, '1-A', 1);
  });

  const ctxA1 = () => ({ userId: teacherA1.id, tenantId: tenantA.id });
  const ctxA2 = () => ({ userId: teacherA2.id, tenantId: tenantA.id });
  const ctxB = () => ({ userId: teacherB.id, tenantId: tenantB.id });

  async function startMeetingA() {
    return withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.startMeeting(
        tx as unknown as RepoDb,
        { grade: 1, heldOn: HELD_ON },
        ctxA1(),
      ),
    );
  }

  // ── 1. 学年でクラスを引く ────────────────────────────────
  it('学年が設定されたクラスだけを、クラス名順で返す', async () => {
    const list = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.listClassesByGrade(tx as unknown as RepoDb, 1, ctxA1()),
    );
    expect(list.map((c) => c.name)).toEqual(['1-A', '1-B']);
    // 学年なしのクラスは学年会に出ない
    expect(list.some((c) => c.id === classA3)).toBe(false);
  });

  it('学年の選択肢は実データから引く (クラスに学年が付いた学年だけ)', async () => {
    const grades = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.listAvailableGrades(tx as unknown as RepoDb, ctxA1()),
    );
    // 1年 (1-A/1-B) のみ。学年なしの「ひまわり」は数に入らない
    expect(grades).toEqual([1]);
  });

  it('tenantB からは tenantA のクラスが見えない', async () => {
    const list = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      gradeMeetingRepo.listClassesByGrade(tx as unknown as RepoDb, 1, ctxB()),
    );
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(classB1);
  });

  // ── 2. 会は手で作る・二度押しで増えない ──────────────────
  it('同じ学年・同じ日に2回はじめても会は1つ', async () => {
    const first = await startMeetingA();
    const second = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      gradeMeetingRepo.startMeeting(
        tx as unknown as RepoDb,
        { grade: 1, heldOn: HELD_ON },
        ctxA2(),
      ),
    );
    expect(second.id).toBe(first.id);
    const rows = await rawQueryAsSuperuser<{ id: string }>(
      `SELECT id FROM grade_meetings`,
      [],
    );
    expect(rows).toHaveLength(1);
  });

  it('表示中の週に開かれた会だけを引く (週をさかのぼれる)', async () => {
    // 前の週の会と、今週の会
    const lastWeek = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.startMeeting(
        tx as unknown as RepoDb,
        { grade: 1, heldOn: '2026-08-12' },
        ctxA1(),
      ),
    );
    const thisWeek = await startMeetingA(); // 2026-08-20

    const inThisWeek = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.findMeetingInRange(
        tx as unknown as RepoDb,
        1,
        { from: '2026-08-17', to: '2026-08-23' },
        ctxA1(),
      ),
    );
    expect(inThisWeek?.id).toBe(thisWeek.id);

    const inLastWeek = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.findMeetingInRange(
        tx as unknown as RepoDb,
        1,
        { from: '2026-08-10', to: '2026-08-16' },
        ctxA1(),
      ),
    );
    expect(inLastWeek?.id).toBe(lastWeek.id);

    // 会の無い週は null
    const empty = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.findMeetingInRange(
        tx as unknown as RepoDb,
        1,
        { from: '2026-08-03', to: '2026-08-09' },
        ctxA1(),
      ),
    );
    expect(empty).toBeNull();
  });

  it('会をはじめていなければ null (自動では作らない)', async () => {
    const found = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.findLatestMeeting(tx as unknown as RepoDb, 1, ctxA1()),
    );
    expect(found).toBeNull();
  });

  // ── 3. 観察・判断は複数のまま積む (設計の核) ──────────────
  it('観察も状況判断も複数行そのまま積まれる (1つに畳まない)', async () => {
    const meeting = await startMeetingA();
    await withTenantContext(db, tenantA.id, teacherA1.id, async (tx) => {
      for (const content of ['教室に残る子が増えた', '片付けが早くなった']) {
        await gradeMeetingRepo.addNote(
          tx as unknown as RepoDb,
          { meetingId: meeting.id, classId: classA1, kind: 'observe', content },
          ctxA1(),
        );
      }
      await gradeMeetingRepo.addNote(
        tx as unknown as RepoDb,
        {
          meetingId: meeting.id,
          classId: classA1,
          kind: 'orient',
          content: '外に出づらい空気かも',
        },
        ctxA1(),
      );
    });
    // 別の先生が、同じクラスに違う見立てを足せる
    await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      gradeMeetingRepo.addNote(
        tx as unknown as RepoDb,
        {
          meetingId: meeting.id,
          classId: classA1,
          kind: 'orient',
          content: '逆に居心地がよくなったのかも',
        },
        ctxA2(),
      ),
    );

    const notes = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.listNotes(tx as unknown as RepoDb, meeting.id, ctxA1()),
    );
    expect(notes.filter((n) => n.kind === 'observe')).toHaveLength(2);
    expect(notes.filter((n) => n.kind === 'orient')).toHaveLength(2);
  });

  // ── 4. 無記名 ─────────────────────────────────────────────
  it('返り値に author を含めない (誰が出したかを外に出さない)', async () => {
    const meeting = await startMeetingA();
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.addNote(
        tx as unknown as RepoDb,
        {
          meetingId: meeting.id,
          classId: classA1,
          kind: 'observe',
          content: '事実',
        },
        ctxA1(),
      ),
    );
    const notes = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      gradeMeetingRepo.listNotes(tx as unknown as RepoDb, meeting.id, ctxA2()),
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).not.toHaveProperty('authorUserId');
    expect(Object.keys(notes[0]).sort()).toEqual(
      ['classId', 'content', 'createdAt', 'id', 'kind'].sort(),
    );
    // DB には残っている (自分の行を消す判定に使う)
    const raw = await rawQueryAsSuperuser<{ author_user_id: string }>(
      `SELECT author_user_id FROM class_meeting_notes`,
      [],
    );
    expect(raw[0].author_user_id).toBe(teacherA1.id);
  });

  // ── 5. 次の一手は 1回×1クラスで1行 ────────────────────────
  it('一手を2回置いても1行のまま上書きされる', async () => {
    const meeting = await startMeetingA();
    for (const content of ['席替えを試す', '席の決め方を子どもに任せる']) {
      await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        gradeMeetingRepo.upsertAction(
          tx as unknown as RepoDb,
          { meetingId: meeting.id, classId: classA1, content },
          ctxA1(),
        ),
      );
    }
    const rows = await rawQueryAsSuperuser<{ content: string }>(
      `SELECT content FROM class_meeting_notes WHERE kind = 'action'`,
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('席の決め方を子どもに任せる');
  });

  it('一手はクラスごとに別々に持てる', async () => {
    const meeting = await startMeetingA();
    for (const [classId, content] of [
      [classA1, 'A組の一手'],
      [classA2, 'B組の一手'],
    ] as const) {
      await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        gradeMeetingRepo.upsertAction(
          tx as unknown as RepoDb,
          { meetingId: meeting.id, classId, content },
          ctxA1(),
        ),
      );
    }
    const rows = await rawQueryAsSuperuser<{ content: string }>(
      `SELECT content FROM class_meeting_notes WHERE kind = 'action'`,
      [],
    );
    expect(rows).toHaveLength(2);
  });

  it('一手は別の先生でも上書きできる (書記が交代できる)', async () => {
    const meeting = await startMeetingA();
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.upsertAction(
        tx as unknown as RepoDb,
        { meetingId: meeting.id, classId: classA1, content: 'A1 が書いた' },
        ctxA1(),
      ),
    );
    await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      gradeMeetingRepo.upsertAction(
        tx as unknown as RepoDb,
        { meetingId: meeting.id, classId: classA1, content: 'A2 が書き直した' },
        ctxA2(),
      ),
    );
    const rows = await rawQueryAsSuperuser<{ content: string }>(
      `SELECT content FROM class_meeting_notes WHERE kind = 'action'`,
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('A2 が書き直した');
  });

  // ── 6. 削除の境界 ────────────────────────────────────────
  it('観察は本人だけが引っ込められる (他人は消せない)', async () => {
    const meeting = await startMeetingA();
    const note = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.addNote(
        tx as unknown as RepoDb,
        {
          meetingId: meeting.id,
          classId: classA1,
          kind: 'observe',
          content: 'A1 の事実',
        },
        ctxA1(),
      ),
    );
    // 他人は消せない (RLS の DELETE ポリシーで 0 行)
    const byOther = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      gradeMeetingRepo.deleteNote(tx as unknown as RepoDb, note.id, ctxA2()),
    );
    expect(byOther).toBe(0);
    // 本人は消せる
    const byOwner = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.deleteNote(tx as unknown as RepoDb, note.id, ctxA1()),
    );
    expect(byOwner).toBe(1);
  });

  it('一手は他の先生でも消せる (差し替えのため)', async () => {
    const meeting = await startMeetingA();
    const action = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.upsertAction(
        tx as unknown as RepoDb,
        { meetingId: meeting.id, classId: classA1, content: '一手' },
        ctxA1(),
      ),
    );
    const deleted = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      gradeMeetingRepo.deleteNote(tx as unknown as RepoDb, action.id, ctxA2()),
    );
    expect(deleted).toBe(1);
  });

  // ── 7. クロステナント ─────────────────────────────────────
  it('tenantB の teacher は tenantA の卓上を読めない', async () => {
    const meeting = await startMeetingA();
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.addNote(
        tx as unknown as RepoDb,
        {
          meetingId: meeting.id,
          classId: classA1,
          kind: 'observe',
          content: 'A の事実',
        },
        ctxA1(),
      ),
    );
    const asB = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      gradeMeetingRepo.listNotes(tx as unknown as RepoDb, meeting.id, ctxB()),
    );
    expect(asB).toHaveLength(0);
    const meetingsAsB = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx.select().from(gradeMeetings),
    );
    expect(meetingsAsB).toHaveLength(0);
  });

  it('別テナントのクラスを紐付けた行は複合 FK で失敗する', async () => {
    const meeting = await startMeetingA();
    await expect(
      rawQueryAsSuperuser(
        `INSERT INTO class_meeting_notes (tenant_id, meeting_id, class_id, kind, content)
         VALUES ($1, $2, $3, 'observe', 'クロステナント')`,
        [tenantA.id, meeting.id, classB1],
      ),
    ).rejects.toThrow();
  });

  // ── 8. 前回の一手 ────────────────────────────────────────
  it('前の会と、そこで決めた一手を引ける', async () => {
    const prev = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.startMeeting(
        tx as unknown as RepoDb,
        { grade: 1, heldOn: '2026-08-06' },
        ctxA1(),
      ),
    );
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.upsertAction(
        tx as unknown as RepoDb,
        { meetingId: prev.id, classId: classA1, content: '前回の一手' },
        ctxA1(),
      ),
    );
    const current = await startMeetingA();

    const found = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.findPreviousMeeting(
        tx as unknown as RepoDb,
        1,
        current.heldOn,
        ctxA1(),
      ),
    );
    expect(found?.id).toBe(prev.id);

    const actions = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.listActions(tx as unknown as RepoDb, prev.id, ctxA1()),
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].content).toBe('前回の一手');
  });

  // ── 9. 学年会は journal に乗らない (職員室ノートに流れない) ─
  it('学年会の卓上は journal_entries に行を作らない', async () => {
    const meeting = await startMeetingA();
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.addNote(
        tx as unknown as RepoDb,
        {
          meetingId: meeting.id,
          classId: classA1,
          kind: 'observe',
          content: '卓上の事実',
        },
        ctxA1(),
      ),
    );
    const entries = await rawQueryAsSuperuser<{ id: string }>(
      `SELECT id FROM journal_entries`,
      [],
    );
    expect(entries).toHaveLength(0);
  });

  // ── 10. 学年の「やること」= 既存 tasks に作る ──────────────
  describe('学年のやること', () => {
    async function seedCategory(tenantId: string) {
      const [row] = await rawQueryAsSuperuser<{ id: string }>(
        `INSERT INTO task_categories (tenant_id, name) VALUES ($1, $2) RETURNING id`,
        [tenantId, '学年・学級'],
      );
      return row.id;
    }

    it('やることは tasks に作られ、会に紐付く (TODO を二重に作らない)', async () => {
      const meeting = await startMeetingA();
      const categoryId = await seedCategory(tenantA.id);

      const created = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        gradeMeetingRepo.createTask(
          tx as unknown as RepoDb,
          {
            meetingId: meeting.id,
            categoryId,
            title: '運動会の役割分担',
            dueDate: '2026-08-25',
          },
          ctxA1(),
        ),
      );
      expect(created.title).toBe('運動会の役割分担');
      expect(created.dueDate).toBe('2026-08-25');
      // 既存 tasks に実体がある = タスクタブにも出る
      const taskRows = await rawQueryAsSuperuser<{ title: string; status: string }>(
        `SELECT title, status FROM tasks`,
        [],
      );
      expect(taskRows).toHaveLength(1);
      expect(taskRows[0].status).toBe('backlog');

      const listed = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
        gradeMeetingRepo.listTasks(tx as unknown as RepoDb, meeting.id, ctxA2()),
      );
      expect(listed).toHaveLength(1);
      expect(listed[0].taskId).toBe(created.taskId);
      // 担当は付けない (会議中に人を決めさせない・chimo 2026-08-07)。
      // 付けたくなったらタスクボードから付ける。
      expect(listed[0].assignees).toEqual([]);
      const assigneeRows = await rawQueryAsSuperuser(
        `SELECT user_id FROM task_assignees`,
        [],
      );
      expect(assigneeRows).toHaveLength(0);
    });

    it('会から外してもタスク本体は残る', async () => {
      const meeting = await startMeetingA();
      const categoryId = await seedCategory(tenantA.id);
      const created = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        gradeMeetingRepo.createTask(
          tx as unknown as RepoDb,
          {
            meetingId: meeting.id,
            categoryId,
            title: '学年通信を出す',
          },
          ctxA1(),
        ),
      );
      const n = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
        gradeMeetingRepo.unlinkTask(
          tx as unknown as RepoDb,
          created.taskId,
          meeting.id,
          ctxA2(),
        ),
      );
      expect(n).toBe(1);
      // 紐付けは消えるが、tasks は残る
      const links = await rawQueryAsSuperuser(`SELECT id FROM grade_meeting_tasks`, []);
      expect(links).toHaveLength(0);
      const taskRows = await rawQueryAsSuperuser(`SELECT id FROM tasks`, []);
      expect(taskRows).toHaveLength(1);
    });

    it('tenantB からは tenantA のやることが見えない', async () => {
      const meeting = await startMeetingA();
      const categoryId = await seedCategory(tenantA.id);
      await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        gradeMeetingRepo.createTask(
          tx as unknown as RepoDb,
          {
            meetingId: meeting.id,
            categoryId,
            title: 'A のやること',
          },
          ctxA1(),
        ),
      );
      const asB = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
        gradeMeetingRepo.listTasks(tx as unknown as RepoDb, meeting.id, ctxB()),
      );
      expect(asB).toHaveLength(0);
    });

    it('タスクを消すと紐付けも消える (複合 FK cascade)', async () => {
      const meeting = await startMeetingA();
      const categoryId = await seedCategory(tenantA.id);
      const created = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        gradeMeetingRepo.createTask(
          tx as unknown as RepoDb,
          {
            meetingId: meeting.id,
            categoryId,
            title: '消えるやること',
          },
          ctxA1(),
        ),
      );
      await rawQueryAsSuperuser(`DELETE FROM tasks WHERE id = $1`, [created.taskId]);
      const links = await rawQueryAsSuperuser(`SELECT id FROM grade_meeting_tasks`, []);
      expect(links).toHaveLength(0);
    });
  });

  // ── 11. クラス削除で卓上も消える ──────────────────────────
  it('クラスを消すと、そのクラスの卓上も消える (複合 FK cascade)', async () => {
    const meeting = await startMeetingA();
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      gradeMeetingRepo.addNote(
        tx as unknown as RepoDb,
        {
          meetingId: meeting.id,
          classId: classA1,
          kind: 'observe',
          content: '消える事実',
        },
        ctxA1(),
      ),
    );
    await rawQueryAsSuperuser(`DELETE FROM classes WHERE id = $1`, [classA1]);
    const rows = await rawQueryAsSuperuser<{ id: string }>(
      `SELECT id FROM class_meeting_notes`,
      [],
    );
    expect(rows).toHaveLength(0);
  });
});
