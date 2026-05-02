// 機能 B: 教員用フィードバック送信 FAB + 投稿モーダル
// 右下に固定表示 (Layout 配下、teacher / school_admin のみ表示)。
// クリックで Modal を開き、トピック選択 + 自由記述 textarea で運営に投稿。
//
// 裏テーマ防御 (memory: 観測されてると思われた瞬間に壊れる):
//   - 「運営にだけ届きます」を必ず明示
//   - 教員 / school_admin から他者投稿は DB レベルで物理不可視 (RLS)
//   - 自分の投稿履歴も UI に出さない (送信したら確定、編集不可)
import { useEffect, useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { useToast } from '@/shared/components/Toast';

interface Topic {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

const MAX_CONTENT = 5000;

export function FeedbackFAB() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-vn-accent text-2xl text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-vn-accent focus:ring-offset-2"
        aria-label="フィードバックを送る"
        data-testid="feedback-fab"
      >
        💬
      </button>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const { showToast } = useToast();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  function resetAndClose() {
    setSelectedTopicId('');
    setContent('');
    setSubmitted(false);
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
      <div className="mb-4 rounded-md border border-vn-border bg-blue-50 px-3 py-2 text-xs text-blue-800">
        ℹ️ 運営にだけ届きます (同じ学校の先生方には見えません)
      </div>

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
    </Modal>
  );
}
