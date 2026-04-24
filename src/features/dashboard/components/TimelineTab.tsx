// ダッシュボードのタイムラインタブ (マイボードの「日々ノート」と職員室ボードの
// 「全体のタイムライン」で同一コンポーネントを mode で切替える)
// - mode='personal':  自分の投稿のみ (MyJournalList)
// - mode='staffroom': 全員の公開投稿 (TimelineList)
// 両 mode とも最上部に常駐投稿欄、自分の投稿には kebab メニューを表示。
import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { Modal } from '@/shared/components/Modal';
import { EntryForm } from '@/features/journal/components/EntryForm';
import {
  MyJournalList,
  type MyJournalMutate,
} from '@/features/journal/components/MyJournalList';
import {
  TimelineList,
  type TimelineMutate,
} from '@/features/journal/components/TimelineList';
import type { EntryCardData } from '@/features/journal/components/EntryCard';
import type { JournalEntry } from '@/db/schema';
import type { VitanotaSession } from '@/shared/types/auth';

type TimelineMode = 'personal' | 'staffroom';

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
  mode: TimelineMode;
}

export function TimelineTab({ session, mode }: TimelineTabProps) {
  const currentUserId = session.user.userId;
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  // 子コンポーネント (useSWRInfinite 保有) の mutate を ref で受け取る。
  // global mutate の matcher 関数は SWR v2 で `$inf$` キーが skip されるため、
  // Infinite キャッシュの再検証は子の mutate を直接呼ぶ必要がある。
  const timelineMutateRef = useRef<TimelineMutate | null>(null);
  const myJournalMutateRef = useRef<MyJournalMutate | null>(null);

  const refreshLists = async () => {
    // 現在マウント中のリストだけ同期再検証 (非アクティブ側は unmount 中で ref が null)。
    // 非アクティブ側は revalidateOnMount: true により remount 時に必ず再取得される。
    await Promise.all([
      timelineMutateRef.current?.(),
      myJournalMutateRef.current?.(),
    ]);
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
    <div className="space-y-4" data-testid={`timeline-tab-${mode}`}>
      {/* 投稿欄は nav (h-16 = 64px) の真下に sticky */}
      <div className="sticky top-16 z-[5] -mx-6 bg-vn-bg px-6 pb-3 pt-3 lg:-mx-10 lg:px-10">
        <EntryForm
          mode="create"
          compact
          onSuccess={handleCreateSuccess}
        />
      </div>

      {mode === 'staffroom' ? (
        <TimelineList
          currentUserId={currentUserId}
          onEdit={handleEdit}
          onDelete={handleDelete}
          mutateRef={timelineMutateRef}
        />
      ) : (
        <MyJournalList
          onEdit={handleEdit}
          onDelete={handleDelete}
          mutateRef={myJournalMutateRef}
        />
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
        mood: data.entry.mood,
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
