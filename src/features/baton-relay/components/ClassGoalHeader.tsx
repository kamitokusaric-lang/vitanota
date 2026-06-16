import { useState } from 'react';
import { Target, Pencil, Check, X } from 'lucide-react';
import type { ClassDto } from '../types';

interface ClassGoalHeaderProps {
  cls: ClassDto;
  onSaveGoal: (goalText: string) => Promise<void>;
}

// クラス名・クラス目標。目標はクラスに 1 つ (日付非依存)・インライン編集 (PATCH /classes/{id})。
export function ClassGoalHeader({ cls, onSaveGoal }: ClassGoalHeaderProps) {
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
    <div className="px-1">
      <div className="rounded-md bg-vn-muted-bg p-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Target size={14} aria-hidden />
          クラス目標
        </h2>
        {editing ? (
          <div className="mt-1.5 flex items-center gap-1.5">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={200}
              autoFocus
              placeholder="クラスの目標…"
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-base focus:border-vn-accent focus:outline-none"
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
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 flex w-full items-center gap-2 text-left"
          >
            <span className="flex-1 text-sm leading-relaxed text-gray-700">
              {cls.goalText || (
                <span className="text-gray-400">タップして目標を書く</span>
              )}
            </span>
            <Pencil size={14} className="flex-shrink-0 text-gray-400" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
