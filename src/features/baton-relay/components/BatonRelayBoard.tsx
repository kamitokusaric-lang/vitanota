import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useToast } from '@/shared/components/Toast';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import {
  useClasses,
  useStudents,
  useNotes,
  useReactions,
  useTeacherNames,
} from '../hooks/useBatonRelay';
import type { StudentReactionType, StudentReactionDto } from '../types';
import { ClassGoalHeader } from './ClassGoalHeader';
import { StudentRow } from './StudentRow';
import { RosterAdd } from './RosterAdd';
import { RosterImport } from './RosterImport';

interface BatonRelayBoardProps {
  currentUserId: string;
  todayDate: string; // YYYY-MM-DD (SSR で確定・hydration mismatch 回避)
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function BatonRelayBoard({ currentUserId, todayDate }: BatonRelayBoardProps) {
  const { showToast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [date, setDate] = useState(todayDate);

  const { classes, isLoading: classesLoading, error: classesError, mutate: mutateClasses } =
    useClasses();
  const { students, mutate: mutateStudents } = useStudents(selectedClassId);
  const { notes, mutate: mutateNotes } = useNotes(selectedClassId, date);
  const { reactions, mutate: mutateReactions } = useReactions(selectedClassId);
  const nameById = useTeacherNames();

  // クラスが読めたら先頭を選択 (未選択時のみ)
  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

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

  const reactionsByStudent = useMemo(() => {
    const map = new Map<string, StudentReactionDto[]>();
    for (const r of reactions) {
      const arr = map.get(r.studentId) ?? [];
      arr.push(r);
      map.set(r.studentId, arr);
    }
    return map;
  }, [reactions]);

  // ── handlers ──
  const handleCreateClass = async (name: string, goalText: string) => {
    const res = await postJson('/api/baton-relay/classes', {
      name,
      goalText: goalText || undefined,
    });
    if (!res.ok) {
      showToast('クラスの作成に失敗しました', 'error');
      return;
    }
    const { class: created } = (await res.json()) as { class: { id: string } };
    await mutateClasses();
    setSelectedClassId(created.id);
    showToast('クラスを作りました', 'success');
  };

  const handleAddStudent = async (
    classId: string,
    displayName: string,
    gradeLabel: string,
  ) => {
    const res = await postJson('/api/baton-relay/students', {
      classId,
      displayName,
      gradeLabel: gradeLabel || undefined,
    });
    if (!res.ok) {
      showToast('生徒の追加に失敗しました', 'error');
      return;
    }
    await mutateStudents();
    showToast('生徒を追加しました', 'success');
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

  const handleToggleReaction = (studentId: string, type: StudentReactionType) => {
    const existing = reactions.find(
      (r) => r.studentId === studentId && r.userId === currentUserId && r.reactionType === type,
    );
    // 楽観的更新
    void mutateReactions(
      (cur) => {
        const list = cur?.reactions ?? [];
        if (existing) {
          return { reactions: list.filter((r) => r.id !== existing.id) };
        }
        const optimistic: StudentReactionDto = {
          id: `temp-${crypto.randomUUID()}`,
          studentId,
          userId: currentUserId,
          reactionType: type,
          createdAt: new Date().toISOString(),
        };
        return { reactions: [...list, optimistic] };
      },
      { revalidate: false },
    );
    void (async () => {
      const res = await postJson('/api/baton-relay/reactions', {
        studentId,
        reactionType: type,
      });
      if (!res.ok) showToast('印の保存に失敗しました', 'error');
      void mutateReactions(); // 確定値で再検証
    })();
  };

  const handleAddNote = async (studentId: string, content: string) => {
    const res = await postJson('/api/baton-relay/notes', {
      studentId,
      noteDate: date,
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
      {/* クラス切替 + 日付 */}
      {classes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="baton-class">
            クラス
          </label>
          <select
            id="baton-class"
            value={selectedClassId ?? ''}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-base focus:border-vn-accent focus:outline-none"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="baton-date">
            日付
          </label>
          <input
            id="baton-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-base focus:border-vn-accent focus:outline-none"
          />
        </div>
      )}

      {/* クラス目標ヘッダ */}
      {selectedClass && (
        <ClassGoalHeader cls={selectedClass} date={date} onSaveGoal={handleSaveGoal} />
      )}

      {/* 生徒リスト (並びはロスター順固定・印の数で並べ替えない) */}
      {selectedClass &&
        (students.length > 0 ? (
          <div className="space-y-2.5">
            {students.map((s) => (
              <StudentRow
                key={s.id}
                student={s}
                notes={notesByStudent.get(s.id) ?? []}
                reactions={reactionsByStudent.get(s.id) ?? []}
                currentUserId={currentUserId}
                nameById={nameById}
                onToggleReaction={handleToggleReaction}
                onAddNote={handleAddNote}
                onEditNote={handleEditNote}
                onDeleteNote={handleDeleteNote}
              />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 px-1 py-6 text-sm text-gray-400">
            <Users size={16} aria-hidden />
            まだ生徒がいません。下から追加してください。
          </p>
        ))}

      {/* 透明性表示 (§5・school_admin=teacher と整合) */}
      {classes.length > 0 && (
        <p className="px-1 text-xs leading-relaxed text-gray-400">
          ここに残したことは、校内の先生に共有されます。児童本人はこの画面を見ません。
        </p>
      )}

      {/* ロスター取り込み (CSV 一括 + 手動追加) */}
      <div className="space-y-3 pt-2">
        <RosterImport
          onImported={async () => {
            await Promise.all([mutateClasses(), mutateStudents()]);
          }}
        />
        <RosterAdd
          classes={classes}
          selectedClassId={selectedClassId}
          onCreateClass={handleCreateClass}
          onAddStudent={handleAddStudent}
        />
      </div>
    </div>
  );
}
