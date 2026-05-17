// 機能 B + F3: 教員用フィードバック送信 FAB + 投稿モーダル + 過去フィードバック
// 右下に固定表示 (Layout 配下、teacher / school_admin のみ表示)。
// クリックで Modal を開き、トピック選択 + 自由記述 textarea で運営に投稿。
// F3 追加: 運営からの返信が未読のとき右上に dot 表示。モーダル内 accordion で
//          過去のフィードバック (自分の submission + 運営返信) を read-only 表示。
//
// 裏テーマ防御 (memory: 観測されてると思われた瞬間に壊れる):
//   - 「システム開発者に届きます」を必ず明示
//   - 教員 / school_admin から他者投稿は API 層で system_admin 限定 SELECT
//   - 自分の投稿は accordion 内で読み取り専用表示 (編集 / 削除不可、F3)
//   - F3 dot は件数なし (圧を出さない、運営側の重み付けに見えないよう「過去のフィードバック」accordion 開時に消える)
//   - 返信者表記は一律「運営より」固定 (個人名を出さない)
import { useCallback, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { useToast } from '@/shared/components/Toast';
import { FeedbackThreadList } from './FeedbackThreadList';
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboardingState';
import {
  FeedbackUnreadHint,
  FEEDBACK_UNREAD_HINT_VERSION,
} from '@/features/onboarding/FeedbackUnreadHint';

interface Topic {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

const MAX_CONTENT = 5000;

interface LatestUnreadReply {
  body: string;
  topicTitle: string;
  createdAt: string;
}

export function FeedbackFAB() {
  const [open, setOpen] = useState(false);
  const [unreadAny, setUnreadAny] = useState(false);
  const [latestUnreadReply, setLatestUnreadReply] = useState<LatestUnreadReply | null>(null);

  // 「返信が届きました」ヒント (chimo 2026-05-17):
  // 既読化後に **新たな** 返信が来たら再表示する (= dismissedAt < latestUnreadReply.createdAt)
  const {
    state: hintState,
    markDismissed: markUnreadHintDismissed,
  } = useOnboardingState(
    'feedback_unread_hint',
    FEEDBACK_UNREAD_HINT_VERSION,
  );
  const shouldShowUnreadHint =
    unreadAny &&
    !!latestUnreadReply &&
    (!hintState ||
      !hintState.dismissedAt ||
      hintState.dismissedAt < latestUnreadReply.createdAt);
  const dismissUnreadHint = useCallback(
    (reason: 'close_button' | 'cta_click') => {
      void fetch('/api/ai-chat/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'feedback_unread_hint_dismissed',
          reason,
          version: FEEDBACK_UNREAD_HINT_VERSION,
        }),
      }).catch(() => undefined);
      void markUnreadHintDismissed(1).catch(() => undefined);
    },
    [markUnreadHintDismissed],
  );

  useEffect(() => {
    let cancelled = false;
    fetch('/api/feedback/my-threads?summary=1')
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setUnreadAny(Boolean(data.unreadAny));
        setLatestUnreadReply(data.latestUnreadReply ?? null);
      })
      .catch(() => {
        /* dot は出さない、エラー時は通常 FAB */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMarkRead = useCallback(() => {
    setUnreadAny(false);
    // latestUnreadReply は意図的に残す:
    // モーダル内では「最初に開いた時の未読」を Modal 自体が保持し、閉じるまで表示続ける
  }, []);

  return (
    <>
      <div className="group fixed bottom-6 right-6 z-30">
        <button
          type="button"
          onClick={() => {
            if (unreadAny && shouldShowUnreadHint) {
              dismissUnreadHint('cta_click');
            }
            setOpen(true);
          }}
          className="relative flex h-14 w-14 items-center justify-center rounded-full border border-vn-border bg-vn-muted-bg text-gray-700 shadow-sm transition-colors hover:bg-vn-border focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
          aria-label="フィードバックを送る"
          data-testid="feedback-fab"
        >
          <MessageSquare size={22} strokeWidth={1.75} aria-hidden />
          {unreadAny && (
            <span
              className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-vn-accent"
              data-testid="feedback-fab-unread-dot"
              aria-label="未読の返信あり"
            />
          )}
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute right-full top-1/2 z-10 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs font-normal text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          data-testid="feedback-fab-tooltip"
        >
          フィードバック待ってます
        </span>
      </div>
      <FeedbackModal
        open={open}
        onClose={() => setOpen(false)}
        onMarkRead={handleMarkRead}
        latestUnreadReply={latestUnreadReply}
      />
      {unreadAny && shouldShowUnreadHint && (
        <FeedbackUnreadHint
          anchorSelector='[data-testid="feedback-fab"]'
          onDismiss={(reason) => dismissUnreadHint(reason)}
        />
      )}
    </>
  );
}

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  onMarkRead?: () => void;
  latestUnreadReply: LatestUnreadReply | null;
}

