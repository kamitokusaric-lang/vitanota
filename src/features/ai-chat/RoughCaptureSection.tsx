// Phase 1 コア体験「雑に投げる → 整う → 残る」の入口 component。
//
// 動線:
//   idle/input → 教員が雑に書く → extract API → review (候補確認・修正) → confirm API
//   → reasonForm (任意で気になった理由を聞く) → feedback API → idle に戻る
//
// 設計憲法 (feedback_design_vocab.md): 「分析・評価・最適化」を避け
// 「整える・しまう・残す・渡す」「雑に書く」を使う。AI 主体ではなく教員主体の語彙。
// 観測者原則 (feedback_observed_moment_broken.md): スコアは本人の感覚をきく問いで、
// 教員を評価・診断しない。AI からのコメント・励まし・寄り添い表現は禁止。

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import {
  AI_CATEGORY_DEFINITIONS,
  resolveParentName,
  type AiCategoryId,
  type ParentCategoryName,
} from './categoryDefinitions';
import { useTaskTags, type TaskTag } from '@/features/tasks/hooks/useTaskTags';
import { useAssignees } from '@/features/tasks/hooks/useAssignees';
import {
  AssigneePopoverInput,
  type AssigneeCandidate,
} from '@/features/tasks/components/AssigneePopoverInput';

// 表示判定は親 (Dashboard) 側で SSR フラグ (isAiChatEnabledForTenant) を見て制御。
// ここでは無条件にマウントされる前提。NEXT_PUBLIC_ 経由の bake は廃止 (tenant 漏洩防止)。

const PARENT_OPTIONS: ParentCategoryName[] = [
  '学び',
  '育み',
  '安心',
  '1学年',
  '2学年',
  '3学年',
  '特別支援学級',
  '校務',
];

interface TaskCandidate {
  title: string;
  category_id: string | null;
  due_date: string | null;
  memo: string;
  confidence: 'high' | 'medium' | 'low';
}

interface CandidateRow {
  include: boolean;
  title: string;
  aiSuggestedTitle: string;
  aiSuggestedCategoryId: string | null;
  aiSuggestedParentName: ParentCategoryName | null;
  userSelectedParentName: ParentCategoryName | '';
  dueDate: string;
  aiSuggestedDueDate: string | null;
  memo: string;
  confidence: 'high' | 'medium' | 'low';
  tagIds: string[];
  assigneeUserIds: string[];
}

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | {
      kind: 'review';
      sessionId: string;
      rows: CandidateRow[];
      inputSnippet: string;
      needsConfirmation: string[];
    }
  | { kind: 'confirming' }
  | {
      kind: 'survey';
      sessionId: string;
      createdCount: number;
      hasEdits: boolean;
      pendingDiscardSessionId: string | null;
      factLine: string;
      suggestionLine: string;
    }
  | {
      kind: 'thanks';
      createdCount: number;
      factLine: string;
      suggestionLine: string;
    };

type DiscardReason =
  | 'wrong_candidate'
  | 'too_detailed'
  | 'too_rough'
  | 'not_a_task'
  | 'inconvenient'
  | 'privacy_concern'
  | 'other';

const DISCARD_REASON_OPTIONS: { value: DiscardReason; label: string }[] = [
  { value: 'wrong_candidate', label: '候補が違う' },
  { value: 'too_detailed', label: '細かすぎ' },
  { value: 'too_rough', label: '粗すぎ' },
  { value: 'not_a_task', label: 'タスクじゃない' },
  { value: 'inconvenient', label: '使いづらい' },
  { value: 'privacy_concern', label: '個人情報が気になる' },
  { value: 'other', label: 'その他' },
];

// 入力欄上に表示する説明 (placeholder ではない)
const INPUT_LEAD = '思いついた仕事を書き出すと、AIがタスクを登録します。';
// textarea の placeholder = 例文だけ (= 中を軽く保つ、chimo 2026-05-14 提案)
const PLACEHOLDER =
  '例: 明日までに保護者返信、金曜までに掲示物、Aさんの件を学年主任に相談';

