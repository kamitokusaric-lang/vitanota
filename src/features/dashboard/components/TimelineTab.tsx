// マイノート (旧 日々ノート、 chimo 2026-05-20 リネーム): 自分の投稿のみ表示。
// 「みんなの投稿」 は右レーン (PublicTimelineRail) に分離済 → ここはマイ専用。
// kind 絞り込みは廃止 (chimo 2026-05-20)。 編集 / 削除 modal は従来通り。
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
import type { EntryCardData } from '@/features/journal/components/EntryCard';
import type { JournalEntry } from '@/db/schema';
import type { VitanotaSession } from '@/shared/types/auth';

type ModalState =
  | { kind: 'closed' }
  | { kind: 'edit'; entryId: string }
  | { kind: 'confirm-delete'; entryId: string };

interface EntryDetailResponse {
  entry: JournalEntry & {
    tags?: Array<{ id: string }>;
    knowledgeTags?: Array<{ id: string }>;
  };
}

const detailFetcher = async (url: string): Promise<EntryDetailResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

interface TimelineTabProps {
  session: VitanotaSession;
}

export function TimelineTab({ session: _session }: TimelineTabProps) {
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });

  // useSWRInfinite 由来の mutate を ref で受け取り、 投稿成功時に再検証
  const myJournalMutateRef = useRef<MyJournalMutate | null>(null);

  const refreshLists = async () => {
    await myJournalMutateRef.current?.();
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
      {/* マイノート本体: 自分の投稿のみ (公開・非公開両方)、 kind 絞り込みなし */}
      <div className="bg-vn-surface">
        <MyJournalList
          onEdit={handleEdit}
          onDelete={handleDelete}
          mutateRef={myJournalMutateRef}
        />
      </div>

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

interface SubTabProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  disabled?: boolean;
}

function SubTab({
  active,
  onClick,
  children,
  testId,
  disabled = false,
}: SubTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={[
        'px-4 py-2 text-sm font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed text-gray-300'
          : active
            ? 'border-b-2 border-gray-900 text-gray-900'
            : 'border-b-2 border-transparent text-gray-500 hover:text-gray-900',
      ].join(' ')}
    >
      {children}
      {disabled && (
        <span className="ml-1 text-xs text-gray-400">(準備中)</span>
      )}
    </button>
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

  // edit 時の kind 別 tagIds 振り分け:
  //   knowledge → knowledgeTags / それ以外 → tags (emotion_tags)
  const tagIds =
    data.entry.kind === 'knowledge'
      ? data.entry.knowledgeTags?.map((t) => t.id) ?? []
      : data.entry.tags?.map((t) => t.id) ?? [];

  return (
    <EntryForm
      mode="edit"
      kind={data.entry.kind}
      initialData={{
        id: data.entry.id,
        kind: data.entry.kind,
        content: data.entry.content,
        tagIds,
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
