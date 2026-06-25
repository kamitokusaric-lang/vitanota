import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useToast } from '@/shared/components/Toast';
import type { ClassDto } from '../types';
import type { ImportResult } from '../schemas/batonRelay';

interface RosterStudentBulkAddProps {
  selectedClass: ClassDto | null;
  onAdded: () => Promise<void> | void;
}

// 生徒をまとめて追加: 1 行 1 名で入力 → 件数を確認 → 選択中クラスへ登録。
// 同名の生徒はスキップ (import エンドポイントが冪等・クラス目標には触れない)。
export function RosterStudentBulkAdd({ selectedClass, onAdded }: RosterStudentBulkAddProps) {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const names = text
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  const submit = async () => {
    if (!selectedClass || names.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/baton-relay/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // classGoal は送らない (既存クラスの目標を書き換えない)
        body: JSON.stringify({
          rows: names.map((studentName) => ({
            className: selectedClass.name,
            studentName,
          })),
        }),
      });
      if (!res.ok) {
        showToast('生徒の登録に失敗しました', 'error');
        return;
      }
      const r = (await res.json()) as ImportResult;
      showToast(
        `${r.studentsAdded} 人を登録しました` +
          (r.studentsSkipped > 0 ? `（${r.studentsSkipped} 人は登録済みでスキップ）` : ''),
        'success',
      );
      setText('');
      setConfirming(false);
      await onAdded();
    } finally {
      setBusy(false);
    }
  };

  if (!selectedClass) return null;

  return (
    <div className="rounded-vn border border-vn-border bg-vn-surface p-3.5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <UserPlus size={16} aria-hidden />
        「{selectedClass.name}」に生徒をまとめて追加
      </div>
      <p className="mt-1 text-xs text-gray-500">
        1 行に 1 人ずつ名前を入力してください。同じ名前は重複しません。
      </p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setConfirming(false);
        }}
        placeholder={'さくら\nひろき\nみなと'}
        rows={4}
        className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-base placeholder:text-gray-400 focus:border-vn-accent focus:outline-none"
        data-testid="roster-bulk-add-input"
      />

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={names.length === 0}
          className="mt-2 w-full rounded-md border border-vn-border-strong bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 sm:w-auto"
        >
          {names.length > 0 ? `${names.length} 人を確認` : '名前を入力'}
        </button>
      ) : (
        <div className="mt-2 space-y-2 rounded-md border border-vn-border bg-vn-muted-bg/40 p-3">
          <p className="text-sm text-slate-700">
            <span className="font-bold">{names.length} 人</span>を「{selectedClass.name}
            」に登録します。
          </p>
          <p className="text-xs leading-relaxed text-gray-500">{names.join('、')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="rounded-md bg-vn-accent px-4 py-2 text-sm font-medium text-white hover:bg-vn-accent/90 disabled:opacity-40"
              data-testid="roster-bulk-add-submit"
            >
              {busy ? '登録中…' : '登録する'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-slate-100"
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
