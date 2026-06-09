import { useState } from 'react';
import { Smile, Eye } from 'lucide-react';
import type {
  StudentDto,
  BatonNoteDto,
  StudentReactionDto,
  StudentReactionType,
} from '../types';
import { BatonNoteItem } from './BatonNoteItem';

interface StudentRowProps {
  student: StudentDto;
  notes: BatonNoteDto[];
  reactions: StudentReactionDto[];
  currentUserId: string;
  nameById: Map<string, string>;
  onToggleReaction: (studentId: string, type: StudentReactionType) => void;
  onAddNote: (studentId: string, content: string) => Promise<void>;
  onEditNote: (id: string, content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}

const REACTIONS: {
  type: StudentReactionType;
  label: string;
  Icon: typeof Smile;
}[] = [
  { type: 'positive', label: 'ポジティブ', Icon: Smile },
  { type: 'concern', label: '気になる', Icon: Eye },
];

// 1 生徒の欄。印 (2 種トグル) + その日の一言 + 一言追加。
// 踏み絵: 印はトグルのまま。生徒を数値で採点・並べ替えしない (並びはロスター順固定)。
export function StudentRow({
  student,
  notes,
  reactions,
  currentUserId,
  nameById,
  onToggleReaction,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: StudentRowProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const submitNote = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onAddNote(student.id, trimmed);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-vn border border-vn-border bg-white p-3.5">
      {/* 氏名 + 学年 */}
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold text-slate-800">
          {student.displayName}
        </span>
        {student.gradeLabel && (
          <span className="text-xs text-gray-400">{student.gradeLabel}</span>
        )}
      </div>

      {/* 印 (2 種トグル) */}
      <div className="mt-2 flex flex-wrap gap-2">
        {REACTIONS.map(({ type, label, Icon }) => {
          const ofType = reactions.filter((r) => r.reactionType === type);
          const mine = ofType.some((r) => r.userId === currentUserId);
          const count = ofType.length;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onToggleReaction(student.id, type)}
              aria-pressed={mine}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors ${
                mine
                  ? 'bg-vn-accent/10 text-vn-accent'
                  : 'bg-vn-muted-bg text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden />
              <span>{label}</span>
              {count > 0 && <span className="text-xs">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* その日の一言 */}
      {notes.length > 0 && (
        <ul className="mt-2.5 border-t border-vn-border pt-1.5">
          {notes.map((note) => (
            <BatonNoteItem
              key={note.id}
              note={note}
              authorName={
                note.authorUserId
                  ? nameById.get(note.authorUserId) ?? 'ほかの先生'
                  : 'ほかの先生'
              }
              isMine={note.authorUserId === currentUserId}
              onEdit={onEditNote}
              onDelete={onDeleteNote}
            />
          ))}
        </ul>
      )}

      {/* 一言を残す (append) */}
      <div className="mt-2.5 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submitNote();
            }
          }}
          placeholder="ひとことを残す…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-base placeholder:text-gray-400 focus:border-vn-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={submitNote}
          disabled={busy || !draft.trim()}
          className="flex-shrink-0 rounded-md bg-vn-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-vn-accent/90 disabled:opacity-40"
        >
          残す
        </button>
      </div>
    </div>
  );
}
