// ダッシュボード「タイムライン」タブ: 常駐投稿欄 + 共有/自分切替 + 編集/削除モーダル
// 投稿は X ライクに最上部常駐 (compact)、編集はモーダル (compact ではない)
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { Modal } from '@/shared/components/Modal';
import { EntryForm, type EntrySaveResult } from '@/features/journal/components/EntryForm';
import { MyJournalList } from '@/features/journal/components/MyJournalList';
import { TimelineList } from '@/features/journal/components/TimelineList';
import type { EntryCardData } from '@/features/journal/components/EntryCard';
import type { JournalEntry } from '@/db/schema';
import type { VitanotaSession } from '@/shared/types/auth';

type Filter = 'all' | 'mine';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'edit'; entryId: string }
  | { kind: 'confirm-delete'; entryId: string };

interface EntryDetailResponse {
  entry: JournalEntry & { tags?: Array<{ id: string }> };
}

const detailFetcher = async (url: string): Promise<EntryDetailResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

interface TimelineTabProps {
  session: VitanotaSession;
}

export function TimelineTab({ session }: TimelineTabProps) {
  const currentUserId = session.user.userId;
  const [filter, setFilter] = useState<Filter>('all');
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const { mutate } = useSWRConfig();

  // SWR Infinite の cache key は string/array 両方の形で格納されうるため
  // 堅牢に文字列化して含有判定する
  const keyMatches = (key: unknown, needle: string): boolean => {
    try {
      const s = typeof key === 'string' ? key : JSON.stringify(key);
      return s.includes(needle);
    } catch {
      return false;
    }
  };

  const refreshLists = async () => {
    await mutate(
      (key: unknown) =>
        keyMatches(key, '/api/public/journal/entries') ||
        keyMatches(key, '/api/private/journal/entries/mine'),
      undefined,
      { revalidate: true },
    );
  };

  // SWR Infinite の data は Page[] (ページ配列)
  type InfinitePages = Array<{
    entries: EntryCardData[];
    page: number;
    perPage: number;
  }>;

  const handleCreateSuccess = async (result?: EntrySaveResult) => {
    if (!result) {
      await refreshLists();
      return;
    }
    const { entry, tags } = result;
    const optimistic: EntryCardData = {
      id: entry.id,
      userId: entry.userId ?? session.user.userId,
      content: entry.content,
      createdAt: entry.createdAt,
      isPublic: entry.isPublic,
      authorName: session.user.name,
      authorNickname: null,
      tags,
    };

    const prependToFirstPage = (pages: InfinitePages | undefined) => {
      if (!pages || !Array.isArray(pages) || pages.length === 0) return pages;
      const [first, ...rest] = pages;
      return [{ ...first, entries: [optimistic, ...first.entries] }, ...rest];
    };

    // マイ記録は isPublic 問わず常に insert
    await mutate(
      (key: unknown) => keyMatches(key, '/api/private/journal/entries/mine'),
      prependToFirstPage,
      { revalidate: true },
    );
    // 共有タイムラインは public のときだけ insert
    if (entry.isPublic) {
      await mutate(
        (key: unknown) => keyMatches(key, '/api/public/journal/entries'),
        prependToFirstPage,
        { revalidate: true },
      );
    }
  };

  const handleModalSuccess = async () => {
    await refreshLists();
    setModal({ kind: 'closed' });
  };

  const handleEdit = (entry: EntryCardData) => {
    setModal({ kind: 'edit', entryId: entry.id });
  };

  const handleDelete = (entry: EntryCardData) => {
    setModal({ kind: 'confirm-delete', entryId: entry.id });
  };

  return (
    <div className="space-y-4" data-testid="timeline-tab">
      {/* 投稿欄は nav (h-16 = 64px) の真下に sticky */}
      <div className="sticky top-16 z-[5] -mx-6 bg-vn-bg px-6 pb-3 pt-3 lg:-mx-10 lg:px-10">
        <EntryForm
          mode="create"
          compact
          onSuccess={handleCreateSuccess}
        />
      </div>

      <FilterToggle value={filter} onChange={setFilter} />

      {filter === 'all' ? (
        <TimelineList
          currentUserId={currentUserId}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ) : (
        <MyJournalList onEdit={handleEdit} onDelete={handleDelete} />
      )}

      <Modal
        open={modal.kind === 'edit'}
        onClose={() => setModal({ kind: 'closed' })}
        title="記録の編集"
      >
        {modal.kind === 'edit' && (
          <EditEntryModalBody
            entryId={modal.entryId}
            onSuccess={handleModalSuccess}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>

      <Modal
        open={modal.kind === 'confirm-delete'}
        onClose={() => setModal({ kind: 'closed' })}
        title="記録を削除しますか?"
      >
        {modal.kind === 'confirm-delete' && (
          <ConfirmDeleteModalBody
            entryId={modal.entryId}
            onSuccess={handleModalSuccess}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>
    </div>
  );
}

interface FilterToggleProps {
  value: Filter;
  onChange: (value: Filter) => void;
}

function FilterToggle({ value, onChange }: FilterToggleProps) {
  const button = (key: Filter, label: string) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      data-testid={`timeline-filter-${key}`}
      className={[
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        value === key
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2" role="group" aria-label="タイムラインフィルタ">
      {button('all', '全員')}
      {button('mine', '自分')}
    </div>
  );
}

interface EditEntryModalBodyProps {
  entryId: string;
  onSuccess: () => Promise<void>;
  onCancel: () => void;
}

function EditEntryModalBody({
  entryId,
  onSuccess,
  onCancel,
}: EditEntryModalBodyProps) {
  const { data, error, isLoading } = useSWR(
    `/api/private/journal/entries/${entryId}`,
    detailFetcher,
  );

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <LoadingSpinner label="読み込み中" />
      </div>
    );
  }
  if (error || !data) {
    return <ErrorMessage message="エントリの取得に失敗しました" />;
  }

  return (
    <EntryForm
      mode="edit"
      initialData={{
        id: data.entry.id,
        content: data.entry.content,
        tagIds: data.entry.tags?.map((t) => t.id) ?? [],
        isPublic: data.entry.isPublic,
      }}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  );
}

interface ConfirmDeleteModalBodyProps {
  entryId: string;
  onSuccess: () => Promise<void>;
  onCancel: () => void;
}

function ConfirmDeleteModalBody({
  entryId,
  onSuccess,
  onCancel,
}: ConfirmDeleteModalBodyProps) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/private/journal/entries/${entryId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError('削除に失敗しました');
        return;
      }
      await onSuccess();
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="confirm-delete-body">
      <p className="text-sm text-gray-700">
        この操作は取り消せません。削除するとタイムラインとマイ記録の両方から消えます。
      </p>
      {error && <ErrorMessage message={error} />}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          data-testid="confirm-delete-cancel-button"
        >
          キャンセル
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleConfirm}
          isLoading={isDeleting}
          data-testid="confirm-delete-confirm-button"
        >
          削除する
        </Button>
      </div>
    </div>
  );
}
