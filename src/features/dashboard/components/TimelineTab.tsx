// 日々ノート: 投稿フォーム (sticky) + 子タブ (みんなの投稿 / わたしの投稿)
// 投稿成功時は両方のリストを再検証 (子の useSWRInfinite mutate を ref 経由で呼ぶ)
import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { Modal } from '@/shared/components/Modal';
import { EntryForm } from '@/features/journal/components/EntryForm';
import { KIND_META } from '@/features/journal/components/KindBadge';
import type { JournalEntryKind } from '@/features/journal/schemas/journal';
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

type TimelineMode = 'staffroom' | 'personal';

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

const KIND_FILTER_OPTIONS: JournalEntryKind[] = ['knowledge', 'diary', 'tweet'];

export function TimelineTab({ session }: TimelineTabProps) {
  const currentUserId = session.user.userId;
  const [mode, setMode] = useState<TimelineMode>('staffroom');
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  // kind 絞り込み: 初期は全 3 種 ON (= フィルタなしと等価)
  const [kindFilter, setKindFilter] =
    useState<JournalEntryKind[]>(KIND_FILTER_OPTIONS);

  const toggleKindFilter = (k: JournalEntryKind) => {
    setKindFilter((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

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
      {/* 投稿入口は dashboard 上部の MoodPromptBar に統合済 (重複防止のため
          このタブ内には EntryForm を置かない) */}

      {/* 子タブ: 職員室タイムライン / 自分のタイムライン */}
      <div role="tablist" className="flex gap-1 border-b border-vn-border">
        <SubTab
          active={mode === 'staffroom'}
          onClick={() => setMode('staffroom')}
          testId="timeline-subtab-staffroom"
        >
          職員室ノート
        </SubTab>
        <SubTab
          active={mode === 'personal'}
          onClick={() => setMode('personal')}
          testId="timeline-subtab-personal"
        >
          マイノート
        </SubTab>
        <SubTab
          active={false}
          onClick={() => {}}
          disabled
          testId="timeline-subtab-report"
        >
          マイレポート
        </SubTab>
      </div>

      {/* kind 絞り込み chip (3 種別を multi-select でトグル) */}
      <div
        className="flex items-center gap-2 px-3"
        role="group"
        aria-label="種別で絞り込み"
        data-testid="timeline-kind-filter"
      >
        <span className="text-xs text-gray-500">表示:</span>
        {KIND_FILTER_OPTIONS.map((k) => {
          const { Icon, label } = KIND_META[k];
          const active = kindFilter.includes(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKindFilter(k)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-vn-accent/10 text-vn-accent'
                  : 'bg-vn-muted-bg text-gray-400 hover:text-gray-600'
              }`}
              data-testid={`timeline-kind-filter-${k}`}
            >
              <Icon size={11} strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {/* 投稿リスト本体: ページ #fafafa の中に #ffffff の "面" を浮かせる
          (border / shadow は使わない — chimo 指針 "面で分ける、箱で区切らない") */}
      <div className="bg-vn-surface">
        {mode === 'staffroom' ? (
          <TimelineList
            currentUserId={currentUserId}
            onEdit={handleEdit}
            onDelete={handleDelete}
            mutateRef={timelineMutateRef}
            kindFilter={kindFilter}
          />
        ) : (
          <MyJournalList
            onEdit={handleEdit}
            onDelete={handleDelete}
            mutateRef={myJournalMutateRef}
            kindFilter={kindFilter}
          />
        )}
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
