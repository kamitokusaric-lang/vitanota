import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { EntryForm } from '@/features/journal/components/EntryForm';

// fetch のモック
const originalFetch = global.fetch;

function renderWithSWR(ui: React.ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>
  );
}

beforeEach(() => {
  global.fetch = vi.fn(async (url) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('/api/private/journal/tags')) {
      return new Response(
        JSON.stringify({
          tags: [
            {
              id: 't1',
              tenantId: 'tenant-1',
              name: 'うれしい',
              isEmotion: true,
              isSystemDefault: true,
              sortOrder: 1,
              createdBy: null,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response('', { status: 200 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

describe('EntryForm - create mode', () => {
  it('空の初期状態を表示する', async () => {
    renderWithSWR(<EntryForm mode="create" onSuccess={vi.fn()} />);
    const textarea = screen.getByTestId(
      'entry-form-content-input'
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    // タグが読み込まれるまで待つ
    await waitFor(() => {
      expect(screen.queryByTestId('tag-filter')).toBeTruthy();
    });
  });

  it('文字数カウンターが表示される', async () => {
    renderWithSWR(<EntryForm mode="create" onSuccess={vi.fn()} />);
    const textarea = screen.getByTestId('entry-form-content-input');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(screen.getByTestId('entry-form-content-counter').textContent).toBe(
      '5 / 200'
    );
  });

  it('空文字で submit するとバリデーションエラー', async () => {
    const onSuccess = vi.fn();
    renderWithSWR(<EntryForm mode="create" onSuccess={onSuccess} />);
    fireEvent.click(screen.getByTestId('entry-form-submit-button'));
    await waitFor(() => {
      const err = screen.getByTestId('entry-form-content-error').textContent;
      expect(err).toBeTruthy();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('有効な入力で送信が成功し onSuccess が呼ばれる', async () => {
    const onSuccess = vi.fn();
    global.fetch = vi.fn(async (url, init) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/private/journal/tags') && !init) {
        return new Response(JSON.stringify({ tags: [] }), { status: 200 });
      }
      if (u === '/api/private/journal/entries' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ entry: { id: 'new-1', content: 'test' } }),
          { status: 201 }
        );
      }
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    renderWithSWR(<EntryForm mode="create" onSuccess={onSuccess} />);
    const textarea = screen.getByTestId('entry-form-content-input');
    fireEvent.change(textarea, { target: { value: 'テスト投稿' } });
    fireEvent.click(screen.getByTestId('entry-form-submit-button'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('API がエラーを返すとルートエラーが表示される', async () => {
    const onSuccess = vi.fn();
    global.fetch = vi.fn(async (url, init) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/private/journal/tags') && !init) {
        return new Response(JSON.stringify({ tags: [] }), { status: 200 });
      }
      if (u === '/api/private/journal/entries' && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ error: 'VALIDATION_ERROR', message: 'テストエラー' }),
          { status: 400 }
        );
      }
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    renderWithSWR(<EntryForm mode="create" onSuccess={onSuccess} />);
    fireEvent.change(screen.getByTestId('entry-form-content-input'), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByTestId('entry-form-submit-button'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('テストエラー');
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('公開設定チェックボックスで isPublic を切替', async () => {
    renderWithSWR(<EntryForm mode="create" onSuccess={vi.fn()} />);
    const checkbox = screen.getByTestId(
      'entry-form-private-checkbox'
    ) as HTMLInputElement;
    // 初期は isPublic=true なので checkbox（= 非公開）は false
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});

describe('EntryForm - edit mode', () => {
  it('initialData の値で初期化される', async () => {
    renderWithSWR(
      <EntryForm
        mode="edit"
        initialData={{
          id: 'e1',
          content: '既存の本文',
          tagIds: [],
          isPublic: false,
        }}
        onSuccess={vi.fn()}
      />
    );
    const textarea = screen.getByTestId(
      'entry-form-content-input'
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('既存の本文');
    const checkbox = screen.getByTestId(
      'entry-form-private-checkbox'
    ) as HTMLInputElement;
    // isPublic=false なので checkbox は true（非公開チェック）
    expect(checkbox.checked).toBe(true);
  });

  it('edit mode では PUT リクエストが送信される', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/private/journal/tags') && !init) {
        return new Response(JSON.stringify({ tags: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ entry: { id: 'e1' } }), {
        status: 200,
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const onSuccess = vi.fn();
    renderWithSWR(
      <EntryForm
        mode="edit"
        initialData={{ id: 'e1', content: 'old', tagIds: [], isPublic: true }}
        onSuccess={onSuccess}
      />
    );
    fireEvent.change(screen.getByTestId('entry-form-content-input'), {
      target: { value: 'updated' },
    });
    fireEvent.click(screen.getByTestId('entry-form-submit-button'));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
    // PUT /api/private/journal/entries/e1 が呼ばれたことを検証
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        typeof url === 'string' &&
        url === '/api/private/journal/entries/e1' &&
        (init as RequestInit | undefined)?.method === 'PUT'
    );
    expect(putCall).toBeDefined();
  });
});