// 「今日のひとこと」: 事実 + 次の一歩。励まし語彙なし。
// テンプレ (chimo 2026-05-13):
//   1. {n}件のタスクを作成しました。 ← 親が createdCount で別途表示
//   2. {分類・期限・今日やることなどの事実}        ← factLine
//   3. {必要なら次の一歩を1つだけ}                 ← suggestionLine
function makeHitokoto(
  rows: { dueDate: string; userSelectedParentName: string }[],
): { factLine: string; suggestionLine: string } {
  if (rows.length === 0) return { factLine: '', suggestionLine: '' };

  // カテゴリ分布
  const categoryCount = new Map<string, number>();
  for (const r of rows) {
    if (!r.userSelectedParentName) continue;
    categoryCount.set(
      r.userSelectedParentName,
      (categoryCount.get(r.userSelectedParentName) ?? 0) + 1,
    );
  }
  const factParts: string[] = [];
  for (const [name, count] of categoryCount) {
    factParts.push(`「${name}」が${count}件`);
  }
  const factLine = factParts.length > 0 ? `${factParts.join('、')}です。` : '';

  // 期限分布 → 次の一歩
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const withDates = rows
    .filter((r) => r.dueDate)
    .map((r) => new Date(`${r.dueDate}T00:00:00`))
    .sort((a, b) => a.getTime() - b.getTime());
  const withoutDates = rows.length - withDates.length;

  let suggestionLine = '';
  if (withDates.length > 0) {
    const nearest = withDates[0];
    const diffDays = Math.round(
      (nearest.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays < 0) {
      suggestionLine = '期限が過ぎているものから確認するとよさそうです。';
    } else if (diffDays === 0) {
      suggestionLine = '今日中の期限から確認するとよさそうです。';
    } else if (diffDays === 1) {
      suggestionLine = '明日までの期限が近いです。';
    } else if (diffDays <= 7) {
      suggestionLine = 'まずは期限が近いものから確認するとよさそうです。';
    }
  } else if (withoutDates === rows.length) {
    suggestionLine = '期限はおまかせで残しています。';
  }

  return { factLine, suggestionLine };
}
const EXAMPLE =
  '例: 明日までに保護者返信、金曜までに掲示物、Aさんの件を学年主任に相談';

export function RoughCaptureSection({
  selfUserId,
  headerRight,
}: {
  selfUserId: string;
  headerRight?: ReactNode;
}) {
  const [input, setInput] = useState('');
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const inputStartedFiredRef = useRef(false);
  const { tags: availableTags, mutate: mutateTags } = useTaskTags();
  const { assignees } = useAssignees();

  // textarea の初回入力で 1 度だけ AiCaptureInputStarted を発火する
  const handleInputChange = (next: string) => {
    if (
      !inputStartedFiredRef.current &&
      input.length === 0 &&
      next.length > 0
    ) {
      inputStartedFiredRef.current = true;
      void fetch('/api/ai-chat/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'ai_capture_input_started',
          source: 'rough_capture',
        }),
      }).catch(() => undefined);
    }
    setInput(next);
  };

  const assigneeCandidates: AssigneeCandidate[] = useMemo(
    () =>
      (assignees ?? []).map((a) => ({
        userId: a.userId,
        label:
          a.userId === selfUserId
            ? '自分'
            : a.name ?? a.email,
      })),
    [assignees, selfUserId],
  );
  // 「前に戻る」を押した直後は reason を聞かず、書き直し → 作成 → アンケートで一括で聞く。
  // 最後に discard した session id を覚えておき、次のアンケート画面で reason を併設提示。
  const [pendingDiscardSessionId, setPendingDiscardSessionId] = useState<string | null>(null);

  const handleCreateTag = async (name: string): Promise<TaskTag | null> => {
    const res = await fetch('/api/task-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? 'タグ作成に失敗しました');
    }
    const { tag } = (await res.json()) as { tag: TaskTag };
    await mutateTags();
    return tag;
  };


  const inputTrimmed = input.trim();
  const canSubmit = inputTrimmed.length > 0 && view.kind === 'idle';

  const handleExtract = async () => {
    setError(null);
    setView({ kind: 'loading' });
    try {
      const res = await fetch('/api/ai-chat/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inputText: inputTrimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? '整理に失敗しました。少し時間をおいてもう一度お試しください。');
        setView({ kind: 'idle' });
        return;
      }
      const tasks: TaskCandidate[] = data.tasks ?? [];
      const rows: CandidateRow[] = tasks.map((t) => {
        const parentName = resolveParentName(t.category_id);
        return {
          include: true,
          title: t.title,
          aiSuggestedTitle: t.title,
          aiSuggestedCategoryId: t.category_id,
          aiSuggestedParentName: parentName,
          userSelectedParentName: parentName ?? '',
          dueDate: t.due_date ?? '',
          aiSuggestedDueDate: t.due_date ?? null,
          memo: t.memo ?? '',
          confidence: t.confidence,
          tagIds: [],
          assigneeUserIds: [selfUserId],
        };
      });
      setView({
        kind: 'review',
        sessionId: data.sessionId,
        rows,
        inputSnippet: inputTrimmed,
        needsConfirmation: data.needsConfirmation ?? [],
      });
    } catch {
      setError('通信に失敗しました。少し時間をおいてもう一度お試しください。');
      setView({ kind: 'idle' });
    }
  };

  const updateRow = (
    index: number,
    patch: Partial<CandidateRow>,
  ) => {
    if (view.kind !== 'review') return;
    const rows = view.rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setView({ ...view, rows });
  };

  const addEmptyRow = () => {
    if (view.kind !== 'review') return;
    const empty: CandidateRow = {
      include: true,
      title: '',
      aiSuggestedTitle: '',
      aiSuggestedCategoryId: null,
      aiSuggestedParentName: null,
      userSelectedParentName: '',
      dueDate: '',
      aiSuggestedDueDate: null,
      memo: '',
      confidence: 'low',
      tagIds: [],
      assigneeUserIds: [selfUserId],
    };
    setView({ ...view, rows: [...view.rows, empty] });
  };

  const toggleRowAssignee = (index: number, userId: string) => {
    if (view.kind !== 'review') return;
    const rows = view.rows.map((r, i) => {
      if (i !== index) return r;
      const has = r.assigneeUserIds.includes(userId);
      if (has) {
        // 0 名にはしない (本人を 1 名以上残す UX を確保するが、教員判断で本人除外も可)
        return {
          ...r,
          assigneeUserIds: r.assigneeUserIds.filter((id) => id !== userId),
        };
      }
      if (r.assigneeUserIds.length >= 10) return r;
      return { ...r, assigneeUserIds: [...r.assigneeUserIds, userId] };
    });
    setView({ ...view, rows });
  };

  const removeRow = (index: number) => {
    if (view.kind !== 'review') return;
    const rows = view.rows.filter((_, i) => i !== index);
    setView({ ...view, rows });
  };

  const handleConfirm = async () => {
    if (view.kind !== 'review') return;
    setError(null);
    const includedRows = view.rows.filter((r) => r.include);
    // バリデーション: カテゴリ未選択を弾く
    const unset = includedRows.find((r) => r.userSelectedParentName === '');
    if (unset) {
      setError('カテゴリを選んでいない候補があります。「カテゴリを選んでください」と表示されている行を確認してください。');
      return;
    }
    const unassigned = includedRows.find((r) => r.assigneeUserIds.length === 0);
    if (unassigned) {
      setError('担当者が 0 名の候補があります。1 名以上選んでください。');
      return;
    }
    setView({ kind: 'confirming' });
    try {
      const res = await fetch('/api/ai-chat/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          sessionId: view.sessionId,
          selectedTasks: includedRows.map((r) => ({
            title: r.title.trim(),
            aiSuggestedTitle: r.aiSuggestedTitle,
            aiSuggestedCategoryId: r.aiSuggestedCategoryId,
            aiSuggestedDueDate: r.aiSuggestedDueDate,
            userSelectedParentName: r.userSelectedParentName,
            dueDate: r.dueDate || null,
            memo: r.memo,
            tagIds: r.tagIds,
            assigneeUserIds: r.assigneeUserIds,
          })),
          inputSnippet: view.inputSnippet,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? '作成に失敗しました。');
        setView({ ...view, kind: 'review' });
        return;
      }
      const { factLine, suggestionLine } = makeHitokoto(
        includedRows.map((r) => ({
          dueDate: r.dueDate,
          userSelectedParentName: r.userSelectedParentName,
        })),
      );
      // 編集なし & 破棄なしのときは聞くことがないので survey をスキップ
      const needsFeedback = Boolean(data.hasEdits) || pendingDiscardSessionId !== null;
      if (needsFeedback) {
        setView({
          kind: 'survey',
          sessionId: view.sessionId,
          createdCount: data.createdCount ?? 0,
          hasEdits: Boolean(data.hasEdits),
          pendingDiscardSessionId,
          factLine,
          suggestionLine,
        });
      } else {
        setView({
          kind: 'thanks',
          createdCount: data.createdCount ?? 0,
          factLine,
          suggestionLine,
        });
      }
      setInput('');
    } catch {
      setError('通信に失敗しました。');
      setView({ ...view, kind: 'review' });
    }
  };

  // 「前に戻る」: 即座に idle に戻し、textarea を保持。reason はアンケート時に併設で聞く。
  const handleStartDiscard = async () => {
    if (view.kind !== 'review') return;
    const sessionId = view.sessionId;
    setError(null);
    setPendingDiscardSessionId(sessionId);
    setView({ kind: 'idle' });
    try {
      await fetch('/api/ai-chat/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'discard', sessionId }),
      });
    } catch {
      // discard はベストエフォート (reason は後でアンケート画面で送る)
    }
  };

  const updateDiscardReason = async (
    sessionId: string,
    reason: DiscardReason,
    reasonText: string,
  ) => {
    try {
      await fetch('/api/ai-chat/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'discard',
          sessionId,
          discardReason: reason,
          ...(reason === 'other' && reasonText.trim()
            ? { discardReasonText: reasonText.trim() }
            : {}),
        }),
      });
    } catch {
      // ベストエフォート
    }
  };

  return (
    <section
      data-testid="rough-capture-section"
      className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-gray-800">
            タスクを書き出す
          </h2>
          <span className="text-[11px] text-gray-400">β</span>
        </div>
        {headerRight}
      </header>

      {view.kind === 'idle' || view.kind === 'loading' ? (
        <InputView
          input={input}
          onChange={handleInputChange}
          onSubmit={handleExtract}
          loading={view.kind === 'loading'}
          canSubmit={canSubmit}
          error={error}
        />
      ) : view.kind === 'review' ? (
        <ReviewView
          rows={view.rows}
          needsConfirmation={view.needsConfirmation}
          onUpdate={updateRow}
          onAddRow={addEmptyRow}
          onRemoveRow={removeRow}
          onConfirm={handleConfirm}
          onDiscard={handleStartDiscard}
          availableTags={availableTags ?? []}
          onCreateTag={handleCreateTag}
          assigneeCandidates={assigneeCandidates}
          onToggleAssignee={toggleRowAssignee}
          error={error}
        />
      ) : view.kind === 'confirming' ? (
        <div className="py-6 text-center text-sm text-gray-500">作成しています…</div>
      ) : view.kind === 'survey' ? (
        <SurveyView
          sessionId={view.sessionId}
          createdCount={view.createdCount}
          hasEdits={view.hasEdits}
          pendingDiscardSessionId={view.pendingDiscardSessionId}
          factLine={view.factLine}
          suggestionLine={view.suggestionLine}
          onSendDiscardReason={updateDiscardReason}
          onDone={(createdCount) => {
            setPendingDiscardSessionId(null);
            setView({
              kind: 'thanks',
              createdCount,
              factLine: view.factLine,
              suggestionLine: view.suggestionLine,
            });
          }}
        />
      ) : (
        <ThanksView
          createdCount={view.createdCount}
          factLine={view.factLine}
          suggestionLine={view.suggestionLine}
          onReset={() => setView({ kind: 'idle' })}
        />
      )}
    </section>
  );
}

