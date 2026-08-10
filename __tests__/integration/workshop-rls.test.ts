// 研修 (workshop) チェックインの RLS 境界統合テスト
// 実 PostgreSQL で RLS・upsert・可視性を検証する。
//
// 確定モデル (chimo 2026-07-29):
//   - チェックインは workshop_checkins。journal に一切乗らない別テーブル
//     → 職員室/公開タイムライン/AI に構造的に漏れない (踏み絵 B案)。
//   - 箱の中で「参加者 = テナント内の先生全員」に見える (tenant-read RLS)。
//   - 書込は本人のみ (user_id = app_user_id())。1人1回答・上書き (UNIQUE workshop_id×user_id)。
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  startTestDb,
  stopTestDb,
  truncateAll,
  withTenantContext,
  rawQueryAsSuperuser,
  type TestDb,
} from './helpers/testDb';
import { seedTenant, seedUser } from './helpers/seed';
import { workshopCheckins, journalEntries } from '@/db/schema';
import { workshopRepo } from '@/features/workshop/lib/workshopRepository';
import { WORKSHOP } from '@/features/workshop/constants';

// テスト DB (TestDb) と repo が期待する DrizzleDb は構造同一だが型名が違うため吸収する。
type RepoDb = Parameters<typeof workshopRepo.listCheckins>[0];

type Tenant = Awaited<ReturnType<typeof seedTenant>>;
type User = Awaited<ReturnType<typeof seedUser>>;

