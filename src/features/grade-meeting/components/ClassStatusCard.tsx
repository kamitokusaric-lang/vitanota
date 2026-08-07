// クラス状況カード — 紙の OODA 記録シートをクラスに当てたもの。
//
//   前回の一手 (表示だけ・達成度は採らない)
//   観察     「事実として、何が見える?」   複数行
//   状況判断 「その事実は、何を意味する?」 複数行 (1つに畳まない)
//   次の一手 「だから、次に何をどこまでやる?」 1つだけ
//
// ★ 無記名。誰が出したかをどこにも描かない。
//   「まだ出していない人」も出さない (提出率を作らない)。
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CLASS_NOTE_SECTIONS, type ClassNoteKind } from '../constants';
import type { ClassNoteDto, GradeClassDto } from '../hooks/useGradeMeeting';
import { ClassMaterialNotes } from './ClassMaterialNotes';

export function ClassStatusCard({
  klass,
  notes,
  previousAction,
  period,
  onAdd,
  onDelete,
  readOnly = false,
}: {
  klass: GradeClassDto;
  /** このクラスの卓上 (無記名)。 */
  notes: ClassNoteDto[];
  /** 前回の会で決めた一手。無ければ null。 */
  previousAction: ClassNoteDto | null;
  /** 表示中の週 (材料として出す生徒ノートの期間)。 */
  period: { from: string; to: string };
  onAdd: (kind: ClassNoteKind, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  readOnly?: boolean;
}) {
  const action = notes.find((n) => n.kind === 'action') ?? null;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-vn-border bg-white shadow-sm"
      data-testid={`class-status-card-${klass.id}`}
    >
      {/* クラス目標は学年会の見出し直下にまとめて出すので、ここには重ねない
          (truncate された同じ文言が2箇所に出るのを避ける)。 */}
      <div className="flex items-baseline gap-2 border-b border-vn-border bg-vn-muted-bg/40 px-4 py-2.5">
        <h3 className="text-[15px] font-bold text-slate-800">{klass.name}</h3>
      </div>

      <div className="space-y-5 px-4 py-4">
        {/* 前回の一手 — 表示するだけ。できた/できなかったは採らない
            (クラス単位で溜まると遂行評価に化けるため)。 */}
        {previousAction && (
          <div
            className="rounded-xl bg-vn-muted-bg/60 px-3.5 py-2.5"
            data-testid={`class-previous-action-${klass.id}`}
          >
            <p className="text-[11px] font-semibold text-slate-500">前回の一手</p>
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-slate-700">
              {previousAction.content}
            </p>
          </div>
        )}

        {/* 材料: この週の生徒ノート。観察を書く直前に置いて、見ながら書けるようにする。
            非同期で溜めたものを同期の場の卓上に出す受け渡し。 */}
        <ClassMaterialNotes classId={klass.id} period={period} />

        {CLASS_NOTE_SECTIONS.map((section) => {
          const rows =
            section.kind === 'action'
              ? action
                ? [action]
                : []
              : notes.filter((n) => n.kind === section.kind);
          return (
            <NoteSection
              key={section.kind}
              classId={klass.id}
              label={section.label}
              question={section.question}
              hint={section.hint}
              kind={section.kind}
              rows={rows}
              onAdd={onAdd}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          );
        })}
      </div>
    </div>
  );
}

function NoteSection({
  classId,
  label,
  question,
  hint,
  kind,
  rows,
  onAdd,
  onDelete,
  readOnly,
}: {
  classId: string;
  label: string;
  question: string;
  hint: string;
  kind: ClassNoteKind;
  rows: ClassNoteDto[];
  onAdd: (kind: ClassNoteKind, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const isAction = kind === 'action';

  const submit = async () => {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      await onAdd(kind, content);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid={`class-note-section-${classId}-${kind}`}>
      <div className="flex items-baseline gap-2">
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
            isAction
              ? 'bg-vn-accent-bg text-vn-accent-text'
              : 'bg-vn-muted-bg text-slate-600'
          }`}
        >
          {label}
        </span>
        <p className="min-w-0 text-[13px] font-semibold text-slate-700">
          {question}
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="mt-2 space-y-1.5" data-testid={`class-note-list-${classId}-${kind}`}>
          {rows.map((n) => (
            <li
              key={n.id}
              className="group flex items-start gap-2 rounded-xl bg-vn-muted-bg/40 px-3.5 py-2"
            >
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-slate-700">
                {n.content}
              </p>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onDelete(n.id)}
                  aria-label="引っ込める"
                  className="shrink-0 rounded-full p-1 text-slate-300 transition hover:bg-white hover:text-slate-500"
                  data-testid={`class-note-delete-${n.id}`}
                >
                  <X size={13} strokeWidth={2.5} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="mt-2 flex items-start gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={hint}
            maxLength={1000}
            rows={2}
            className="min-w-0 flex-1 resize-none rounded-xl border border-vn-border bg-white px-3 py-2 text-[13px] leading-[1.7] text-slate-900 placeholder:text-slate-400 focus:border-vn-accent focus:outline-none"
            data-testid={`class-note-input-${classId}-${kind}`}
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !draft.trim()}
            aria-label={isAction ? '決める' : '出す'}
            className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-vn-accent px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:opacity-40"
            data-testid={`class-note-submit-${classId}-${kind}`}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden />
            {isAction ? '決める' : '出す'}
          </button>
        </div>
      )}
    </section>
  );
}
