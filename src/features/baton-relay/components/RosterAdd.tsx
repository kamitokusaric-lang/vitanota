import { useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import type { ClassDto } from '../types';

interface RosterAddProps {
  classes: ClassDto[];
  selectedClassId: string | null;
  onCreateClass: (name: string, goalText: string) => Promise<void>;
  onAddStudent: (
    classId: string,
    displayName: string,
    gradeLabel: string,
  ) => Promise<void>;
}

// 最小ロスター UI: クラス作成 + 選択クラスへ生徒追加。
// import は後続スライス (v1 は手動入力)。
export function RosterAdd({
  classes,
  selectedClassId,
  onCreateClass,
  onAddStudent,
}: RosterAddProps) {
  const [open, setOpen] = useState(classes.length === 0);
  const [className, setClassName] = useState('');
  const [classGoal, setClassGoal] = useState('');
  const [studentName, setStudentName] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);

  const createClass = async () => {
    if (!className.trim()) return;
    setBusy(true);
    try {
      await onCreateClass(className.trim(), classGoal.trim());
      setClassName('');
      setClassGoal('');
    } finally {
      setBusy(false);
    }
  };

  const addStudent = async () => {
    if (!selectedClassId || !studentName.trim()) return;
    setBusy(true);
    try {
      await onAddStudent(selectedClassId, studentName.trim(), grade.trim());
      setStudentName('');
      setGrade('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-vn border border-dashed border-vn-border-strong bg-vn-muted-bg/40 p-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-sm font-medium text-gray-600"
      >
        <Plus size={16} aria-hidden />
        クラス・生徒を追加
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {/* クラス作成 */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-500">クラスを作る</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="クラス名 (例: 2-A)"
                maxLength={50}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base focus:border-vn-accent focus:outline-none"
              />
              <input
                type="text"
                value={classGoal}
                onChange={(e) => setClassGoal(e.target.value)}
                placeholder="クラス目標 (任意)"
                maxLength={200}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base focus:border-vn-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={createClass}
                disabled={busy || !className.trim()}
                className="flex-shrink-0 rounded-md bg-vn-accent px-4 py-2 text-sm font-medium text-white hover:bg-vn-accent/90 disabled:opacity-40"
              >
                作る
              </button>
            </div>
          </div>

          {/* 生徒追加 */}
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500">
              <UserPlus size={13} aria-hidden />
              選択中のクラスに生徒を追加
            </p>
            {selectedClassId ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="生徒の名前"
                  maxLength={50}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base focus:border-vn-accent focus:outline-none"
                />
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="学年 (任意)"
                  maxLength={16}
                  className="rounded-md border border-gray-300 px-3 py-2 text-base focus:border-vn-accent focus:outline-none sm:w-28"
                />
                <button
                  type="button"
                  onClick={addStudent}
                  disabled={busy || !studentName.trim()}
                  className="flex-shrink-0 rounded-md bg-vn-accent px-4 py-2 text-sm font-medium text-white hover:bg-vn-accent/90 disabled:opacity-40"
                >
                  追加
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">先にクラスを作ってください</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
