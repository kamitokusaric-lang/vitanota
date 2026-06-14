import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
import type { BatonNoteDto } from '../types';

interface BatonNoteItemProps {
  note: BatonNoteDto;
  authorName: string;
  isMine: boolean;
  onEdit: (id: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// 生徒欄の一言 1 件。自分の行だけ編集/削除できる (引き継ぎの可読性のため著者を表示)。
export function BatonNoteItem({
  note,
  authorName,
  isMine,
  onEdit,
  onDelete,
}: BatonNoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === note.content) {
      setEditing(false);
      setDraft(note.content);
      return;
    }
    setBusy(true);
    try {
      await onEdit(note.id, trimmed);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-start gap-2 py-1.5 text-[15px] leading-relaxed text-slate-700">
      {editing ? (
        <div className="flex w-full items-center gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-base focus:border-vn-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={busy}
            aria-label="保存"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-vn-accent hover:bg-vn-accent/10"
          >
            <Check size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(note.content);
            }}
            aria-label="キャンセル"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {note.content}
            <span className="ml-1.5 text-xs text-gray-400">— {authorName}</span>
          </span>
          {isMine && (
            <span className="flex flex-shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="編集"
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(note.id)}
                aria-label="削除"
                className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={15} />
              </button>
            </span>
          )}
        </>
      )}
    </li>
  );
}
