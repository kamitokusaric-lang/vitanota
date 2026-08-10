import { useState } from 'react';
import { Target, Pencil, Check, X } from 'lucide-react';
import type { ClassDto } from '../types';
import { GRADE_OPTIONS } from './RosterAdd';

interface ClassGoalHeaderProps {
  cls: ClassDto;
  onSaveGoal: (goalText: string) => Promise<void>;
  /** 学年の設定 (null で「学年なし」に戻す)。 */
  onSaveGrade: (grade: number | null) => Promise<void>;
}

// クラス名・クラス目標・学年。いずれもクラスに 1 つ (日付非依存)・
// インライン編集 (PATCH /classes/{id})。
// 学年は学年会 (grade-meeting) がクラスをまとめる軸。未設定のクラスは学年会に出ない。
export function ClassGoalHeader({
  cls,
  onSaveGoal,
  onSaveGrade,
}: ClassGoalHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cls.goalText ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await onSaveGoal(draft.trim());
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 px-1">
      {/* 学年。クラスの属性なので、クラス目標とは別の行に置く
          (目標の一部に見えないように)。設定すると「会議で話す」の学年会に出てくる。 */}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`class-grade-${cls.id}`}
          className="text-xs font-medium text-slate-500"
        >
          学年
        </label>
        <select
          id={`class-grade-${cls.id}`}
          value={cls.grade ?? ''}
          onChange={(e) =>
            void onSaveGrade(e.target.value ? Number(e.target.value) : null)
          }
          title="学年を設定すると、会議で話す の学年会に出てきます"
          className="rounded-md border border-vn-border bg-white px-2 py-1 text-xs text-slate-700 focus:border-vn-accent focus:outline-none"
          data-testid={`class-grade-select-${cls.id}`}
        >
          <option value="">学年なし</option>
          {GRADE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}年
            </option>
          ))}
        </select>
        {cls.grade === null && (
          <span className="text-[11px] text-slate-400">
            設定すると「会議で話す」の学年会に出てきます
          </span>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-vn border border-vn-accent/20 bg-vn-accent-bg px-4 py-3.5">
        <Target size={20} className="mt-0.5 flex-shrink-0 text-vn-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-vn-accent">クラス目標</h2>
          {editing ? (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={200}
                autoFocus
                placeholder="クラスの目標…"
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-base focus:border-vn-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={save}
                disabled={busy}
                aria-label="保存"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-vn-accent hover:bg-vn-accent/10"
              >
                <Check size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(cls.goalText ?? '');
                }}
                aria-label="キャンセル"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-white/60"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-0.5 block w-full text-left"
            >
              <span className="text-[15px] leading-relaxed text-slate-700">
                {cls.goalText || (
                  <span className="text-gray-400">タップして目標を書く</span>
                )}
              </span>
            </button>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="目標を編集"
            className="flex-shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-white/60 hover:text-gray-600"
          >
            <Pencil size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
