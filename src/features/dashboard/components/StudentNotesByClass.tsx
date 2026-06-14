// 生徒ノート (朝バトンのクラス)。chimo 2026-06-14: クラスごとのカード型タブで切替し、
// 各タブの中身に朝バトンの記入画面 (BatonRelayBoard) をそのまま埋め込む。
// クラスが無いときは CSV 取り込み + クラス/生徒追加をそのまま出す。
import { useEffect, useMemo, useState } from 'react';
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
    await mutateClasses();
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
          const active = c.id === selectedClassId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedClassId(c.id)}
              className={`-mb-px rounded-t-lg border px-4 py-2.5 text-sm transition-colors ${
                active
                  ? 'border-vn-border border-b-white bg-white font-bold text-slate-800'
                  : 'border-transparent bg-slate-100 font-medium text-slate-500 hover:bg-slate-200'
              }`}
              data-testid={`student-notes-tab-${c.id}`}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      {/* 選択中クラスの朝バトン記入画面をそのまま埋め込む (クラス選択はタブ側) */}
      {selectedClassId && (
        <div className="pt-4">
          <BatonRelayBoard
            currentUserId={selfUserId}
            todayDate={todayDate}
            classId={selectedClassId}
          />
        </div>
      )}
    </div>
  );
}
