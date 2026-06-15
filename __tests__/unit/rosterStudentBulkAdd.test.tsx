// RosterStudentBulkAdd: 改行区切りで生徒名 → 件数確認 → 選択クラスへ登録、の単体テスト。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// useToast は provider 無しで使えるよう mock。
vi.mock('@/shared/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import { RosterStudentBulkAdd } from '@/features/baton-relay/components/RosterStudentBulkAdd';
import type { ClassDto } from '@/features/baton-relay/types';

const cls: ClassDto = {
  id: 'c1',
  name: '2-A',
  goalText: null,
  schoolYear: null,
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      classesCreated: 0,
      classesUpdated: 0,
      studentsAdded: 2,
      studentsSkipped: 0,
    }),
  }) as unknown as typeof fetch;
});

describe('RosterStudentBulkAdd', () => {
  it('selectedClass が null なら何も描画しない', () => {
    const { container } = render(<RosterStudentBulkAdd selectedClass={null} onAdded={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('改行区切りの名前を数え、確認 → 登録で import API へ rows を送り onAdded を呼ぶ', async () => {
    const onAdded = vi.fn();
    render(<RosterStudentBulkAdd selectedClass={cls} onAdded={onAdded} />);

    fireEvent.change(screen.getByTestId('roster-bulk-add-input'), {
      target: { value: 'さくら\nひろき\n\n  ' }, // 空行・空白は無視 = 2 人
    });
    // 確認ボタンに件数が出る
    const confirmBtn = screen.getByRole('button', { name: /2 人を確認/ });
    fireEvent.click(confirmBtn);

    // 確認パネル (登録ボタンが出る)
    const submit = screen.getByTestId('roster-bulk-add-submit');
    expect(submit).toBeInTheDocument();
    fireEvent.click(submit);

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/baton-relay/import');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.rows).toEqual([
      { className: '2-A', studentName: 'さくら' },
      { className: '2-A', studentName: 'ひろき' },
    ]);
  });

  it('名前未入力なら確認ボタンは disabled', () => {
    render(<RosterStudentBulkAdd selectedClass={cls} onAdded={vi.fn()} />);
    expect(screen.getByRole('button', { name: /名前を入力/ })).toBeDisabled();
  });
});
