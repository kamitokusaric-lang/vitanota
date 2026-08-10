import { useEffect, useMemo, useRef, useState } from 'react';
import { Users, Archive, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { useToast } from '@/shared/components/Toast';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import {
  useClasses,
  useStudents,
  useArchivedStudents,
  useNotes,
  useTeacherNames,
} from '../hooks/useBatonRelay';
import type { ImpressionSign } from '../types';
import { ClassGoalHeader } from './ClassGoalHeader';
import { StudentBulkBar } from './StudentBulkBar';
import { StudentRow } from './StudentRow';
import { RosterAdd } from './RosterAdd';
import { RosterStudentBulkAdd } from './RosterStudentBulkAdd';

interface BatonRelayBoardProps {
  currentUserId: string;
  todayDate: string; // YYYY-MM-DD (SSR で確定・hydration mismatch 回避)
  // 親 (生徒ノートのクラスタブ等) がクラスを制御する場合に渡す。
  // 指定時は内部のクラス選択 <select> を出さない (chimo 2026-06-14)。
  classId?: string;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// YYYY-MM-DD に n 日加算 (構成要素から組むので TZ ずれなし)。
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// YYYY-MM-DD → 「6月16日 (月)」表示用。
function formatJaDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  return `${m}月${d}日 (${w})`;
}

export function BatonRelayBoard({ currentUserId, todayDate, classId }: BatonRelayBoardProps) {
  const { showToast } = useToast();
  // classId 指定時は親が制御 (controlled)。未指定時は内部 state で選択 (/baton-relay ページ)。
  const [internalClassId, setInternalClassId] = useState<string | null>(null);
  const selectedClassId = classId ?? internalClassId;
  // 日付はクラスごとに保持する (タブを使い回す dashboard で日付が混ざらないように)。
  // 未設定のクラスは todayDate にフォールバック = タブを開いた初回は今日。
  const [dateByClass, setDateByClass] = useState<Record<string, string>>({});
  const date = (selectedClassId ? dateByClass[selectedClassId] : undefined) ?? todayDate;
  const setDate = (next: string) => {
    if (!selectedClassId) return;
    setDateByClass((m) => ({ ...m, [selectedClassId]: next }));
  };
  const [showArchived, setShowArchived] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // 「日付選択」からネイティブのカレンダーピッカーを開く (非対応環境は focus にフォールバック)。
  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.focus();
  };

  const { classes, isLoading: classesLoading, error: classesError, mutate: mutateClasses } =
    useClasses();
  const { students, mutate: mutateStudents } = useStudents(selectedClassId);
  const { archived, mutate: mutateArchived } = useArchivedStudents(
    selectedClassId,
    showArchived,
  );
  const { notes, mutate: mutateNotes } = useNotes(selectedClassId, date);
  const nameById = useTeacherNames();

  // クラスが読めたら先頭を選択 (uncontrolled・未選択時のみ)
  useEffect(() => {
    if (!classId && !internalClassId && classes.length > 0) {
      setInternalClassId(classes[0].id);
    }
  }, [classId, internalClassId, classes]);

  const selectedClass = classes.find((c) => c.id === selectedClassId) ?? null;

  // 生徒ごとに notes / reactions をまとめる
  const notesByStudent = useMemo(() => {
    const map = new Map<string, typeof notes>();
    for (const n of notes) {
      const arr = map.get(n.studentId) ?? [];
      arr.push(n);
      map.set(n.studentId, arr);
    }
    return map;
  }, [notes]);


  // 生徒の並びはクラスタブと同じ氏名の自然昇順 (「10」が「2」の後)。
  // 印の数では並べ替えない (踏み絵: 数値で採点しない)。
  const sortedStudents = useMemo(
    () =>
      [...students].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'ja', { numeric: true }),
      ),
    [students],
  );
  const sortedArchived = useMemo(
    () =>
      [...archived].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'ja', { numeric: true }),
      ),
    [archived],
  );

  // ── handlers ──
  const handleCreateClass = async (
    name: string,
    goalText: string,
    grade?: number,
  ) => {
    const res = await postJson('/api/baton-relay/classes', {
      name,
      goalText: goalText || undefined,
      grade,
    });
    if (!res.ok) {
      showToast('クラスの作成に失敗しました', 'error');
      return;
    }
    const { class: created } = (await res.json()) as { class: { id: string } };
    await mutateClasses();
    if (!classId) setInternalClassId(created.id);
    showToast('クラスを作りました', 'success');
  };

  const handleMoveStudent = async (studentId: string, newClassId: string) => {
    const res = await fetch(`/api/baton-relay/students/${studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: newClassId }),
    });
    if (!res.ok) {
      showToast('クラスの変更に失敗しました', 'error');
      return;
    }
    await mutateStudents(); // 移動元の一覧から消える
    showToast('クラスを変更しました', 'success');
  };

  const handleRenameStudent = async (studentId: string, displayName: string) => {
    const res = await fetch(`/api/baton-relay/students/${studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    });
    if (!res.ok) {
      showToast('名前の変更に失敗しました', 'error');
      return;
    }
    await mutateStudents();
    showToast('名前を変えました', 'success');
  };

  const handleArchiveStudent = async (studentId: string) => {
    const res = await fetch(`/api/baton-relay/students/${studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    });
    if (!res.ok) {
      showToast('アーカイブに失敗しました', 'error');
      return;
    }
    await Promise.all([mutateStudents(), mutateArchived()]);
    showToast('アーカイブしました', 'success');
  };

  // ── 一括操作 ──────────────────────────────────────────────
  // 選択はクラス/日付を切り替えたら解除する (別クラスの選択が残ると事故る)。
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedClassId]);

  const toggleSelect = (studentId: string) =>
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  // 削除確認で見せる「消える印象・コメント」の合計。
  const selectedNoteTotal = students
    .filter((s) => selectedIds.has(s.id))
    .reduce((a, s) => a + s.noteCount, 0);

  // 「すべて選択」の状態。対象は表示中のクラスの生徒だけ。
  const allSelected =
    sortedStudents.length > 0 &&
    sortedStudents.every((s) => selectedIds.has(s.id));
  const someSelected = sortedStudents.some((s) => selectedIds.has(s.id));

  const runBulk = async (
    body: Record<string, unknown>,
    okMessage: string,
    ngMessage: string,
  ) => {
    setBulkBusy(true);
    try {
      const res = await postJson('/api/baton-relay/students/bulk', {
        studentIds: [...selectedIds],
        ...body,
      });
      if (!res.ok) {
        showToast(ngMessage, 'error');
        return;
      }
      setSelectedIds(new Set());
      await Promise.all([mutateStudents(), mutateArchived(), mutateNotes()]);
      showToast(okMessage, 'success');
    } finally {
      setBulkBusy(false);
    }
  };

  // 誤登録の取り消し。cascade でその子の印象・コメントも消える
  // (確認は StudentRow 側で件数を見せてから)。
  const handleDeleteStudent = async (studentId: string) => {
    const res = await fetch(`/api/baton-relay/students/${studentId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      showToast('削除に失敗しました', 'error');
      return;
    }
    await Promise.all([mutateStudents(), mutateArchived(), mutateNotes()]);
    showToast('削除しました', 'success');
  };

  const handleRestoreStudent = async (studentId: string) => {
    const res = await fetch(`/api/baton-relay/students/${studentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    if (!res.ok) {
      showToast('復元に失敗しました', 'error');
      return;
    }
    await Promise.all([mutateStudents(), mutateArchived()]);
    showToast('復元しました', 'success');
  };

  const handleSaveGoal = async (goalText: string) => {
    if (!selectedClassId) return;
    const res = await fetch(`/api/baton-relay/classes/${selectedClassId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalText: goalText || null }),
    });
    if (!res.ok) {
      showToast('目標の保存に失敗しました', 'error');
      return;
    }
    await mutateClasses();
  };

  // 学年の設定。学年会 (grade-meeting) がクラスをまとめる軸なので、
  // ここで付けると「会議で話す」の学年会にこのクラスが出てくる。
  const handleSaveGrade = async (grade: number | null) => {
    if (!selectedClassId) return;
    const res = await fetch(`/api/baton-relay/classes/${selectedClassId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grade }),
    });
    if (!res.ok) {
      showToast('学年の保存に失敗しました', 'error');
      return;
    }
    await mutateClasses();
    showToast(grade ? `${grade}年に設定しました` : '学年なしに戻しました', 'success');
  };

  // 「今日の印象」をサインだけで残す (気軽に押せる導線)。
  // append-only なので、押すたびに その日の印象が1行積まれる。
  const handleQuickSign = async (studentId: string, sign: ImpressionSign) => {
    const res = await postJson('/api/baton-relay/notes', {
      studentId,
      noteDate: date,
      sign,
    });
    if (!res.ok) {
      showToast('印象の保存に失敗しました', 'error');
      return;
    }
    await mutateNotes();
  };

  const handleAddNote = async (
    studentId: string,
    content: string,
    sign?: ImpressionSign,
  ) => {
    const res = await postJson('/api/baton-relay/notes', {
      studentId,
      noteDate: date,
      sign,
      content,
    });
    if (!res.ok) {
      showToast('ひとことの保存に失敗しました', 'error');
      return;
    }
    await mutateNotes();
  };

  const handleEditNote = async (id: string, content: string) => {
    const res = await fetch(`/api/baton-relay/notes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      showToast('編集に失敗しました', 'error');
      return;
    }
    await mutateNotes();
  };

  const handleDeleteNote = async (id: string) => {
    const res = await fetch(`/api/baton-relay/notes/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      showToast('削除に失敗しました', 'error');
      return;
    }
    await mutateNotes();
  };

  if (classesLoading) {
    return <LoadingSpinner label="読み込み中" />;
  }
  if (classesError) {
    return <ErrorMessage message="データの取得に失敗しました" />;
  }

  return (
    <div className="space-y-4">
      {/* クラス目標ヘッダ (クラス単位・日付非依存なので日付ナビより上) */}
      {selectedClass && (
        <ClassGoalHeader
          cls={selectedClass}
          onSaveGoal={handleSaveGoal}
          onSaveGrade={handleSaveGrade}
        />
      )}

      {/* クラス切替 (uncontrolled のみ) + 日付ナビ (前日 / 今日 / 次の日 + カレンダー) */}
      {classes.length > 0 && (
        <div className="space-y-2">
          {!classId && (
            <div className="flex">
              <label className="sr-only" htmlFor="baton-class">
                クラス
              </label>
              <select
                id="baton-class"
                value={selectedClassId ?? ''}
                onChange={(e) => setInternalClassId(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-base focus:border-vn-accent focus:outline-none"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* design (chimo 2026-06-25): 前日 日付 翌日 ┃ 今日 日付選択 を横 1 行に集約 */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setDate(addDays(date, -1))}
              className="inline-flex items-center gap-0.5 text-sm text-gray-400 transition-colors hover:text-gray-600"
              data-testid="baton-date-prev"
            >
              <ChevronLeft size={16} aria-hidden />
              前日
            </button>
            <span className="text-sm font-bold text-slate-700" data-testid="baton-date-label">
              {formatJaDate(date)}
            </span>
            <button
              type="button"
              onClick={() => setDate(addDays(date, 1))}
              disabled={date === todayDate}
              className={`inline-flex items-center gap-0.5 text-sm text-gray-400 transition-colors hover:text-gray-600 ${
                date === todayDate ? 'invisible' : ''
              }`}
              data-testid="baton-date-next"
            >
              翌日
              <ChevronRight size={16} aria-hidden />
            </button>
            <span className="px-1 text-vn-border-strong" aria-hidden>
              |
            </span>
            <button
              type="button"
              onClick={() => setDate(todayDate)}
              disabled={date === todayDate}
              className={`rounded-md border border-vn-border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors ${
                date === todayDate ? '' : 'hover:bg-gray-50'
              }`}
              data-testid="baton-date-today"
            >
              今日
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={openDatePicker}
                className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 underline-offset-2 hover:underline"
                data-testid="baton-date-pick"
              >
                <Calendar size={16} aria-hidden />
                日付選択
              </button>
              <label className="sr-only" htmlFor="baton-date">
                日付
              </label>
              <input
                ref={dateInputRef}
                id="baton-date"
                type="date"
                value={date}
                max={todayDate}
                onChange={(e) => setDate(e.target.value)}
                className="sr-only"
                tabIndex={-1}
              />
            </div>
          </div>
        </div>
      )}

      {/* 生徒リスト (並びはロスター順固定・印の数で並べ替えない) */}
      {selectedClass &&
        (sortedStudents.length > 0 ? (
          // 表形式 (カードをやめ、罫線で区切る)。ゼブラは使わない (chimo 2026-06-13 の方針)。
          <div className="overflow-hidden rounded-vn border border-vn-border bg-vn-surface">
            {/* 見出し行。左端のチェックで「すべて選択 / 解除」。 */}
            <div className="flex items-center gap-2 border-b border-vn-border bg-vn-muted-bg/40 px-3 py-2">
              <label className="-m-1 shrink-0 cursor-pointer p-1">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  // 一部だけ選択中は中間状態にする (全選択と区別が付くように)
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={() =>
                  setSelectedIds(
                    allSelected ? new Set() : new Set(sortedStudents.map((s) => s.id)),
                  )
                }
                aria-label={allSelected ? 'すべて解除' : 'すべて選択'}
                className="h-3 w-3 cursor-pointer accent-vn-accent"
                data-testid="student-select-all"
              />
              </label>
              <span className="text-xs font-semibold text-slate-500">
                {selectedIds.size > 0 ? `${selectedIds.size}人を選択中` : '生徒'}
              </span>
              <span className="ml-auto text-xs font-semibold text-slate-500">
                今日の印象
              </span>
            </div>
            <div className="divide-y divide-vn-border">

            {sortedStudents.map((s) => (
              <StudentRow
                key={s.id}
                student={s}
                notes={notesByStudent.get(s.id) ?? []}
                currentUserId={currentUserId}
                nameById={nameById}
                classes={classes}
                onQuickSign={handleQuickSign}
                onMoveStudent={handleMoveStudent}
                onRenameStudent={handleRenameStudent}
                onArchiveStudent={handleArchiveStudent}
                onDeleteStudent={handleDeleteStudent}
                selected={selectedIds.has(s.id)}
                onToggleSelect={toggleSelect}
                onAddNote={handleAddNote}
                onEditNote={handleEditNote}
                onDeleteNote={handleDeleteNote}
              />
            ))}
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-gray-400">
            <Users size={16} aria-hidden />
            まだ生徒がいません。下から追加してください。
          </p>
        ))}

      {/* 選んだ生徒の一括操作 (1人以上選んだときだけ出る)。
          日々のリストの下に sticky で残し、スクロールしても押せるようにする。 */}
      <StudentBulkBar
        selectedCount={selectedIds.size}
        noteCountTotal={selectedNoteTotal}
        classes={classes}
        currentClassId={selectedClassId}
        busy={bulkBusy}
        onClear={() => setSelectedIds(new Set())}
        onMove={(toClassId) =>
          runBulk(
            { action: 'move', toClassId },
            'クラスを移しました',
            'クラス移動に失敗しました',
          )
        }
        onArchive={() =>
          runBulk({ action: 'archive' }, 'アーカイブしました', 'アーカイブに失敗しました')
        }
        onDelete={() =>
          runBulk({ action: 'delete' }, '削除しました', '削除に失敗しました')
        }
      />

      {/* 透明性表示 (§5・school_admin=teacher と整合) */}
      {classes.length > 0 && (
        <p className="px-1 text-xs leading-relaxed text-gray-400">
          ここに残したことは、校内の先生に共有されます。児童本人はこの画面を見ません。
        </p>
      )}

      {/* アーカイブ済みの生徒 (既定は隠す・トグルで一覧して復元できる) */}
      {selectedClass && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="inline-flex items-center gap-1.5 px-1 text-xs font-medium text-gray-400 hover:text-gray-600"
            data-testid="toggle-archived-students"
          >
            <Archive size={14} aria-hidden />
            {showArchived ? 'アーカイブ済みの生徒を隠す' : 'アーカイブ済みの生徒を表示'}
          </button>
          {showArchived &&
            (sortedArchived.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {sortedArchived.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-vn border border-dashed border-vn-border bg-vn-muted-bg/40 px-3 py-2"
                  >
                    <span className="text-sm text-slate-600">{s.displayName}</span>
                    <button
                      type="button"
                      onClick={() => void handleRestoreStudent(s.id)}
                      className="flex-shrink-0 rounded-md border border-vn-border bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      data-testid={`student-restore-${s.id}`}
                    >
                      復元
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 px-1 text-xs text-gray-400">
                アーカイブ済みの生徒はいません。
              </p>
            ))}
        </div>
      )}

      {/* 生徒をまとめて追加 (選択クラスへ)。クラス追加は uncontrolled (/baton-relay) のみ最下部に出す。
          controlled (生徒ノートのタブ) では親の「＋」タブが持つ。 */}
      <div className="space-y-3 pt-2">
        <RosterStudentBulkAdd
          selectedClass={selectedClass}
          onAdded={async () => {
            await mutateStudents();
          }}
        />
        {!classId && <RosterAdd classes={classes} onCreateClass={handleCreateClass} />}
      </div>
    </div>
  );
}
