import { useEffect, useRef, useState } from 'react';
import { Smile, Eye, MoreVertical, Check, X } from 'lucide-react';
import type {
  StudentDto,
  BatonNoteDto,
  StudentReactionDto,
  StudentReactionType,
  ClassDto,
} from '../types';
import { BatonNoteItem } from './BatonNoteItem';

interface StudentRowProps {
  student: StudentDto;
  notes: BatonNoteDto[];
  reactions: StudentReactionDto[];
  currentUserId: string;
  nameById: Map<string, string>;
  classes: ClassDto[];
  onToggleReaction: (studentId: string, type: StudentReactionType) => void;
  onMoveStudent: (studentId: string, newClassId: string) => Promise<void>;
  onRenameStudent: (studentId: string, displayName: string) => Promise<void>;
  onArchiveStudent: (studentId: string) => Promise<void>;
  onAddNote: (studentId: string, content: string) => Promise<void>;
  onEditNote: (id: string, content: string) => Promise<void>;
  onDeleteNote: (id: string) => Promise<void>;
}

const REACTIONS: {
  type: StudentReactionType;
  label: string;
  Icon: typeof Smile;
}[] = [
  { type: 'positive', label: 'Good', Icon: Smile },
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
  classes,
  onToggleReaction,
  onMoveStudent,
  onRenameStudent,
  onArchiveStudent,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: StudentRowProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる (アーカイブ確認状態もリセット)
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setArchiveConfirm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const startEditName = () => {
    setNameDraft(student.displayName);
    setEditingName(true);
    setMenuOpen(false);
    setArchiveConfirm(false);
  };

  const submitName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === student.displayName) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      await onRenameStudent(student.id, trimmed);
      setEditingName(false);
    } finally {
      setBusy(false);
    }
  };

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
      {/* 氏名 (編集中はインライン入力) + リアクション + 3 点リーダー を 1 行に */}
      <div className="flex items-center gap-2">
        {editingName ? (
          <div className="flex flex-1 items-center gap-1.5">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submitName();
                } else if (e.key === 'Escape') {
                  setEditingName(false);
                }
              }}
              autoFocus
              maxLength={50}
              aria-label="生徒名"
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-base focus:border-vn-accent focus:outline-none"
              data-testid={`student-name-input-${student.id}`}
            />
            <button
              type="button"
              onClick={submitName}
              disabled={busy || !nameDraft.trim()}
              aria-label="名前を保存"
              className="flex-shrink-0 rounded-md p-1.5 text-vn-accent hover:bg-vn-accent/10 disabled:opacity-40"
              data-testid={`student-name-save-${student.id}`}
            >
              <Check size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              aria-label="編集をやめる"
              className="flex-shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
        ) : (
          <span className="text-base font-semibold text-slate-800">
            {student.displayName}
          </span>
        )}
        {!editingName && (
          <div className="ml-auto flex items-center gap-1.5">
            {REACTIONS.map(({ type, label, Icon }) => {
              const ofType = reactions.filter((r) => r.reactionType === type);
              const mine = ofType.some((r) => r.userId === currentUserId);
              const count = ofType.length;
              // 誰が押したか (フォーカス/ホバーで tips 表示)。
              const names = ofType.map((r) =>
                r.userId === currentUserId ? '自分' : nameById.get(r.userId) ?? 'ほかの先生',
              );
              return (
                <div key={type} className="group relative">
                  <button
                    type="button"
                    onClick={() => onToggleReaction(student.id, type)}
                    aria-pressed={mine}
                    className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm font-medium transition-colors ${
                      mine
                        ? 'bg-vn-accent/10 text-vn-accent'
                        : 'bg-vn-muted-bg text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon size={16} strokeWidth={1.75} aria-hidden />
                    <span>{label}</span>
                    {count > 0 && <span className="text-xs">{count}</span>}
                  </button>
                  {names.length > 0 && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      {names.join('、')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="生徒メニュー"
            aria-expanded={menuOpen}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            data-testid={`student-menu-${student.id}`}
          >
            <MoreVertical size={16} aria-hidden />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={startEditName}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                data-testid={`student-rename-${student.id}`}
              >
                氏名を編集
              </button>
              <div className="my-1 border-t border-gray-100" />
              <div className="px-3 py-1 text-[11px] font-medium text-gray-400">
                クラスを変更
              </div>
              {classes.filter((c) => c.id !== student.classId).length === 0 ? (
                <div className="px-3 py-1.5 text-xs text-gray-400">
                  他のクラスがありません
                </div>
              ) : (
                classes
                  .filter((c) => c.id !== student.classId)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void onMoveStudent(student.id, c.id);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      data-testid={`student-move-${student.id}-${c.id}`}
                    >
                      {c.name} へ移動
                    </button>
                  ))
              )}
              <div className="my-1 border-t border-gray-100" />
              {archiveConfirm ? (
                <div className="px-3 py-1.5">
                  <p className="mb-1.5 text-xs text-gray-500">
                    日々のリストから外します。あとで復元できます。
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setArchiveConfirm(false);
                        void onArchiveStudent(student.id);
                      }}
                      className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
                      data-testid={`student-archive-confirm-${student.id}`}
                    >
                      アーカイブを確定
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchiveConfirm(false)}
                      className="rounded-md px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100"
                    >
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setArchiveConfirm(true)}
                  className="block w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50"
                  data-testid={`student-archive-${student.id}`}
                >
                  アーカイブする
                </button>
              )}
            </div>
          )}
        </div>
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
