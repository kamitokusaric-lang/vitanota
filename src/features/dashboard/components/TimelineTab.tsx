// ダッシュボード「タイムライン」タブ: 常駐投稿欄 + 共有/自分切替 + 編集/削除モーダル
// 投稿は X ライクに最上部常駐 (compact)、編集はモーダル (compact ではない)
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
import type { VitanotaSession } from '@/shared/types/auth';
import { canUseAdminFeatures } from '@/features/auth/lib/role-helpers';

type Filter = 'all' | 'mine';
type Category = 'all' | 'positive' | 'negative' | 'neutral';

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
  const isAdmin = canUseAdminFeatures(session.user.roles);
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<Category>('all');
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

  const handleCreateSuccess = async () => {
    await refreshLists();
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

      <div className="space-y-2">
        <FilterToggle value={filter} onChange={setFilter} />
        {isAdmin && filter === 'all' && (
          <CategoryToggle value={category} onChange={setCategory} />
        )}
      </div>

      {filter === 'all' ? (
        <TimelineList
          currentUserId={currentUserId}
          category={category === 'all' ? undefined : category}
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

interface CategoryToggleProps {
  value: Category;
  onChange: (value: Category) => void;
}

function CategoryToggle({ value, onChange }: CategoryToggleProps) {
  const button = (key: Category, label: string, activeClass: string) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      data-testid={`timeline-category-${key}`}
      className={[
        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
        value === key
          ? activeClass
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="タイムライン カテゴリフィルタ (管理者のみ)"
    >
      {button('all', 'すべて', 'bg-gray-700 text-white')}
      {button('positive', 'ポジ', 'bg-green-600 text-white')}
      {button('negative', 'ネガ', 'bg-red-600 text-white')}
      {button('neutral', 'ニュートラル', 'bg-slate-500 text-white')}
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
