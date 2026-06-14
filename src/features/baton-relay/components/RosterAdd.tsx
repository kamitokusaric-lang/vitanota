import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ClassDto } from '../types';

interface RosterAddProps {
  classes: ClassDto[];
  onCreateClass: (name: string, goalText: string) => Promise<void>;
}

// クラス追加フォーム (生徒の追加は RosterStudentBulkAdd に一本化)。
export function RosterAdd({ classes, onCreateClass }: RosterAddProps) {
  const [open, setOpen] = useState(classes.length === 0);
  const [className, setClassName] = useState('');
  const [classGoal, setClassGoal] = useState('');
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

  return (
    <div className="rounded-vn border border-dashed border-vn-border-strong bg-vn-muted-bg/40 p-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-sm font-medium text-gray-600"
      >
        <Plus size={16} aria-hidden />
        クラスを追加
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
      )}
    </div>
  );
}
