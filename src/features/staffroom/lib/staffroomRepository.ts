// H7-B 職員室ボード (staffroom) Repository
// board 投稿は journal_entries(kind='board', is_public=false) として持つ。
// RLS と二重防御で全クエリを tenant_id で絞る。メソッドは (tx, ctx, ...) を受ける。
import { and, or, eq, gte, lt, desc, asc, inArray, type SQL } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  journalEntries,
  batonNotes,
  students,
  classes,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type { JournalEntry } from '@/db/schema';
import type { StaffroomBoardKindInput, StaffroomBoxKindInput } from '../schemas/staffroom';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface StaffroomContext {
  userId: string;
  tenantId: string;
}

// 職員室ボードで「投稿・編集・削除」できる board ネイティブ kind (journal_entry_kind の直値)。
export const BOARD_KINDS = ['keep', 'concern', 'thanks', 'help'] as const;

// 職員室ボードに「集める」kind = board ネイティブ + note(公開メモ) + knowledge(復活した投稿区分)。
// 公開/私的は is_public が持つ (kind 再設計 2026-06-16)。私的 note は届かない。
// 公開 note は、なるほどが付けば「役に立つ情報」箱に集計される (旧 tweet/knowledge の役割)。
// knowledge は投稿区分として復活 (chimo 2026-06-30)。native knowledge も「役に立つ情報」箱に出す。
export const BOARD_VIEW_KINDS = [
  'keep',
  'concern',
  'thanks',
  'help',
  'note',
  'knowledge',
] as const;

// ── board (journal_entries kind IN BOARD_KINDS) ────────────────
export class BoardRepository {
  async findList(
    tx: DrizzleDb,
    ctx: StaffroomContext,
    filter: {
      boardKind?: StaffroomBoxKindInput;
      classId?: string;
      limit?: number;
      offset?: number;
      since?: Date; // created_at >= since
      until?: Date; // created_at < until (期間の翌日 0:00)
    },
  ): Promise<JournalEntry[]> {
    const conds: SQL[] = [
      eq(journalEntries.tenantId, ctx.tenantId),
      // 可視性: 「公開された投稿」+「自分の非公開 *board ネイティブ* 投稿」。
      // ⚠️ 私的 note (is_public=false) は倉庫専用 → 職員室ボードには出さない。
      //   そのため非公開で見せるのは board kind (keep/concern/thanks/help) に限定する
      //   (RLS と二重・school_admin が他人の非公開を覗かないよう app 層でも明示)。
      or(
        eq(journalEntries.isPublic, true),
        and(
          eq(journalEntries.userId, ctx.userId),
          inArray(journalEntries.kind, [...BOARD_KINDS]),
        ),
      )!,
    ];
    if (filter.boardKind) {
      conds.push(eq(journalEntries.kind, filter.boardKind));
    } else {
      conds.push(inArray(journalEntries.kind, [...BOARD_VIEW_KINDS]));
    }
    if (filter.classId) conds.push(eq(journalEntries.classId, filter.classId));
    // 投稿日 (created_at) の期間絞り込み (chimo 2026-06-14: 期間選択対応)。
    if (filter.since) conds.push(gte(journalEntries.createdAt, filter.since));
    if (filter.until) conds.push(lt(journalEntries.createdAt, filter.until));
    return tx
      .select()
      .from(journalEntries)
      .where(and(...conds))
      .orderBy(desc(journalEntries.createdAt))
      .limit(filter.limit ?? 50)
      .offset(filter.offset ?? 0);
  }

  async create(
    tx: DrizzleDb,
    ctx: StaffroomContext,
    params: {
      boardKind: StaffroomBoardKindInput;
      content: string;
      isPublic?: boolean;
      studentId?: string;
      classId?: string;
    },
  ): Promise<JournalEntry> {
    const [row] = await tx
      .insert(journalEntries)
      .values({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        kind: params.boardKind,
        // is_public は本人選択 (未指定は公開)
        isPublic: params.isPublic ?? true,
        content: params.content,
        studentId: params.studentId ?? null,
        classId: params.classId ?? null,
        // board は AI 入力対象外 (§7 ゲート) なので mood / content_masked は持たない
        mood: null,
      })
      .returning();
    return row;
  }
}

