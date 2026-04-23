// タスク編集モーダル内のコメントセクション
// 既存コメント一覧 + 新規追加フォーム
// 編集機能なし (MVP)、削除は自分のコメント or admin
import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { useTaskComments } from '../hooks/useTaskComments';

interface TaskCommentSectionProps {
  taskId: string;
  selfUserId: string;
  canDeleteAny: boolean;
}

function formatTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function TaskCommentSection({
  taskId,
  selfUserId,
  canDeleteAny,
}: TaskCommentSectionProps) {
  const { comments, isLoading, error, mutate } = useTaskComments(taskId);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) {
        alert('コメントの追加に失敗しました');
        return;
      }
      setBody('');
      await mutate();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('このコメントを削除しますか?')) return;
    const res = await fetch(
      `/api/tasks/${taskId}/comments/${commentId}`,
      { method: 'DELETE' },
    );
    if (res.ok) await mutate();
  };

  return (
    <div
      className="mt-4 border-t border-gray-200 pt-4"
      data-testid="task-comments"
    >
      <h4 className="mb-2 text-xs font-semibold text-gray-700">コメント</h4>

      {isLoading && <LoadingSpinner label="読み込み中" />}
      {error && <ErrorMessage message="コメントの取得に失敗しました" />}

      {!isLoading && !error && comments.length === 0 && (
        <p className="mb-2 text-xs text-gray-400">まだコメントはありません</p>
      )}

      {comments.length > 0 && (
        <ul className="mb-3 space-y-2">
          {comments.map((c) => {
            const canDelete = canDeleteAny || c.userId === selfUserId;
            return (
              <li
                key={c.id}
                className="rounded border border-gray-100 bg-gray-50 p-2 text-sm"
                data-testid={`task-comment-${c.id}`}
              >
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{c.userName ?? '不明'}</span>
                  <div className="flex items-center gap-2">
                    <time>{formatTime(c.createdAt)}</time>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="text-red-500 hover:underline"
                        data-testid={`task-comment-delete-${c.id}`}
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-gray-800">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="コメントを入力"
          rows={2}
          maxLength={2000}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          data-testid="task-comment-input"
        />
        <Button
          type="button"
          onClick={handleAdd}
          disabled={submitting || !body.trim()}
          className="text-xs"
          data-testid="task-comment-submit"
        >
          追加
        </Button>
      </div>
    </div>
  );
}
