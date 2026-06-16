// 職員室ボード (H7-B / 学校知の循環の出口) のメイン。
// diary 以外の kind を箱に並べて表示する。モバイルファースト。
// 起票も反応もしない読み取り専用 (chimo: 入力は右サイド入口、リアクションは右レーンに一本化)。
// 「なるほど」リアクションは右レーンで付き、ここではその集計 (役に立つ情報) を表示するだけ。
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { useBoards, useTeacherNames } from '../hooks/useStaffroom';
import type { BoardDto, StaffroomBoxKind } from '../types';
import { BOARD_KIND_META, BOX_KIND_ORDER } from './boardMeta';
import { BoardCard } from './BoardCard';
import { StudentSupportSection } from './StudentSupportSection';
import {
  StaffroomPeriodFilter,
  getDefaultBoardPeriod,
  type BoardPeriod,
} from './StaffroomPeriodFilter';

// 読み取り専用 (起票・反応・削除なし) になったため props 不要 (chimo 2026-06-13)。
export function StaffroomBoard() {
  // 投稿日の期間フィルタ (既定: 今週)。chimo 2026-06-14。
  const [period, setPeriod] = useState<BoardPeriod>(() => getDefaultBoardPeriod());
  const { boards, isLoading, error } = useBoards('all', period);
  const nameById = useTeacherNames();

  // kind ごとに 6 箱へ振り分け
  const byKind = useMemo(() => {
    const map = new Map<StaffroomBoxKind, BoardDto[]>();
    for (const k of BOX_KIND_ORDER) map.set(k, []);
    for (const b of boards) {
      // まずは自分の kind の箱へ
      map.get(b.boardKind)?.push(b);
      // ナレッジ箱は「なるほど」(knowledge リアクション) が付いた投稿の自動集計
      // (chimo 2026-06-13: knowledge は手動投稿をやめ、なるほどの集計に変更)。
      // knowledge kind 自体は二重表示しない。
      if (b.boardKind !== 'knowledge' && b.reactions.knowledge.count >= 1) {
        map.get('knowledge')?.push(b);
      }
    }
    return map;
  }, [boards]);

  return (
    <div className="space-y-6">
      {/* 2 セクション構成 (chimo 2026-06-14): 生徒の様子 / 情報共有。
          期間フィルタは両セクションに共通適用 (投稿日 / 一言の日付)。 */}
      <StaffroomPeriodFilter value={period} onChange={setPeriod} />

      {/* ── 生徒の様子 (朝バトンをクラス別に集約・A→B seam) ── */}
      <section>
        <h2 className="mb-2 border-b border-vn-border pb-1.5 text-base font-bold text-slate-800">
          生徒の様子
        </h2>
        <StudentSupportSection period={period} />
      </section>

      {/* ── 情報共有 (種別ごとの箱・横幅いっぱい 1 カラム) ── */}
      <section>
        <h2 className="mb-2 border-b border-vn-border pb-1.5 text-base font-bold text-slate-800">
          情報共有
        </h2>
        {isLoading ? (
          <LoadingSpinner label="読み込み中" />
        ) : error ? (
          <ErrorMessage message="ボードの取得に失敗しました" />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {BOX_KIND_ORDER.map((kind) => {
              const meta = BOARD_KIND_META[kind];
              const items = byKind.get(kind) ?? [];
              return (
                <div key={kind} className="overflow-hidden rounded-lg border border-vn-border bg-white">
                  <div className="flex items-baseline gap-2 border-b border-amber-100 bg-amber-50 px-3 py-2">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 self-center rounded-full ${meta.dot}`} aria-hidden />
                    <h3 className="text-sm font-bold text-slate-800">{meta.boxTitle}</h3>
                    {items.length > 0 && (
                      <span className="text-[11px] text-gray-400 tabular-nums">{items.length}</span>
                    )}
                  </div>
                  {items.length === 0 ? (
                    <p className="px-3 pb-3 pt-2 text-xs text-gray-400">0件</p>
                  ) : (
                    // ゼブラ廃止・区切り線で分離 (chimo 2026-06-13)
                    <div className="divide-y divide-vn-border">
                      {items.map((b) => (
                        <BoardCard key={b.id} board={b} nameById={nameById} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
