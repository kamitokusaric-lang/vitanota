// 選んだ生徒の一括操作バー。生徒を1人以上選んだときだけ出る。
//
//   クラス移動 … 入れるクラスを間違えたとき / クラス替え
//   アーカイブ … 転校・卒業で在籍が終わったとき (left_at が入る)
//   削除      … 誤って登録したとき。**その子の印象・コメントも一緒に消える**
//
// 削除は取り消せないので、確定前に「生徒 n 人・印象 m 件が消える」と合計を見せる。
// ブラウザ標準の confirm() は使わない (ダイアログでセッションが固まる事故を避ける)。
import { useState } from 'react';
import { Trash2, Archive, FolderInput, X } from 'lucide-react';
import type { ClassDto } from '../types';

export function StudentBulkBar({
  selectedCount,
  noteCountTotal,
  classes,
  currentClassId,
  busy,
  onClear,
  onMove,
  onArchive,
  onDelete,
}: {
  selectedCount: number;
  /** 選択中の生徒に付いた印象・コメントの合計 (削除確認で見せる)。 */
  noteCountTotal: number;
  classes: ClassDto[];
  currentClassId: string | null;
  busy: boolean;
  onClear: () => void;
  onMove: (toClassId: string) => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<'delete' | 'archive' | null>(null);
  const [moving, setMoving] = useState(false);

  if (selectedCount === 0) return null;

  const otherClasses = classes.filter((c) => c.id !== currentClassId);

  return (
    <div
      className="sticky bottom-3 z-20 rounded-vn border border-vn-accent/30 bg-white p-3 shadow-lg"
      data-testid="student-bulk-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-700" data-testid="student-bulk-count">
          {selectedCount}人を選択中
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="選択を解除"
          className="rounded-full p-1 text-slate-400 transition hover:bg-vn-muted-bg hover:text-slate-600"
          data-testid="student-bulk-clear"
        >
          <X size={14} strokeWidth={2.5} aria-hidden />
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {otherClasses.length > 0 && (
            <button
              type="button"
              onClick={() => setMoving((m) => !m)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-vn-border px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-vn-muted-bg disabled:opacity-40"
              data-testid="student-bulk-move"
            >
              <FolderInput size={14} strokeWidth={2} aria-hidden />
              クラス移動
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirm('archive')}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-40"
            data-testid="student-bulk-archive"
          >
            <Archive size={14} strokeWidth={2} aria-hidden />
            アーカイブ
          </button>
          <button
            type="button"
            onClick={() => setConfirm('delete')}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-vn-danger-border px-3 py-1.5 text-xs font-medium text-vn-danger-text transition hover:bg-vn-danger-bg disabled:opacity-40"
            data-testid="student-bulk-delete"
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden />
            削除
          </button>
        </div>
      </div>

      {/* 移動先のクラスを選ぶ */}
      {moving && (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="student-bulk-move-targets">
          {otherClasses.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={async () => {
                setMoving(false);
                await onMove(c.id);
              }}
              disabled={busy}
              className="rounded-full border border-vn-border px-3 py-1 text-xs text-slate-600 transition hover:bg-vn-muted-bg disabled:opacity-40"
              data-testid={`student-bulk-move-to-${c.id}`}
            >
              {c.name} へ移動
            </button>
          ))}
        </div>
      )}

      {/* 確認。削除は取り消せないので、消えるものの合計を見せる。 */}
      {confirm && (
        <div
          className="mt-2 rounded-md bg-vn-muted-bg/60 px-3 py-2"
          data-testid={`student-bulk-confirm-${confirm}`}
        >
          <p className="text-xs leading-[1.7] text-slate-600">
            {confirm === 'delete' ? (
              <>
                間違えて登録したときに使います。
                <br />
                <span className="font-semibold text-vn-danger-text">
                  生徒 {selectedCount} 人
                  {noteCountTotal > 0 && `と、印象・コメント ${noteCountTotal} 件`}
                  が消えます。取り消せません。
                </span>
              </>
            ) : (
              <>
                転校・卒業などで在籍が終わったときに使います。
                <br />
                日々のリストから外します。あとで復元できます。
              </>
            )}
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={async () => {
                const action = confirm;
                setConfirm(null);
                if (action === 'delete') await onDelete();
                else await onArchive();
              }}
              disabled={busy}
              className={`rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40 ${
                confirm === 'delete'
                  ? 'bg-vn-red hover:opacity-90'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
              data-testid={`student-bulk-confirm-${confirm}-ok`}
            >
              {confirm === 'delete' ? '削除を確定' : 'アーカイブを確定'}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className="rounded-md px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100"
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