// ── 生徒サポート (A→B seam: 朝バトンをクラス(学年)別に集約) ──
// 印 (ポジティブ / 気になる) が付いた生徒を、クラスごとに 名前 + 印件数 + 今週の一言 で返す。
// 名前を出す = baton 画面と同じ可視範囲 (相互関心層)。数値化・ランキングはしない。
// 1行 = その日の印象 (サインだけ / コメントだけ / 両方)。
export interface SupportImpression {
  sign: 'good' | 'concern' | null;
  content: string | null;
}
export interface SupportStudent {
  studentId: string;
  displayName: string;
  goodCount: number;
  concernCount: number;
  /** その週の印象。サインとコメントが同じ行に載る。 */
  impressions: SupportImpression[];
}
export interface SupportClass {
  classId: string;
  className: string;
  schoolYear: string | null;
  students: SupportStudent[];
}

export class StudentSupportRepository {
  // since/until: その日の印象 (baton_notes) を created_at で期間に絞る基準時刻。
  // 期間内に印象が残された生徒だけを返す (= その週の活動)。
  // 0062 で「印」テーブルは廃止され、サインとコメントは同じ1行に載る。
  async get(
    tx: DrizzleDb,
    ctx: StaffroomContext,
    since: Date,
    until?: Date,
  ): Promise<{ classes: SupportClass[] }> {
    // その週の活動だけ出す (chimo 2026-06-16)。0062 以降はサインもコメントも
    // baton_notes の1行に載るので、1本のクエリで両方を取る。

    // 1. 期間内の印象 (サイン + 任意のコメント) を新しい順に
    const noteConds: SQL[] = [
      eq(batonNotes.tenantId, ctx.tenantId),
      gte(batonNotes.createdAt, since),
    ];
    if (until) noteConds.push(lt(batonNotes.createdAt, until));
    const noteRows = await tx
      .select({
        studentId: batonNotes.studentId,
        sign: batonNotes.sign,
        content: batonNotes.content,
      })
      .from(batonNotes)
      .where(and(...noteConds))
      .orderBy(desc(batonNotes.createdAt));

    // 2. 生徒ごとに サインの数 と 印象の行 を組み立てる。
    //    コメントは「どのサインの行に付いていたか」を保ったまま渡す
    //    (Good なのか気になるのかが分かってこそ材料になる)。
    const tally = new Map<string, { good: number; concern: number }>();
    const impressionsByStudent = new Map<string, SupportImpression[]>();
    for (const n of noteRows) {
      if (n.sign) {
        const t = tally.get(n.studentId) ?? { good: 0, concern: 0 };
        if (n.sign === 'good') t.good += 1;
        else t.concern += 1;
        tally.set(n.studentId, t);
      }
      const arr = impressionsByStudent.get(n.studentId) ?? [];
      arr.push({ sign: n.sign, content: n.content });
      impressionsByStudent.set(n.studentId, arr);
    }

    // 3. 期間内に印象が残された生徒の集合
    const studentIds = [...impressionsByStudent.keys()];
    if (studentIds.length === 0) return { classes: [] };

    // 4. 該当生徒 (クラス・名前)
    const studentRows = await tx
      .select({
        id: students.id,
        classId: students.classId,
        displayName: students.displayName,
        createdAt: students.createdAt,
      })
      .from(students)
      .where(and(eq(students.tenantId, ctx.tenantId), inArray(students.id, studentIds)))
      .orderBy(asc(students.createdAt));

    // 5. クラス情報
    const classRows = await tx
      .select({ id: classes.id, name: classes.name, schoolYear: classes.schoolYear })
      .from(classes)
      .where(eq(classes.tenantId, ctx.tenantId))
      .orderBy(asc(classes.name));

    // 6. クラス → 生徒 で組み立て (期間内に活動があった生徒がいるクラスだけ)
    const studentsByClass = new Map<string, SupportStudent[]>();
    for (const s of studentRows) {
      const t = tally.get(s.id) ?? { good: 0, concern: 0 };
      const arr = studentsByClass.get(s.classId) ?? [];
      arr.push({
        studentId: s.id,
        displayName: s.displayName,
        goodCount: t.good,
        concernCount: t.concern,
        impressions: impressionsByStudent.get(s.id) ?? [],
      });
      studentsByClass.set(s.classId, arr);
    }

    const result: SupportClass[] = [];
    for (const c of classRows) {
      const list = studentsByClass.get(c.id);
      if (!list || list.length === 0) continue;
      result.push({
        classId: c.id,
        className: c.name,
        schoolYear: c.schoolYear,
        students: list,
      });
    }
    return { classes: result };
  }
}

export const boardRepo = new BoardRepository();
export const studentSupportRepo = new StudentSupportRepository();
