// H7-B 職員室ボード (staffroom) Repository
// board 投稿は journal_entries(kind='board', is_public=false) として持つ。
// RLS と二重防御で全クエリを tenant_id で絞る。メソッドは (tx, ctx, ...) を受ける。
import { and, or, eq, gte, lt, desc, asc, inArray, type SQL } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import {
  journalEntries,
  studentReactions,
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

// 職員室ボードに「表示」する kind = board ネイティブ 4 種 + knowledge + tweet。
// diary は個人面 (マイノート) のみ。tweet は「今週のつぶやき」箱として今週分のみ表示
// (chimo 2026-06-11)。knowledge は明示ナレッジ + (S6 で) なるほど付き tweet を集約表示。
export const BOARD_VIEW_KINDS = [
  'keep',
  'concern',
  'thanks',
  'help',
  'knowledge',
  'tweet',
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
      // フィードは「公開 board + 自分の非公開 board」に絞る (RLS と二重・school_admin が
      // 他人の非公開を覗かないよう app 層で明示)。
      or(eq(journalEntries.isPublic, true), eq(journalEntries.userId, ctx.userId))!,
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
export interface SupportStudent {
  studentId: string;
  displayName: string;
  positiveCount: number;
  concernCount: number;
  notes: string[];
}
export interface SupportClass {
  classId: string;
  className: string;
  schoolYear: string | null;
  students: SupportStudent[];
}

export class StudentSupportRepository {
  // since/until: 印 (student_reactions) も一言 (baton_notes) も created_at で期間に絞る基準時刻。
  // 期間内に印 or 一言があった生徒だけを返す (= その週の活動)。
  async get(
    tx: DrizzleDb,
    ctx: StaffroomContext,
    since: Date,
    until?: Date,
  ): Promise<{ classes: SupportClass[] }> {
    // その週の活動だけ出す (chimo 2026-06-16): 印・一言ともに created_at で期間に絞り、
    // 期間内に「印が付いた or 一言が書かれた」生徒だけを対象にする。

    // 1. 印 (positive/concern) を期間内 created_at で生徒ごとに集計
    const reactionConds: SQL[] = [
      eq(studentReactions.tenantId, ctx.tenantId),
      gte(studentReactions.createdAt, since),
    ];
    if (until) reactionConds.push(lt(studentReactions.createdAt, until));
    const reactionRows = await tx
      .select({
        studentId: studentReactions.studentId,
        type: studentReactions.reactionType,
      })
      .from(studentReactions)
      .where(and(...reactionConds));

    const tally = new Map<string, { positive: number; concern: number }>();
    for (const r of reactionRows) {
      const t = tally.get(r.studentId) ?? { positive: 0, concern: 0 };
      if (r.type === 'positive') t.positive += 1;
      else t.concern += 1;
      tally.set(r.studentId, t);
    }

    // 2. 期間内の一言 (created_at >= since, < until) を生徒ごとに
    const noteConds: SQL[] = [
      eq(batonNotes.tenantId, ctx.tenantId),
      gte(batonNotes.createdAt, since),
    ];
    if (until) noteConds.push(lt(batonNotes.createdAt, until));
    const noteRows = await tx
      .select({ studentId: batonNotes.studentId, content: batonNotes.content })
      .from(batonNotes)
      .where(and(...noteConds))
      .orderBy(desc(batonNotes.createdAt));
    const notesByStudent = new Map<string, string[]>();
    for (const n of noteRows) {
      const arr = notesByStudent.get(n.studentId) ?? [];
      arr.push(n.content);
      notesByStudent.set(n.studentId, arr);
    }

    // 3. 期間内に印 or 一言があった生徒の集合
    const studentIds = [...new Set([...tally.keys(), ...notesByStudent.keys()])];
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
      const t = tally.get(s.id) ?? { positive: 0, concern: 0 };
      const arr = studentsByClass.get(s.classId) ?? [];
      arr.push({
        studentId: s.id,
        displayName: s.displayName,
        positiveCount: t.positive,
        concernCount: t.concern,
        notes: notesByStudent.get(s.id) ?? [],
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