describe('workshop (研修チェックイン) RLS 境界', () => {
  let db: TestDb;
  let tenantA: Tenant;
  let tenantB: Tenant;
  let teacherA1: User;
  let teacherA2: User;
  let adminA: User; // school_admin in A
  let teacherB: User;

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
  });

  // ── 1. クロステナント遮断 ───────────────────────────────────
  it('tenantB の teacher は tenantA のチェックインを読めない', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      workshopRepo.upsertCheckin(
        tx as unknown as RepoDb,
        { workshopId: WORKSHOP.id, answer: '心理的安全性があるチーム' },
        { userId: teacherA1.id, tenantId: tenantA.id },
      ),
    );
    const asB = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx.select().from(workshopCheckins),
    );
    expect(asB).toHaveLength(0);
  });

  // ── 2. 箱の中で参加者 (teacher / school_admin) に見える ──────
  it('チェックインは同テナントの別 teacher も school_admin も読める', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      workshopRepo.upsertCheckin(
        tx as unknown as RepoDb,
        { workshopId: WORKSHOP.id, answer: '声をかけ合えるチーム' },
        { userId: teacherA1.id, tenantId: tenantA.id },
      ),
    );
    const asA2 = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      workshopRepo.listCheckins(tx as unknown as RepoDb, WORKSHOP.id, {
        userId: teacherA2.id,
        tenantId: tenantA.id,
      }),
    );
    const asAdmin = await withTenantContext(
      db,
      tenantA.id,
      adminA.id,
      (tx) =>
        workshopRepo.listCheckins(tx as unknown as RepoDb, WORKSHOP.id, {
          userId: adminA.id,
          tenantId: tenantA.id,
        }),
      'school_admin',
    );
    expect(asA2).toHaveLength(1);
    expect(asA2[0].answer).toBe('声をかけ合えるチーム');
    expect(asAdmin).toHaveLength(1);
  });

  // ── 3. upsert: 1人1回答・上書き ─────────────────────────────
  it('同じユーザーが再投稿すると 1 行のまま answer が上書きされる', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      workshopRepo.upsertCheckin(
        tx as unknown as RepoDb,
        { workshopId: WORKSHOP.id, answer: '最初の回答' },
        { userId: teacherA1.id, tenantId: tenantA.id },
      ),
    );
    const updated = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      workshopRepo.upsertCheckin(
        tx as unknown as RepoDb,
        { workshopId: WORKSHOP.id, answer: '書き直した回答' },
        { userId: teacherA1.id, tenantId: tenantA.id },
      ),
    );
    const all = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      tx.select().from(workshopCheckins),
    );
    expect(all).toHaveLength(1);
    expect(all[0].answer).toBe('書き直した回答');
    expect(updated.answer).toBe('書き直した回答');
  });

  // ── 4. 書込は本人のみ ───────────────────────────────────────
  it('他の teacher は A1 のチェックインを更新できない (0 行)', async () => {
    const [row] = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      workshopRepo
        .upsertCheckin(
          tx as unknown as RepoDb,
          { workshopId: WORKSHOP.id, answer: 'A1 の回答' },
          { userId: teacherA1.id, tenantId: tenantA.id },
        )
        .then((r) => [r]),
    );
    const byOther = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx
        .update(workshopCheckins)
        .set({ answer: '改ざん' })
        .where(
          and(
            eq(workshopCheckins.id, row.id),
            eq(workshopCheckins.tenantId, tenantA.id),
          ),
        )
        .returning(),
    );
    expect(byOther).toHaveLength(0);
  });

  // ── 5. 踏み絵 B案: チェックインは journal に一切乗らない ──────
  it('チェックイン投稿では journal_entries に行が作られない (職員室に漏れない)', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      workshopRepo.upsertCheckin(
        tx as unknown as RepoDb,
        { workshopId: WORKSHOP.id, answer: '秘密にしたいチーム観' },
        { userId: teacherA1.id, tenantId: tenantA.id },
      ),
    );
    // superuser で全 journal_entries を見ても、チェックインは実体化していない
    const entries = await rawQueryAsSuperuser<{ id: string }>(
      `SELECT id FROM journal_entries`,
      [],
    );
    expect(entries).toHaveLength(0);
  });

  // ── 6. 振り返り: 公開 note として職員室に流れる ──────────────
  it('振り返り投稿は公開 note を作り、同僚 (別 teacher) からも見える', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      workshopRepo.createReflection(
        tx as unknown as RepoDb,
        { workshopId: WORKSHOP.id, content: '当日の学びを持ち帰った' },
        { userId: teacherA1.id, tenantId: tenantA.id },
      ),
    );
    // 別 teacher が公開ノートとして見える (journal_entry_public_read)
    const asA2 = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.isPublic, true)),
    );
    expect(asA2).toHaveLength(1);
    expect(asA2[0].content).toBe('当日の学びを持ち帰った');
    expect(asA2[0].kind).toBe('note');
    // 箱の中の振り返り一覧にも出る
    const reflections = await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
      workshopRepo.listReflections(tx as unknown as RepoDb, WORKSHOP.id, {
        userId: teacherA2.id,
        tenantId: tenantA.id,
      }),
    );
    expect(reflections).toHaveLength(1);
    expect(reflections[0].content).toBe('当日の学びを持ち帰った');
  });

  it('tenantB の teacher は tenantA の振り返りを読めない', async () => {
    await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
      workshopRepo.createReflection(
        tx as unknown as RepoDb,
        { workshopId: WORKSHOP.id, content: 'A の振り返り' },
        { userId: teacherA1.id, tenantId: tenantA.id },
      ),
    );
    const asB = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      workshopRepo.listReflections(tx as unknown as RepoDb, WORKSHOP.id, {
        userId: teacherB.id,
        tenantId: tenantB.id,
      }),
    );
    expect(asB).toHaveLength(0);
  });

  // ── 7. 複合 FK: 別テナントの journal_entry_id は紐付けられない ──
  it('別テナントの journal_entry を紐付けた workshop_reflections は複合 FK で失敗', async () => {
    // tenantB で公開 note を作る
    const [entryB] = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
      tx
        .insert(journalEntries)
        .values({
          tenantId: tenantB.id,
          userId: teacherB.id,
          content: 'B のノート',
          isPublic: true,
          kind: 'note',
        })
        .returning({ id: journalEntries.id }),
    );
    // tenantA のテナントで B の entry を紐付け → 複合 FK (entry_id, tenant_id) で失敗
    await expect(
      rawQueryAsSuperuser(
        `INSERT INTO workshop_reflections (tenant_id, workshop_id, journal_entry_id)
         VALUES ($1, $2, $3)`,
        [tenantA.id, WORKSHOP.id, entryB.id],
      ),
    ).rejects.toThrow();
  });

  // ── 8. チーム振り返り (紙の「振り返り・発表シート」の画面化) ─────
  //   - 1班1枚 (UNIQUE tenant_id×workshop_id×team_key)
  //   - 書込は「本人のみ」ではなく「テナント内なら誰でも」= checkins との意図的な差
  //   - 箱の中に閉じる (journal に乗らない → 職員室に流れない)
  describe('チーム振り返り', () => {
    const answers = (over: Partial<Record<string, string>> = {}) => ({
      respect: 'ちがう見方が出たとき、両方を残して作り分けた',
      autonomy: '経験に関わらず、気づいた人が手を動かした',
      next: '学年会で、まず全員が一言ずつ',
      ...over,
    });

    it('tenantB の teacher は tenantA のチーム振り返りを読めない', async () => {
      await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        workshopRepo.upsertTeamReflection(
          tx as unknown as RepoDb,
          { workshopId: WORKSHOP.id, teamKey: '1', ...answers() },
          { userId: teacherA1.id, tenantId: tenantA.id },
        ),
      );
      const asB = await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
        workshopRepo.listTeamReflections(tx as unknown as RepoDb, WORKSHOP.id, {
          userId: teacherB.id,
          tenantId: tenantB.id,
        }),
      );
      expect(asB).toHaveLength(0);
    });

    it('同テナントの別 teacher が同じ班の1枚を上書きできる (共同編集)', async () => {
      await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        workshopRepo.upsertTeamReflection(
          tx as unknown as RepoDb,
          { workshopId: WORKSHOP.id, teamKey: '2', ...answers() },
          { userId: teacherA1.id, tenantId: tenantA.id },
        ),
      );
      // 入力係が交代しても同じ1枚を更新できる (checkins は本人しか更新できない)
      await withTenantContext(db, tenantA.id, teacherA2.id, (tx) =>
        workshopRepo.upsertTeamReflection(
          tx as unknown as RepoDb,
          {
            workshopId: WORKSHOP.id,
            teamKey: '2',
            ...answers({ autonomy: '気づいた人が動いた' }),
          },
          { userId: teacherA2.id, tenantId: tenantA.id },
        ),
      );
      const rows = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        workshopRepo.listTeamReflections(tx as unknown as RepoDb, WORKSHOP.id, {
          userId: teacherA1.id,
          tenantId: tenantA.id,
        }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].autonomy).toBe('気づいた人が動いた');
      // 書いた人は updated_by に残るが、View には出さない (入力係を可視化しない)
      expect(rows[0]).not.toHaveProperty('updatedBy');
      const raw = await rawQueryAsSuperuser<{ updated_by: string }>(
        `SELECT updated_by FROM workshop_team_reflections WHERE team_key = '2'`,
        [],
      );
      expect(raw[0].updated_by).toBe(teacherA2.id);
    });

    it('同じ班に2回書いても1行のまま (1班1枚)', async () => {
      for (const motto of ['一周目', '三周目']) {
        await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
          workshopRepo.upsertTeamReflection(
            tx as unknown as RepoDb,
            {
              workshopId: WORKSHOP.id,
              teamKey: '3',
              ...answers({ motto }),
            },
            { userId: teacherA1.id, tenantId: tenantA.id },
          ),
        );
      }
      const rows = await rawQueryAsSuperuser<{ id: string }>(
        `SELECT id FROM workshop_team_reflections WHERE team_key = '3'`,
        [],
      );
      expect(rows).toHaveLength(1);
    });

    it('チーム振り返りでは journal_entries に行が作られない (職員室に漏れない)', async () => {
      await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        workshopRepo.upsertTeamReflection(
          tx as unknown as RepoDb,
          { workshopId: WORKSHOP.id, teamKey: '1', ...answers() },
          { userId: teacherA1.id, tenantId: tenantA.id },
        ),
      );
      const entries = await rawQueryAsSuperuser<{ id: string }>(
        `SELECT id FROM journal_entries`,
        [],
      );
      expect(entries).toHaveLength(0);
    });

    it('別テナントが同じ班キーを使っても衝突しない (UNIQUE に tenant_id が入っている)', async () => {
      await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        workshopRepo.upsertTeamReflection(
          tx as unknown as RepoDb,
          { workshopId: WORKSHOP.id, teamKey: '1', ...answers({ autonomy: 'A の自律' }) },
          { userId: teacherA1.id, tenantId: tenantA.id },
        ),
      );
      await withTenantContext(db, tenantB.id, teacherB.id, (tx) =>
        workshopRepo.upsertTeamReflection(
          tx as unknown as RepoDb,
          { workshopId: WORKSHOP.id, teamKey: '1', ...answers({ autonomy: 'B の自律' }) },
          { userId: teacherB.id, tenantId: tenantB.id },
        ),
      );
      const rowsA = await withTenantContext(db, tenantA.id, teacherA1.id, (tx) =>
        workshopRepo.listTeamReflections(tx as unknown as RepoDb, WORKSHOP.id, {
          userId: teacherA1.id,
          tenantId: tenantA.id,
        }),
      );
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0].autonomy).toBe('A の自律');
    });
  });
});
