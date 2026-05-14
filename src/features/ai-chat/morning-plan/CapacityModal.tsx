// 余裕選択モーダル: 「今日の余裕はどれくらいですか?」1 問だけ。
// [少なめ] [ふつう] [少しある] のいずれかを選択 → onSelect で親に通知。

import { Modal } from '@/shared/components/Modal';
import type { Capacity } from './types';
import { CAPACITY_LABEL } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (capacity: Capacity) => void;
  loading?: boolean;
}

const CAPACITIES: Capacity[] = ['low', 'normal', 'high'];

export function CapacityModal({ open, onClose, onSelect, loading }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="今日の余裕はどれくらいですか？">
      <p className="mb-5 text-sm text-slate-600">
        AI が今日の見通し案の出し方を、これに合わせて変えます。
      </p>
      <div className="flex flex-col gap-3">
        {CAPACITIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            disabled={loading}
            data-testid={`capacity-modal-${c}`}
            className="h-14 rounded-xl border border-slate-200 bg-white px-4 text-left text-base font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {CAPACITY_LABEL[c]}
          </button>
        ))}
      </div>
      {loading && (
        <p className="mt-4 text-center text-xs text-slate-500">
          見通しを整理しています…
        </p>
      )}
    </Modal>
  );
}
