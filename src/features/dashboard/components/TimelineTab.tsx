// ダッシュボード「タイムライン」タブ: 共有タイムライン + マイ記録切替 + 投稿モーダル
// 既存 /journal/index + /journal/mine + /journal/new + /journal/[id]/edit をタブ内に統合
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { Modal } from '@/shared/components/Modal';
import { EntryForm } from '@/features/journal/components/EntryForm';
import { MyJournalList } from '@/features/journal/components/MyJournalList';
import { TimelineList } from '@/features/journal/components/TimelineList';
import type { EntryCardData } from '@/features/journal/components/EntryCard';
import type { JournalEntry } from '@/db/schema';

type Filter = 'all' | 'mine';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; entryId: string };

interface EntryDetailResponse {
  entry: JournalEntry & { tags?: Array<{ id: string }> };
}

const detailFetcher = async (url: string): Promise<EntryDetailResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

export function TimelineTab() {
  const [filter, setFilter] = useState<Filter>('all');
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const { mutate } = useSWRConfig();

  const refreshLists = async () => {
    // useSWRInfinite はキーを `$inf$...` でラップするため includes で判定
    await mutate(
      (key) =>
        typeof key === 'string' &&
        (key.includes('/api/public/journal/entries') ||
          key.includes('/api/private/journal/entries/mine')),
    );
  };

  const handleSuccess = async () => {
    await refreshLists();
    setModal({ kind: 'closed' });
  };

  const handleEdit = (entry: EntryCardData) => {
    setModal({ kind: 'edit', entryId: entry.id });
  };

  return (
    <div data-testid="timeline-tab">
      <div className="mb-4 flex items-center justify-between">
        <FilterToggle value={filter} onChange={setFilter} />
        <Button
          onClick={() => setModal({ kind: 'create' })}
          className="text-xs"
          data-testid="timeline-tab-new-button"
        >
          + 新規投稿
        </Button>
      </div>

      {filter === 'all' ? (
        <TimelineList />
      ) : (
        <MyJournalList onEdit={handleEdit} />
      )}

      <Modal
        open={modal.kind === 'create'}
        onClose={() => setModal({ kind: 'closed' })}
        title="新規投稿"
      >
        {modal.kind === 'create' && (
          <EntryForm
            mode="create"
            onSuccess={handleSuccess}
            onCancel={() => setModal({ kind: 'closed' })}
          />
        )}
      </Modal>

      <Modal
        open={modal.kind === 'edit'}
        onClose={() => setModal({ kind: 'closed' })}
        title="記録の編集"
      >
        {modal.kind === 'edit' && (
          <EditEntryModalBody
            entryId={modal.entryId}
            onSuccess={handleSuccess}
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

  const handleDelete = async () => {
    if (!confirm('このエントリを削除しますか? この操作は取り消せません。')) {
      return;
    }
    const res = await fetch(`/api/private/journal/entries/${entryId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      alert('削除に失敗しました');
      return;
    }
    await onSuccess();
  };

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
    <>
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
      <div className="mt-4 flex justify-end">
        <Button
          variant="danger"
          onClick={handleDelete}
          className="text-xs"
          data-testid="edit-entry-delete-button"
        >
          削除
        </Button>
      </div>
    </>
  );
}
