// 生徒ノート (朝バトンのクラス)。chimo 2026-06-14: クラスごとのカード型タブで切替し、
// 各タブの中身に朝バトンの記入画面 (BatonRelayBoard) をそのまま埋め込む。
// クラスが無いときは CSV 取り込み + クラス/生徒追加をそのまま出す。
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useToast } from '@/shared/components/Toast';
import { useClasses } from '@/features/baton-relay/hooks/useBatonRelay';
import { BatonRelayBoard } from '@/features/baton-relay/components/BatonRelayBoard';
import { RosterAdd } from '@/features/baton-relay/components/RosterAdd';

interface StudentNotesByClassProps {
  selfUserId: string;
  todayDate: string; // YYYY-MM-DD (SSR で確定)
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function StudentNotesByClass({ selfUserId, todayDate }: StudentNotesByClassProps) {
  const { classes, isLoading, mutate: mutateClasses } = useClasses();
  const { showToast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  // 「＋」タブ選択中はクラス追加フォームをタブ内に出す (クラス選択とは排他)。
  const [addingClass, setAddingClass] = useState(false);

  // タブは左→右にクラス名の昇順 (「10組」が「2組」の後に来るよう数値対応の collation)。
  const sortedClasses = useMemo(
    () =>
      [...classes].sort((a, b) =>
        a.name.localeCompare(b.name, 'ja', { numeric: true }),
      ),
    [classes],
  );

  useEffect(() => {
    if (!selectedClassId && sortedClasses.length > 0) {
      setSelectedClassId(sortedClasses[0].id);
    }
  }, [sortedClasses, selectedClassId]);

  const handleCreateClass = async (name: string, goalText: string) => {
    const res = await postJson('/api/baton-relay/classes', {
      name,
      goalText: goalText || undefined,
    });
    if (!res.ok) {
      showToast('クラスの作成に失敗しました', 'error');
      return;
    }
    const { class: created } = (await res.json()) as { class: { id: string } };
    await mutateClasses();
    // 追加したクラスのタブへ切替え、追加モードを閉じる
    // (新規クラスの記入画面 = 最下部は生徒追加フォームだけになる)。
    setSelectedClassId(created.id);
    setAddingClass(false);
    showToast('クラスを作りました', 'success');
  };

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-gray-400">読み込み中…</p>;
  }

  // クラスが無いとき: 取り込み / 追加をそのまま出す
  if (classes.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          まだクラスがありません。下からクラスを追加して始められます。
        </p>
        <RosterAdd classes={classes} onCreateClass={handleCreateClass} />
      </div>
    );
  }

  return (
    <div>
      {/* クラスごとのカード型タブ */}
      <div className="flex flex-wrap gap-1 border-b border-vn-border" role="tablist">
        {sortedClasses.map((c) => {
          const active = !addingClass && c.id === selectedClassId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setSelectedClassId(c.id);
                setAddingClass(false);
              }}
              className={`-mb-px rounded-t-lg border px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'border-vn-border border-b-vn-surface bg-vn-surface font-bold text-slate-800'
                  : 'border-transparent bg-transparent font-medium text-slate-500 hover:text-slate-700'
              }`}
              data-testid={`student-notes-tab-${c.id}`}
            >
              {c.name}
            </button>
          );
        })}
        {/* クラス追加タブ (押すとタブ内にクラス追加フォームを出す) */}
        <button
          type="button"
          role="tab"
          aria-selected={addingClass}
          aria-label="クラスを追加"
          onClick={() => setAddingClass(true)}
          className={`-mb-px flex items-center rounded-t-lg border px-3 py-2.5 text-sm transition-colors ${
            addingClass
              ? 'border-vn-border border-b-vn-surface bg-vn-surface font-bold text-slate-800'
              : 'border-transparent bg-transparent font-medium text-slate-500 hover:text-slate-700'
          }`}
          data-testid="student-notes-tab-add"
        >
          <Plus size={16} aria-hidden />
        </button>
      </div>

      {/* 「＋」タブ選択中はクラス追加フォーム、それ以外は選択中クラスの記入画面 */}
      {addingClass ? (
        <div className="pt-4">
          <RosterAdd classes={classes} onCreateClass={handleCreateClass} alwaysOpen />
        </div>
      ) : (
        selectedClassId && (
          <div className="pt-4">
            <BatonRelayBoard
              currentUserId={selfUserId}
              todayDate={todayDate}
              classId={selectedClassId}
            />
          </div>
        )
      )}
    </div>
  );
}
