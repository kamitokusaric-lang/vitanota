// 記録入力一本化の入口 TodayCaptureBox / DiaryNoteBox の単体テスト。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

vi.mock('@/shared/components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
const mPostBoard = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/features/staffroom/lib/postStaffroomBoard', () => ({
  postStaffroomBoard: (...args: unknown[]) => mPostBoard(...args),
}));

import { TodayCaptureBox } from '@/features/journal/components/TodayCaptureBox';
import { DiaryNoteBox } from '@/features/journal/components/DiaryNoteBox';

function wrap(ui: React.ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>,
  );
}

const originalFetch = global.fetch;
beforeEach(() => {
  mPostBoard.mockClear();
  global.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/api/private/journal/tags')) {
      return { ok: true, json: async () => ({ tags: [] }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe('TodayCaptureBox', () => {
  it('種別チップ・本文・公開バナーを描画し、空のとき書くボタンは disabled', () => {
    wrap(<TodayCaptureBox />);
    expect(screen.getByTestId('capture-public-note')).toBeInTheDocument();
    expect(screen.getByTestId('capture-kind-note')).toBeInTheDocument();
    expect(screen.getByTestId('capture-kind-help')).toBeInTheDocument();
    expect(screen.getByTestId('capture-submit')).toBeDisabled();
  });

  it('種別未選択で投稿すると journal API に note/公開で POST する', async () => {
    const onSuccess = vi.fn();
    wrap(<TodayCaptureBox onSuccess={onSuccess} />);
    fireEvent.change(screen.getByTestId('capture-content-input'), { target: { value: '今日の気づき' } });
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/private/journal/entries'),
    );
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toMatchObject({ kind: 'note', isPublic: true });
  });

  it('board 種別 (help) を選ぶと postStaffroomBoard へ流す', async () => {
    wrap(<TodayCaptureBox />);
    fireEvent.click(screen.getByTestId('capture-kind-help'));
    fireEvent.change(screen.getByTestId('capture-content-input'), { target: { value: '相談したい' } });
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(mPostBoard).toHaveBeenCalledWith(
      expect.objectContaining({ boardKind: 'help', isPublic: true }),
    ));
  });

  it('編集モードは本文のみ PUT し、ボタンは「保存」', async () => {
    const onSuccess = vi.fn();
    wrap(<TodayCaptureBox editId="e1" initialContent="編集前" initialKind="note" onSuccess={onSuccess} />);
    expect(screen.getByTestId('capture-submit')).toHaveTextContent('保存');
    fireEvent.change(screen.getByTestId('capture-content-input'), { target: { value: '編集後' } });
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/private/journal/entries/e1'),
    );
    expect((call![1] as RequestInit).method).toBe('PUT');
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({ content: '編集後' });
  });
});

describe('DiaryNoteBox', () => {
  it('mood・モード切替を描画し、既定はテンプレ3欄', () => {
    wrap(<DiaryNoteBox />);
    expect(screen.getByTestId('diary-mood-picker')).toBeInTheDocument();
    expect(screen.getByTestId('diary-mode-toggle')).toBeInTheDocument();
    // 既定はテンプレモード = 3 欄が出て単一欄は出ない
    expect(screen.getByTestId('diary-template-fields')).toBeInTheDocument();
    expect(screen.getByTestId('diary-reflection-keep')).toBeInTheDocument();
    expect(screen.queryByTestId('diary-content-input')).not.toBeInTheDocument();
    // 「自由に書く」で単一欄に切替
    fireEvent.click(screen.getByTestId('diary-mode-free'));
    expect(screen.getByTestId('diary-content-input')).toBeInTheDocument();
  });

  it('テンプレで投稿すると見出し付きで note/非公開 POST する', async () => {
    const onSuccess = vi.fn();
    wrap(<DiaryNoteBox onSuccess={onSuccess} />);
    fireEvent.change(screen.getByTestId('diary-reflection-keep'), {
      target: { value: 'たのしかった' },
    });
    fireEvent.click(screen.getByTestId('diary-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/private/journal/entries') && (c[1] as RequestInit)?.method === 'POST',
    );
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toMatchObject({ kind: 'note', isPublic: false });
    expect(body.content).toContain('よかった・続けたいこと');
    expect(body.content).toContain('たのしかった');
  });

  it('自由モードで投稿すると本文そのままで note/非公開 POST する', async () => {
    const onSuccess = vi.fn();
    wrap(<DiaryNoteBox onSuccess={onSuccess} />);
    fireEvent.click(screen.getByTestId('diary-mode-free'));
    fireEvent.change(screen.getByTestId('diary-content-input'), { target: { value: 'ふりかえり' } });
    fireEvent.click(screen.getByTestId('diary-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/private/journal/entries') && (c[1] as RequestInit)?.method === 'POST',
    );
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toMatchObject({ kind: 'note', isPublic: false, content: 'ふりかえり' });
  });

  it('編集モードは PUT・ボタンは「保存」', async () => {
    const onSuccess = vi.fn();
    wrap(<DiaryNoteBox editId="d1" initialContent="前" onSuccess={onSuccess} />);
    expect(screen.getByTestId('diary-submit')).toHaveTextContent('保存');
    fireEvent.change(screen.getByTestId('diary-content-input'), { target: { value: '後' } });
    fireEvent.click(screen.getByTestId('diary-submit'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/private/journal/entries/d1'),
    );
    expect((call![1] as RequestInit).method).toBe('PUT');
  });
});