function FeedbackModal({ open, onClose, onMarkRead, latestUnreadReply }: FeedbackModalProps) {
  const { showToast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [threadsOpened, setThreadsOpened] = useState(false);
  // 「最初に開いた時の未読返信」を Modal が保持。mark-read 後も閉じるまで表示続ける。
  const [initialUnreadReply, setInitialUnreadReply] = useState<LatestUnreadReply | null>(null);

  // accordion 展開時に 1 度だけ mark-read を呼ぶ (踏み絵: 件数表示しない、dot のみ消す)
  const handleThreadsToggle = useCallback(
    (e: React.SyntheticEvent<HTMLDetailsElement>) => {
      if (e.currentTarget.open && !threadsOpened) {
        setThreadsOpened(true);
        fetch('/api/feedback/mark-read', { method: 'POST' })
          .then(() => {
            onMarkRead?.();
          })
          .catch(() => {
            /* 失敗時は次回再試行 */
          });
      }
    },
    [threadsOpened, onMarkRead],
  );

  useEffect(() => {
    if (!open) return;
    // 開いた瞬間に「最初に開いた時の未読返信」を確定 (mark-read 後の消失と独立)。
    // 依存は open のみ意図的、latestUnreadReply の変更で再 trigger しない
    setInitialUnreadReply(latestUnreadReply);
    setTopicsLoading(true);
    setTopicsError(null);
    setSubmitted(false);
    fetch('/api/feedback/topics')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? 'トピック取得失敗');
        setTopics(data.topics);
        if (data.topics.length === 1) {
          setSelectedTopicId(data.topics[0].id);
        }
      })
      .catch(() => setTopicsError('トピックの取得に失敗しました。時間をおいて再度お試しください。'))
      .finally(() => setTopicsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetAndClose() {
    setSelectedTopicId('');
    setContent('');
    setSubmitted(false);
    setThreadsOpened(false);
    setInitialUnreadReply(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTopicId || content.trim().length === 0 || content.length > MAX_CONTENT) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: selectedTopicId, content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? '送信失敗');
      setSubmitted(true);
      showToast('フィードバックを送信しました。ありがとうございます', 'success');
      setTimeout(() => {
        resetAndClose();
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '送信に失敗しました';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTopic = topics.find((t) => t.id === selectedTopicId);

  return (
    <Modal open={open} onClose={resetAndClose} title="フィードバックを送る" maxWidth="max-w-lg">
      {initialUnreadReply && (
        <div
          className="mb-4 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900"
          data-testid="feedback-modal-latest-unread-reply"
        >
          <p className="mb-1 font-semibold">開発者からの返信が届きました。</p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-indigo-800">
            {initialUnreadReply.body}
          </p>
        </div>
      )}

      {topicsLoading && (
        <div className="py-8 text-center text-sm text-gray-500">読み込み中...</div>
      )}

      {topicsError && (
        <div className="py-4 text-center text-sm text-red-600">{topicsError}</div>
      )}

      {!topicsLoading && !topicsError && topics.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-500">
          現在、フィードバックを受け付けているトピックはありません
        </div>
      )}

      {!topicsLoading && !topicsError && topics.length > 0 && !submitted && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">トピック</legend>
            <div className="flex flex-col gap-2">
              {topics.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                    selectedTopicId === t.id
                      ? 'border-vn-accent bg-orange-50'
                      : 'border-vn-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="feedback-topic"
                    value={t.id}
                    checked={selectedTopicId === t.id}
                    onChange={() => setSelectedTopicId(t.id)}
                    data-testid={`feedback-topic-${t.id}`}
                    className="mt-1"
                  />
                  <span>{t.title}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {selectedTopic?.description && (
            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
              ヒント: {selectedTopic.description}
            </div>
          )}

          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              maxLength={MAX_CONTENT}
              placeholder="自由にお書きください"
              className="w-full rounded-md border border-vn-border px-3 py-2 text-sm focus:border-vn-accent focus:outline-none"
              data-testid="feedback-content"
              required
            />
            <div className="mt-1 text-right text-xs text-gray-400">
              {content.length} / {MAX_CONTENT}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={resetAndClose}>
              キャンセル
            </Button>
            <Button
              type="submit"
              isLoading={submitting}
              disabled={!selectedTopicId || content.trim().length === 0}
              data-testid="feedback-submit"
            >
              送信
            </Button>
          </div>
        </form>
      )}

      {submitted && (
        <div className="py-8 text-center text-sm text-gray-700" data-testid="feedback-submitted">
          ありがとうございました。
        </div>
      )}

      <details
        className="mt-6 border-t border-vn-border pt-4"
        onToggle={handleThreadsToggle}
        data-testid="feedback-threads-accordion"
      >
        <summary className="cursor-pointer text-sm font-medium text-gray-700">
          過去のフィードバック
        </summary>
        <div className="mt-3">{open && threadsOpened && <FeedbackThreadList />}</div>
      </details>
    </Modal>
  );
}
