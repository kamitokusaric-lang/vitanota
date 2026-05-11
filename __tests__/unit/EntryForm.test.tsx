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
              type: 'emotion',
              category: 'positive',
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

describe('EntryForm - create mode (default kind=diary)', () => {
  it('初期状態: textarea / mood picker / 公開トグル が表示される (TagFilter は diary では表示なし)', async () => {
    renderWithSWR(<EntryForm mode="create" onSuccess={vi.fn()} />);
    const textarea = screen.getByTestId(
      'entry-form-content-input'
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    // diary では mood picker が表示
    expect(screen.getByTestId('entry-form-mood-picker')).toBeInTheDocument();
    // TagFilter は diary では非表示 (kind=tweet のみ表示の仕様)
    expect(screen.queryByTestId('tag-filter')).toBeNull();
    // 公開トグルは表示
    expect(
      screen.getByTestId('entry-form-is-public-toggle')
    ).toBeInTheDocument();
  });

  it('diary は maxLength=1000、文字数カウンターが表示される', async () => {
    renderWithSWR(<EntryForm mode="create" onSuccess={vi.fn()} />);
    const textarea = screen.getByTestId('entry-form-content-input');
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(screen.getByTestId('entry-form-content-counter').textContent).toBe(
      '5 / 1000'
    );
  });

  it('content 空のまま submit ボタンは disabled (content 必須)', async () => {
    renderWithSWR(<EntryForm mode="create" onSuccess={vi.fn()} />);
    // mood pick しても content が空なら disabled
    fireEvent.click(screen.getByTestId('entry-form-mood-positive'));
    const submit = screen.getByTestId(
      'entry-form-submit-button'
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('mood pick + content 入力で送信成功し onSuccess が呼ばれる', async () => {
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
    fireEvent.click(screen.getByTestId('entry-form-mood-positive'));
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
    fireEvent.click(screen.getByTestId('entry-form-mood-positive'));
    fireEvent.change(screen.getByTestId('entry-form-content-input'), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByTestId('entry-form-submit-button'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('テストエラー');
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('公開トグルで isPublic を切替 (トグル UI は「マイノートだけに表示」、初期 isPublic=true なので OFF)', async () => {
    renderWithSWR(<EntryForm mode="create" onSuccess={vi.fn()} />);
    const toggle = screen.getByTestId(
      'entry-form-is-public-toggle'
    ) as HTMLInputElement;
    // 初期 isPublic=true (公開) → 「マイノートだけに表示」トグルは OFF
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    // クリック後 isPublic=false (非公開) → トグル ON
    expect(toggle.checked).toBe(true);
  });
});

describe('EntryForm - edit mode', () => {
  it('initialData の値で初期化される (isPublic=false で「マイノートだけに表示」トグル ON)', async () => {
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
    const toggle = screen.getByTestId(
      'entry-form-is-public-toggle'
    ) as HTMLInputElement;
    // isPublic=false なので「マイノートだけに表示」トグルは ON (checked=!isPublic=true)
    expect(toggle.checked).toBe(true);
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

describe('EntryForm - compact mode', () => {
  it('初期状態ではムード絵文字のみ表示、textarea とタグは非表示', () => {
    renderWithSWR(
      <EntryForm mode="create" compact onSuccess={vi.fn()} />,
    );
    // ムード絵文字は表示
    expect(
      screen.getByTestId('entry-form-mood-neutral'),
    ).toBeInTheDocument();
    // textarea, タグ, 公開トグルは初期非表示
    expect(screen.queryByTestId('entry-form-content-input')).toBeNull();
    expect(screen.queryByTestId('tag-filter')).toBeNull();
    expect(
      screen.queryByTestId('entry-form-is-public-toggle'),
    ).toBeNull();
  });

  it('ムード絵文字クリックで直接 expand ステップ (textarea 表示)', async () => {
    renderWithSWR(
      <EntryForm mode="create" compact onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('entry-form-mood-positive'));
    await waitFor(() => {
      expect(
        screen.getByTestId('entry-form-content-input'),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('entry-form-is-public-toggle'),
    ).toBeInTheDocument();
  });

  it('選んだムードの prompts からランダムな placeholder が設定される', async () => {
    renderWithSWR(
      <EntryForm mode="create" compact onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('entry-form-mood-positive'));
    const textarea = (await waitFor(() =>
      screen.getByTestId('entry-form-content-input'),
    )) as HTMLTextAreaElement;
    const placeholder = textarea.getAttribute('placeholder');
    expect([
      'いい感じだったこと、ちょっと教えて',
      '誰かに感謝したいこと、ある?',
    ]).toContain(placeholder);
  });

  it('ムード + content 入力で投稿が成功する (content 必須化)', async () => {
    const onSuccess = vi.fn();
    const fetchMock = vi.fn(async (url, init) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/private/journal/tags') && !init) {
        return new Response(JSON.stringify({ tags: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ entry: { id: 'quick-1' } }), {
        status: 201,
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWithSWR(
      <EntryForm mode="create" compact onSuccess={onSuccess} />,
    );
    fireEvent.click(screen.getByTestId('entry-form-mood-positive'));
    const textarea = await waitFor(() =>
      screen.getByTestId('entry-form-content-input'),
    );
    fireEvent.change(textarea, { target: { value: '今日は良かった' } });
    fireEvent.click(screen.getByTestId('entry-form-submit-button'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('投稿成功後は mood ステップに戻る', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.includes('/api/private/journal/tags') && !init) {
        return new Response(JSON.stringify({ tags: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ entry: { id: 'new' } }), {
        status: 200,
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderWithSWR(
      <EntryForm mode="create" compact onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('entry-form-mood-positive'));
    const textarea = await waitFor(() =>
      screen.getByTestId('entry-form-content-input'),
    );
    fireEvent.change(textarea, { target: { value: '今日のひとこと' } });
    fireEvent.click(screen.getByTestId('entry-form-submit-button'));
    await waitFor(() => {
      expect(screen.queryByTestId('entry-form-content-input')).toBeNull();
    });
    expect(
      screen.getByTestId('entry-form-mood-neutral'),
    ).toBeInTheDocument();
  });
});
