// 余裕選択モーダル: 「今日の余裕はどれくらいですか?」1 問だけ。
// [少なめ] [ふつう] [少しある] のいずれかを選択 → onSelect で親に通知。
//
// chimo 2026-05-17: 離脱対策で「ふつう」ボタン真上に初回ヒント吹き出し。
// dismiss は「閉じる」or いずれかの capacity ボタン押下で永続化。

import { Modal } from '@/shared/components/Modal';
import type { Capacity } from './types';
import { CAPACITY_LABEL } from './types';
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboardingState';
import {
  CapacityModalHint,
  CAPACITY_MODAL_DEFAULT_HINT_VERSION,
} from '@/features/onboarding/CapacityModalHint';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (capacity: Capacity) => void;
  loading?: boolean;
}

const CAPACITIES: Capacity[] = ['low', 'normal', 'high'];

export function CapacityModal({ open, onClose, onSelect, loading }: Props) {
  const {
    shouldShow: shouldShowHint,
    markDismissed: markHintDismissed,
  } = useOnboardingState(
    'capacity_modal_default_hint',
    CAPACITY_MODAL_DEFAULT_HINT_VERSION,
  );
  const dismissHint = (reason: 'close_button' | 'cta_click') => {
    void fetch('/api/ai-chat/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'capacity_modal_default_hint_dismissed',
        reason,
        version: CAPACITY_MODAL_DEFAULT_HINT_VERSION,
      }),
    }).catch(() => undefined);
    void markHintDismissed(1).catch(() => undefined);
  };

  return (
    <Modal open={open} onClose={onClose} title="今日の余裕はどれくらいですか?">
      <p className="mb-5 text-sm text-slate-600">
        AI が今日の見通し案の出し方を、これに合わせて変えます。
      </p>
      <div className="flex flex-col gap-3">
        {CAPACITIES.map((c) => (
          <div key={c} className="relative">
            {shouldShowHint && c === 'normal' && (
              <CapacityModalHint
                onDismiss={(reason) => dismissHint(reason)}
              />
            )}
            <button
              type="button"
              onClick={() => {
                if (shouldShowHint) dismissHint('cta_click');
                onSelect(c);
              }}
              disabled={loading}
              data-testid={`capacity-modal-${c}`}
              className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-left text-base font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {CAPACITY_LABEL[c]}
            </button>
          </div>
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
