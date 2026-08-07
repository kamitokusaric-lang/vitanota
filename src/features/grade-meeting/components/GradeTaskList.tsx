// 学年の「やること」— クラスに紐づかない仕事 (行事の準備・学年通信・保護者対応)。
//
// 実体は既存 tasks。ここで書くとタスクタブにも出て、担当・期限・完了は
// タスク側の仕組みをそのまま使う (TODO の仕組みを学年会の中に二重に作らない)。
//
// クラスの「次の一手」に達成度を持たせなかったのとは線を引く:
// あちらは前提・見立ての話なので採点しない。こちらは業務の TODO なので
// 終わったかどうかは普通に業務の話として扱う。
import { useState } from 'react';
import { Plus, X, ExternalLink } from 'lucide-react';
import type { GradeTaskDto } from '../hooks/useGradeMeeting';

export interface TaskCategoryOption {
  id: string;
  name: string;
}

// tasks の status。完了系だけ見た目を落とす。
const DONE_STATUSES = new Set(['done', 'completed']);

export function GradeTaskList({
  grade,
  tasks,
  categories,
  onCreate,
  onUnlink,
}: {
  grade: number;
  tasks: GradeTaskDto[];
  categories: TaskCategoryOption[];
  onCreate: (params: {
    categoryId: string;
    title: string;
    dueDate?: string;
  }) => Promise<void>;
  onUnlink: (taskId: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);

  // 既定カテゴリ = 先頭 (テナントが並べた順)。
  const effectiveCategoryId = categoryId || categories[0]?.id || '';

  const submit = async () => {
    const t = title.trim();
    if (!t || !effectiveCategoryId) return;
    setBusy(true);
    try {
      await onCreate({
        categoryId: effectiveCategoryId,
        title: t,
        dueDate: dueDate || undefined,
      });
      setTitle('');
      setDueDate('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl border border-vn-border bg-white p-4 shadow-sm sm:p-5"
      data-testid="grade-task-list"
    >
      <div className="flex items-baseline gap-2">
        <h3 className="text-[15px] font-bold text-slate-800">
          {grade}年でやること
        </h3>
        <span className="text-[12px] text-slate-400">
          クラスに紐づかない仕事
        </span>
      </div>

      {tasks.length > 0 && (
        <ul className="mt-3 space-y-1.5" data-testid="grade-task-items">
          {tasks.map((t) => {
            const done = DONE_STATUSES.has(t.status);
            return (
              <li
                key={t.taskId}
                className="flex items-start gap-2 rounded-xl bg-vn-muted-bg/40 px-3.5 py-2"
              >
                <span
                  className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                    done ? 'bg-vn-green' : 'bg-slate-300'
                  }`}
                  aria-hidden
                />
                <p
                  className={`min-w-0 flex-1 break-words text-[13px] leading-[1.7] ${
                    done ? 'text-slate-400 line-through' : 'text-slate-700'
                  }`}
                >
                  {t.title}
                </p>
                {t.assignees.length > 0 && (
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {t.assignees
                      .map((a) => a.name ?? 'ほかの先生')
                      .join('・')}
                  </span>
                )}
                {t.dueDate && (
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                    {formatDue(t.dueDate)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onUnlink(t.taskId)}
                  aria-label="この会から外す"
                  title="この会から外す (タスクは残ります)"
                  className="shrink-0 rounded-full p-1 text-slate-300 transition hover:bg-white hover:text-slate-500"
                  data-testid={`grade-task-unlink-${t.taskId}`}
                >
                  <X size={13} strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {categories.length === 0 ? (
        <p className="mt-3 text-[12px] leading-[1.7] text-slate-400">
          タスクのカテゴリがまだありません。「タスクを整理する」で作ると、ここから起こせます。
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-start gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="次の学年会までにやること (15文字)"
              maxLength={15}
              className="min-w-0 flex-1 rounded-xl border border-vn-border bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-vn-accent focus:outline-none"
              data-testid="grade-task-title"
            />
            <button
              type="button"
              onClick={submit}
              disabled={busy || !title.trim()}
              className="flex shrink-0 items-center gap-1 rounded-full bg-vn-accent px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:opacity-40"
              data-testid="grade-task-submit"
            >
              <Plus size={14} strokeWidth={2.5} aria-hidden />
              足す
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={effectiveCategoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="カテゴリ"
              className="rounded-xl border border-vn-border bg-white px-2.5 py-1.5 text-[12px] text-slate-700 focus:border-vn-accent focus:outline-none"
              data-testid="grade-task-category"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="期限"
              className="rounded-xl border border-vn-border bg-white px-2.5 py-1.5 text-[12px] text-slate-700 focus:border-vn-accent focus:outline-none"
              data-testid="grade-task-due"
            />
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <ExternalLink size={12} strokeWidth={2} aria-hidden />
              タスクとして「タスクを整理する」にも出ます
            </span>
          </div>

        </div>
      )}
    </section>
  );
}

function formatDue(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}
