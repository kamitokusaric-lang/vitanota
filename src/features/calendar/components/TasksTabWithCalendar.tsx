// タスクボード大タブ内の view 切り替え wrapper。
// URL ?tab=tasks&view=board|week|month で view 状態を保持。
//
// 編集モーダルは TaskEditModal (TaskBoard.tsx 内、 chimo 2026-05-30 で共通化) を import。
// 新規追加 modal (Phase 6 「+」 button から) は ManualTaskCreateForm をそのまま使用。
//
// Phase 7 (chimo 2026-05-30): フィルタ state は本ファイルに集約、 board / week / month
// で共有。 PeriodFilter は view='board' のときのみ表示 (calendar は週/月ナビが期間制御)。
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useSWRConfig } from 'swr';
import { ArrowRight, Plus, Columns3, Calendar, Sparkles } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { useToast } from '@/shared/components/Toast';
import {
  TaskBoard,
  TaskEditModal,
  type SharedFilters,
} from '@/features/tasks/components/TaskBoard';
import { Tabs, type TabDef } from '@/shared/components/Tabs';
import { AssigneeFilter } from '@/features/tasks/components/AssigneeFilter';
import { CategoryFilter } from '@/features/tasks/components/CategoryFilter';
import { TagFilter } from '@/features/tasks/components/TagFilter';
import { PeriodFilter } from '@/features/tasks/components/PeriodFilter';
import { useTaskCategories } from '@/features/tasks/hooks/useTaskCategories';
import { useAssignees } from '@/features/tasks/hooks/useAssignees';
import { useTaskTags } from '@/features/tasks/hooks/useTaskTags';
import { useTaskFilterPreferences } from '@/features/tasks/hooks/useTaskFilterPreferences';
import type { TaskWithAssignees } from '@/features/tasks/hooks/useTasks';
import { ManualTaskCreateForm } from '@/features/ai-chat/ManualTaskCreateForm';
import { TaskCreateTabs } from '@/features/ai-chat/TaskCreateTabs';
import { CalendarMonthView } from './CalendarMonthView';
import { getNextMondayFromDate } from '../lib/calendarDateRange';
import { fireCalendarEvent } from '../lib/calendarAnalytics';

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// dueDate (string | Date | null) を YYYY-MM-DD | null に整形 (計測 payload 用)。
function dueDateToYmd(value: string | Date | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function formatMoveLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d} (${WEEK_LABELS[date.getDay()]})`;
}

function dueDateToBase(value: string | Date | null): Date | string {
  if (!value) return new Date();
  if (typeof value === 'string') return value.slice(0, 10);
  return value;
}

interface TasksTabWithCalendarProps {
  selfUserId: string;
  aiChatEnabled: boolean;
}

export function TasksTabWithCalendar({
  selfUserId,
  aiChatEnabled,
}: TasksTabWithCalendarProps) {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const { showToast } = useToast();
  const { categories } = useTaskCategories();
  const { assignees } = useAssignees();
  const { tags: taskTags } = useTaskTags();
  const { preference, save: savePreference } = useTaskFilterPreferences();

  const [filters, setFilters] = useState<SharedFilters>({
    filterOwner: selfUserId,
    filterTagIds: [],
    filterCategoryIds: [],
    showDelegated: false,
    period: { mode: 'default' },
  });

  // 初回のみ保存済み preference を反映 (TaskBoard 旧実装と同 pattern)
  const preferenceAppliedRef = useRef(false);
  useEffect(() => {
    if (preferenceAppliedRef.current) return;
    if (preference === null) return;
    setFilters({
      filterOwner: preference.filterOwner ?? undefined,
      filterTagIds: preference.filterTagIds,
      filterCategoryIds: preference.filterCategoryIds,
      showDelegated: preference.showDelegated,
      period: preference.period,
    });
    preferenceAppliedRef.current = true;
  }, [preference]);

  const [editing, setEditing] = useState<TaskWithAssignees | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);

  // コンパクト書き出しバー → モーダル (chimo 2026-07-02)。
  // バーで打った文字を initialInput で引き継ぎ、文字があれば即整理 (autoExtract)。
  const [captureText, setCaptureText] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureInitial, setCaptureInitial] = useState('');
  const [captureAuto, setCaptureAuto] = useState(false);

  const openCapture = () => {
    setCaptureInitial(captureText);
    setCaptureAuto(captureText.trim().length > 0);
    setCaptureOpen(true);
    setCaptureText('');
  };

  const handleEditTask = (task: TaskWithAssignees) => setEditing(task);
  const handleCloseEdit = () => setEditing(null);
  const handleAddTask = (date: string) => setCreateDate(date);
  const handleCloseCreate = () => setCreateDate(null);

  const invalidateTasks = () =>
    globalMutate(
      (key: unknown) =>
        typeof key === 'string' && key.startsWith('/api/tasks'),
    );

  const handleMoveTask = async (
    taskId: string,
    fromDate: string | null,
    newDate: string,
  ) => {
    fireCalendarEvent({
      event: 'calendar_task_moved',
      taskId,
      fromDate,
      toDate: newDate,
    });
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: newDate }),
      });
      if (!res.ok) {
        showToast('日付の変更に失敗しました', 'error');
        return;
      }
      await invalidateTasks();
      showToast(`${formatMoveLabel(newDate)} に移動しました`, 'success');
    } catch {
      showToast('日付の変更に失敗しました', 'error');
    }
  };

  const handlePushToNextWeek = async (task: TaskWithAssignees) => {
    const nextMonday = getNextMondayFromDate(dueDateToBase(task.dueDate));
    fireCalendarEvent({
      event: 'calendar_task_pushed_to_next_week',
      taskId: task.id,
      fromDate: dueDateToYmd(task.dueDate),
      toDate: nextMonday,
    });
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: nextMonday }),
      });
      if (!res.ok) {
        showToast('来週への移動に失敗しました', 'error');
        return;
      }
      await invalidateTasks();
      handleCloseEdit();
      showToast('来週に渡しました', 'success');
    } catch {
      showToast('来週への移動に失敗しました', 'error');
    }
  };

  const handleSaveFilter = async () => {
    try {
      await savePreference({
        filterOwner: filters.filterOwner ?? null,
        filterTagIds: filters.filterTagIds,
        filterCategoryIds: filters.filterCategoryIds,
        showDelegated: filters.showDelegated,
        period: filters.period,
      });
      showToast('フィルタを保存しました', 'success');
    } catch {
      showToast('保存に失敗しました', 'error');
    }
  };

  // PeriodFilter は board のみ表示 (calendar は週/月ナビが期間制御)
  const viewQuery = router.query.view;
  const activeView = typeof viewQuery === 'string' ? viewQuery : 'board';
  const showPeriodFilter = activeView === 'board';

  const tabs: TabDef[] = [
    {
      id: 'board',
      label: 'ボード',
      icon: <Columns3 size={16} strokeWidth={1.75} aria-hidden />,
      content: <TaskBoard selfUserId={selfUserId} filters={filters} />,
    },
    {
      id: 'calendar',
      label: 'カレンダー',
      icon: <Calendar size={16} strokeWidth={1.75} aria-hidden />,
      content: (
        <CalendarMonthView
          selfUserId={selfUserId}
          filters={filters}
          onEditTask={handleEditTask}
          onMoveTask={handleMoveTask}
          onAddTask={handleAddTask}
        />
      ),
    },
  ];

  // Phase 7: filter UI は Tabs の rightSlot に渡して同一 row に
  const filterBar = (
    <>
      <AssigneeFilter
        value={filters.filterOwner}
        onChange={(filterOwner) =>
          setFilters((f) => ({ ...f, filterOwner }))
        }
        assignees={assignees ?? []}
        selfUserId={selfUserId}
        showDelegated={filters.showDelegated}
        onShowDelegatedChange={(showDelegated) =>
          setFilters((f) => ({ ...f, showDelegated }))
        }
      />
      <CategoryFilter
        value={filters.filterCategoryIds}
        onChange={(filterCategoryIds) =>
          setFilters((f) => ({ ...f, filterCategoryIds }))
        }
        categories={categories ?? []}
      />
      <TagFilter
        value={filters.filterTagIds}
        onChange={(filterTagIds) =>
          setFilters((f) => ({ ...f, filterTagIds }))
        }
        tags={taskTags ?? []}
      />
      {showPeriodFilter && (
        <PeriodFilter
          value={filters.period}
          onChange={(period) => setFilters((f) => ({ ...f, period }))}
        />
      )}
      <button
        type="button"
        onClick={handleSaveFilter}
        className="inline-flex h-[30px] items-center gap-1 rounded-full border border-vn-accent/50 bg-white px-[11px] text-[12px] font-medium text-vn-accent transition-colors hover:border-vn-accent hover:bg-vn-accent-bg"
        data-testid="task-board-save-filter-button"
        title="現在のフィルタを次回以降のデフォルトとして保存"
      >
        <Plus size={14} aria-hidden />
        今の条件を保存
      </button>
    </>
  );

  return (
    <>
      {/* 書き出し欄はコンパクトな 1 行バーに集約 (chimo 2026-07-02 キャプチャ準拠)。
          打った文字を持って「整理」でモーダルを開き、そこで AI 整理 / 手動追加の全フローを回す。 */}
      <div className="mb-5 flex justify-end">
        <div className="flex w-full max-w-[560px] items-center gap-2 rounded-full border border-vn-border bg-white px-3.5 py-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] focus-within:border-vn-accent">
          <Sparkles size={18} strokeWidth={1.75} className="shrink-0 text-vn-accent" aria-hidden />
          <input
            type="text"
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                openCapture();
              }
            }}
            placeholder="仕事を書き出す…"
            maxLength={2000}
            data-testid="task-capture-bar-input"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={openCapture}
            data-testid="task-capture-bar-submit"
            className="shrink-0 rounded-full bg-vn-accent px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-vn-accent-hover"
          >
            整理
          </button>
        </div>
      </div>
      <Tabs
        tabs={tabs}
        defaultTabId="board"
        queryParam="view"
        variant="pill"
        rightSlot={filterBar}
        onSelect={(id) =>
          fireCalendarEvent({
            event: 'calendar_view_switched',
            view: id as 'board' | 'calendar',
          })
        }
      />
      <TaskEditModal
        task={editing}
        selfUserId={selfUserId}
        onClose={handleCloseEdit}
        topSlot={(task) => {
          if (task.status === 'done') return null;
          if (!task.assignees.some((a) => a.userId === selfUserId)) return null;
          return (
            <div className="mb-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => handlePushToNextWeek(task)}
                data-testid="calendar-push-to-next-week"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-vn-accent px-5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-vn-accent-hover hover:shadow-md"
              >
                <ArrowRight size={16} strokeWidth={2} aria-hidden />
                来週に渡す
              </button>
            </div>
          );
        }}
      />
      {/* 書き出しバー起動: AI 整理 / 手動追加の全フローをモーダルで回す。
          閉じたら unmount して state を初期化 (次回は新しい initialInput で開き直す)。 */}
      <Modal
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        title="タスクを書き出す"
        maxWidth="max-w-5xl"
      >
        {captureOpen && (
          <TaskCreateTabs
            selfUserId={selfUserId}
            aiChatEnabled={aiChatEnabled}
            embedded
            initialInput={captureInitial}
            autoExtract={captureAuto}
            onManualSuccess={() => {
              void invalidateTasks();
              setCaptureOpen(false);
            }}
          />
        )}
      </Modal>
      <Modal
        open={createDate !== null}
        onClose={handleCloseCreate}
        title="タスクを追加"
        maxWidth="max-w-3xl"
      >
        {createDate && (
          <ManualTaskCreateForm
            selfUserId={selfUserId}
            initialDueDate={createDate}
            onSuccess={(ids) => {
              ids?.forEach((taskId) =>
                fireCalendarEvent({
                  event: 'calendar_task_created_from_plus',
                  date: createDate,
                  taskId,
                }),
              );
              handleCloseCreate();
            }}
          />
        )}
      </Modal>
    </>
  );
}