// ── 入力 ─────────────────────────────────────────────────────
function InputView({
  input,
  onChange,
  onSubmit,
  loading,
  canSubmit,
  error,
}: {
  input: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  canSubmit: boolean;
  error: string | null;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">{INPUT_LEAD}</p>
      <textarea
        value={input}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={2}
        maxLength={2000}
        disabled={loading}
        data-testid="rough-capture-input"
        className="w-full resize-y rounded-md border border-gray-200 px-3 py-2 text-sm placeholder:text-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-50"
      />
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || loading}
          data-testid="rough-capture-submit"
          className="h-9 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {loading ? '整理中…' : '整理する'}
        </button>
      </div>
    </div>
  );
}

// ── 候補レビュー ─────────────────────────────────────────────
function ReviewView({
  rows,
  needsConfirmation,
  onUpdate,
  onAddRow,
  onRemoveRow,
  onConfirm,
  onDiscard,
  availableTags,
  onCreateTag,
  assigneeCandidates,
  onToggleAssignee,
  error,
}: {
  rows: CandidateRow[];
  needsConfirmation: string[];
  onUpdate: (index: number, patch: Partial<CandidateRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onConfirm: () => void;
  onDiscard: () => void;
  availableTags: TaskTag[];
  onCreateTag: (name: string) => Promise<TaskTag | null>;
  assigneeCandidates: AssigneeCandidate[];
  onToggleAssignee: (index: number, userId: string) => void;
  error: string | null;
}) {
  const includedCount = useMemo(() => rows.filter((r) => r.include).length, [rows]);

  return (
    <div>
      <p className="mb-2 text-sm text-gray-600">
        {rows.length === 0
          ? '候補は見つかりませんでした。文章を変えてもう一度試してみてください。'
          : `${rows.length} 件の候補を見つけました。確認・修正して作成してください。`}
      </p>

      {needsConfirmation.length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          <div className="mb-1 font-medium">確認したいこと</div>
          <ul className="list-disc pl-5">
            {needsConfirmation.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={i}
            data-testid={`rough-capture-candidate-${i}`}
            className={`rounded-md border p-3 ${
              r.include ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={r.include}
                onChange={(e) => onUpdate(i, { include: e.target.checked })}
                className="mt-1.5"
                aria-label="この候補を作成に含める"
              />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={r.title}
                    placeholder={r.aiSuggestedTitle === '' ? '例: 児童席の配置' : ''}
                    onChange={(e) => onUpdate(i, { title: e.target.value })}
                    maxLength={200}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveRow(i)}
                    aria-label="この行を削除"
                    className="rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                  <label className="flex items-center gap-1">
                    <span>カテゴリ</span>
                    <select
                      value={r.userSelectedParentName}
                      onChange={(e) =>
                        onUpdate(i, {
                          userSelectedParentName: e.target
                            .value as ParentCategoryName | '',
                        })
                      }
                      className={`rounded border px-1.5 py-0.5 text-xs ${
                        r.userSelectedParentName === ''
                          ? 'border-red-400 text-red-700'
                          : 'border-gray-300'
                      }`}
                    >
                      <option value="">カテゴリを選んでください</option>
                      {PARENT_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    <span>期限</span>
                    <input
                      type="date"
                      value={r.dueDate}
                      onChange={(e) => onUpdate(i, { dueDate: e.target.value })}
                      className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                    />
                  </label>
                  <RowTagInput
                    tagIds={r.tagIds}
                    availableTags={availableTags}
                    onChange={(tagIds) => onUpdate(i, { tagIds })}
                    onCreateTag={onCreateTag}
                  />
                  {r.aiSuggestedParentName &&
                    r.aiSuggestedParentName !== r.userSelectedParentName && (
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">
                        AI 提案: {r.aiSuggestedParentName}
                      </span>
                    )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="whitespace-nowrap">担当者</span>
                  <div className="flex-1">
                    <AssigneePopoverInput
                      candidates={assigneeCandidates}
                      selectedUserIds={r.assigneeUserIds}
                      onToggle={(userId) => onToggleAssignee(i, userId)}
                      invalid={r.assigneeUserIds.length === 0}
                      maxSelected={10}
                      testIdPrefix={`rough-capture-row-${i}-assignees`}
                    />
                  </div>
                </div>
                {r.memo && (
                  <p className="text-xs text-gray-500">{r.memo}</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          onClick={onAddRow}
          data-testid="rough-capture-add-row"
          className="w-full rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:border-indigo-500 hover:bg-indigo-100"
        >
          + さらにタスクを追加
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          前に戻る
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={includedCount === 0}
          data-testid="rough-capture-confirm"
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          選んだタスクを作成する{includedCount > 0 ? `(${includedCount})` : ''}
        </button>
      </div>
    </div>
  );
}

// ── 行ごとのタグ入力 (期限の横に置く mini combobox) ─────────────
function RowTagInput({
  tagIds,
  availableTags,
  onChange,
  onCreateTag,
}: {
  tagIds: string[];
  availableTags: TaskTag[];
  onChange: (tagIds: string[]) => void;
  onCreateTag: (name: string) => Promise<TaskTag | null>;
}) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [focused]);

  const selectedTags = availableTags.filter((t) => tagIds.includes(t.id));
  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();
  const filtered = availableTags
    .filter(
      (t) =>
        !tagIds.includes(t.id) &&
        (normalized === '' || t.name.toLowerCase().includes(normalized)),
    )
    .slice(0, 8);
  const exactMatch = availableTags.find((t) => t.name === trimmed);

  const addTag = (id: string) => {
    if (!tagIds.includes(id)) onChange([...tagIds, id]);
    setInput('');
  };
  const removeTag = (id: string) => {
    onChange(tagIds.filter((tid) => tid !== id));
  };
  const commit = async () => {
    if (!trimmed) return;
    if (exactMatch) {
      addTag(exactMatch.id);
      return;
    }
    setCreating(true);
    try {
      const created = await onCreateTag(trimmed);
      if (created) addTag(created.id);
    } catch {
      // 作成失敗はベストエフォート
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex items-center gap-1">
      <span>タグ</span>
      <div className="flex flex-wrap items-center gap-1">
        {selectedTags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700"
          >
            #{t.name}
            <button
              type="button"
              onClick={() => removeTag(t.id)}
              className="text-indigo-500 hover:text-indigo-700"
              aria-label={`タグ ${t.name} を外す`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
          placeholder="#タグ"
          className="min-w-[64px] rounded border border-gray-300 px-1.5 py-0.5 text-xs"
        />
      </div>
      {focused && (filtered.length > 0 || trimmed.length > 0) && (
        <div className="absolute left-0 top-full z-10 mt-1 max-h-40 w-48 overflow-auto rounded-md border border-gray-200 bg-white text-xs shadow-md">
          {filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(t.id)}
              className="block w-full px-2 py-1 text-left hover:bg-indigo-50"
            >
              #{t.name}
            </button>
          ))}
          {!exactMatch && trimmed.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void commit()}
              disabled={creating}
              className="block w-full border-t border-gray-100 px-2 py-1 text-left text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
            >
              {creating ? '作成中…' : `+ 「${trimmed}」を作成`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── 直後アンケート (前に戻る reason + 編集 reason も併設で聞く) ─
function SurveyView({
  sessionId,
  createdCount,
  hasEdits,
  pendingDiscardSessionId,
  factLine,
  suggestionLine,
  onSendDiscardReason,
  onDone,
}: {
  sessionId: string;
  createdCount: number;
  hasEdits: boolean;
  pendingDiscardSessionId: string | null;
  factLine: string;
  suggestionLine: string;
  onSendDiscardReason: (
    sessionId: string,
    reason: DiscardReason,
    text: string,
  ) => Promise<void>;
  onDone: (createdCount: number) => void;
}) {
  const [discardReason, setDiscardReason] = useState<DiscardReason | null>(null);
  const [discardReasonText, setDiscardReasonText] = useState('');
  const [editReason, setEditReason] = useState<DiscardReason | null>(null);
  const [editReasonText, setEditReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasAnyInput = editReason !== null || discardReason !== null;

  const submit = async () => {
    setSubmitting(true);
    const tasks: Promise<unknown>[] = [];
    if (editReason) {
      tasks.push(
        fetch('/api/ai-chat/feedback', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            editReason,
            ...(editReason === 'other' && editReasonText.trim()
              ? { editReasonText: editReasonText.trim() }
              : {}),
          }),
        }).catch(() => undefined),
      );
    }
    if (pendingDiscardSessionId && discardReason) {
      tasks.push(
        onSendDiscardReason(pendingDiscardSessionId, discardReason, discardReasonText),
      );
    }
    await Promise.all(tasks);
    onDone(createdCount);
  };

  const skip = () => onDone(createdCount);

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
      <p className="text-[15px] font-medium leading-relaxed text-slate-700">
        <span className="text-indigo-600">{createdCount}件のタスク</span>
        を作成しました。
        {factLine ? ` ${factLine}` : ''}
        {suggestionLine ? ` ${suggestionLine}` : ''}
      </p>
      {pendingDiscardSessionId && (
        <ReasonPanel
          title="途中で戻った整理について"
          subtitle="よければ、どこが少し合わなかったか教えてください"
          selected={discardReason}
          onSelect={setDiscardReason}
          reasonText={discardReasonText}
          onChangeReasonText={setDiscardReasonText}
          radioName="discard-reason"
          testIdPrefix="rough-capture-discard-reason"
        />
      )}
      {hasEdits && (
        <ReasonPanel
          title="気になったところがあれば教えてください"
          subtitle="(直したのは、どこが少し合わなかったから？任意)"
          selected={editReason}
          onSelect={setEditReason}
          reasonText={editReasonText}
          onChangeReasonText={setEditReasonText}
          radioName="edit-reason"
          testIdPrefix="rough-capture-edit-reason"
        />
      )}
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={skip}
          className="h-12 min-w-[128px] rounded-xl border-[1.5px] border-gray-300 bg-white text-[15px] font-medium text-slate-500 transition hover:border-slate-400 hover:bg-slate-50"
        >
          回答しない
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!hasAnyInput || submitting}
          className="h-12 min-w-[128px] rounded-xl bg-indigo-600 text-[15px] font-medium text-white shadow-[0_8px_18px_rgba(79,70,229,0.2)] transition hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_10px_22px_rgba(79,70,229,0.26)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {submitting ? '送信中…' : '送信する'}
        </button>
      </div>
    </div>
  );
}

// ── reason 入力エリア (前に戻る / 編集 共通の見た目) ────────────
function ReasonPanel({
  title,
  subtitle,
  selected,
  onSelect,
  reasonText,
  onChangeReasonText,
  radioName,
  testIdPrefix,
}: {
  title: string;
  subtitle: string;
  selected: DiscardReason | null;
  onSelect: (r: DiscardReason) => void;
  reasonText: string;
  onChangeReasonText: (s: string) => void;
  radioName: string;
  testIdPrefix: string;
}) {
  return (
    <fieldset
      className="mt-7 rounded-xl border border-slate-200 bg-slate-50/50 p-5"
      style={{
        animation: 'roughCaptureFadeIn 0.18s ease-out',
      }}
    >
      <legend className="px-1 text-[15px] font-medium text-slate-700">
        {title}
      </legend>
      <p className="mb-4 text-sm font-semibold text-slate-400">{subtitle}</p>
      <div className="flex flex-wrap gap-2.5">
        {DISCARD_REASON_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`cursor-pointer rounded-full border-[1.5px] px-4 py-2.5 text-sm font-medium leading-none transition ${
              selected === opt.value
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-100'
            }`}
          >
            <input
              type="radio"
              name={radioName}
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => onSelect(opt.value)}
              className="sr-only"
              data-testid={`${testIdPrefix}-${opt.value}`}
            />
            {opt.label}
          </label>
        ))}
      </div>
      {selected === 'other' && (
        <textarea
          value={reasonText}
          onChange={(e) => onChangeReasonText(e.target.value)}
          placeholder="差し支えなければ、もう少し教えてください"
          rows={3}
          maxLength={500}
          className="mt-4 w-full resize-y rounded-xl border-[1.5px] border-slate-300 bg-white px-4 py-3.5 text-[15px] font-semibold leading-relaxed text-slate-700 placeholder:text-slate-400 transition focus:border-indigo-400 focus:outline-none focus:ring-[3px] focus:ring-indigo-200/40"
        />
      )}
      <style jsx>{`
        @keyframes roughCaptureFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </fieldset>
  );
}

function ScaleField({
  label,
  leftLabel,
  rightLabel,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number | null;
  onChange: (v: number) => void;
  testIdPrefix: string;
}) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
      <legend className="px-1 text-[15px] font-medium text-slate-700">
        {label}
      </legend>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="whitespace-nowrap text-[15px] font-medium text-slate-400">
          {leftLabel}
        </span>
        <div className="flex gap-2.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name={testIdPrefix}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                className="sr-only"
                data-testid={`${testIdPrefix}-${n}`}
              />
              <span
                aria-hidden
                aria-pressed={value === n}
                className={`flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] text-xl font-medium transition ${
                  value === n
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-[0_8px_18px_rgba(79,70,229,0.22)]'
                    : 'border-slate-300 bg-white text-slate-500 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                {n}
              </span>
            </label>
          ))}
        </div>
        <span className="whitespace-nowrap text-[15px] font-medium text-slate-400">
          {rightLabel}
        </span>
      </div>
    </fieldset>
  );
}

// ── 完了 ─────────────────────────────────────────────────────
function ThanksView({
  createdCount,
  factLine,
  suggestionLine,
  onReset,
}: {
  createdCount: number;
  factLine: string;
  suggestionLine: string;
  onReset: () => void;
}) {
  // 5 秒後に idle に戻す
  useEffect(() => {
    const t = setTimeout(onReset, 5000);
    return () => clearTimeout(t);
  }, [onReset]);

  return (
    <div className="py-2">
      {(factLine || suggestionLine) && (
        <p className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-3 text-xs leading-relaxed text-indigo-800">
          <span className="font-medium text-indigo-700">
            {createdCount}件のタスクを作成しました。
          </span>
          {factLine ? ` ${factLine}` : ''}
          {suggestionLine ? ` ${suggestionLine}` : ''}
        </p>
      )}
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-indigo-600 hover:underline"
        >
          続けて書く
        </button>
      </div>
    </div>
  );
}
