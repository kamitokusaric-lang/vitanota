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
