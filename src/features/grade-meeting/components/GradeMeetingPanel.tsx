// 学年会 (grade-meeting) — 学年を選び、クラスごとに状況を持ち寄る同期 Orient の場。
//
// 学年会は「学年会をはじめる」を押したときだけ回が作られる (自動生成しない)。
// クラスの並びはクラス名順で固定 — 「活発な順」等のソートは作らない (優劣を立てない)。
// 件数・スコアも出さない (クラス間の比較を誘発しないため)。
import { useEffect, useState } from 'react';
import { CalendarPlus, Users } from 'lucide-react';
import { ErrorMessage } from '@/shared/components/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { useTaskCategories } from '@/features/tasks/hooks/useTaskCategories';
import { useGradeMeeting } from '../hooks/useGradeMeeting';
import type { ClassNoteKind } from '../constants';
import { ClassStatusCard } from './ClassStatusCard';
import { GradeTaskList } from './GradeTaskList';

function formatHeldOn(heldOn: string): string {
  const [, m, d] = heldOn.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function GradeMeetingPanel({
  todayDate,
  period,
}: {
  todayDate: string;
  /** 表示中の週。上の週ナビと共有する (情報共有と同じ期間で動く)。 */
  period: { from: string; to: string };
}) {
  // 学年は実データから引く (ハードコードしない。中学なら1〜3年しか出ない)。
  // 初回だけ 1年 で問い合わせ、返ってきた availableGrades でチップを作る。
  const [grade, setGrade] = useState<number>(1);
  const {
    board,
    isLoading,
    error,
    startMeeting,
    addNote,
    deleteNote,
    createGradeTask,
    unlinkGradeTask,
  } = useGradeMeeting(grade, period);
  // 「やること」は既存タスクとして起こすので、既存のカテゴリをそのまま使う。
  const { categories } = useTaskCategories();
  const [starting, setStarting] = useState(false);
  // 過去の週を見ているときは、その週に会をはじめられない
  // (「その日に集まった」という記録を後から作らない)。
  const canStart = todayDate >= period.from && todayDate <= period.to;

  // 選んでいる学年にクラスが無い場合は、実在する先頭の学年へ寄せる。
  const availableGrades = board?.availableGrades ?? [];
  useEffect(() => {
    if (availableGrades.length === 0) return;
    if (!availableGrades.includes(grade)) setGrade(availableGrades[0]);
  }, [availableGrades, grade]);

  const start = async () => {
    setStarting(true);
    try {
      await startMeeting(todayDate);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="grade-meeting-panel">
      {/* 学年を選ぶ。クラスに学年が付いている学年だけ出す。 */}
      <div className="flex flex-wrap items-center gap-2" data-testid="grade-picker">
        <Users size={16} strokeWidth={1.75} className="text-vn-accent" aria-hidden />
        {availableGrades.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrade(g)}
            aria-pressed={g === grade}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              g === grade
                ? 'border-vn-accent bg-vn-accent text-white'
                : 'border-vn-border bg-white text-slate-600 hover:bg-vn-muted-bg'
            }`}
            data-testid={`grade-pick-${g}`}
          >
            {g}年
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner label="読み込み中" />
      ) : error || !board ? (
        <ErrorMessage message="学年会を読み込めませんでした" />
      ) : board.classes.length === 0 ? (
        <p className="rounded-xl bg-vn-muted-bg/50 px-4 py-6 text-center text-[13px] leading-[1.8] text-slate-500">
          学年が設定されたクラスがまだありません。
          <br />
          「生徒を観察する」でクラスに学年を設定すると、ここに出てきます。
        </p>
      ) : !board.meeting ? (
        // その週に会が無い。手で押したときだけ作る。
        <div className="rounded-2xl border border-dashed border-vn-border-strong bg-vn-muted-bg/30 px-4 py-8 text-center">
          {canStart ? (
            <>
              <p className="text-[13px] leading-[1.8] text-slate-600">
                {grade}年の学年会をはじめると、クラスごとに
                <br />
                見えている事実を持ち寄れます。
              </p>
              <button
                type="button"
                onClick={start}
                disabled={starting}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-vn-accent px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:opacity-40"
                data-testid="grade-meeting-start"
              >
                <CalendarPlus size={16} strokeWidth={2} aria-hidden />
                学年会をはじめる
              </button>
            </>
          ) : (
            <p className="text-[13px] leading-[1.8] text-slate-500">
              この週に{grade}年の学年会はありません。
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-[15px] font-bold text-slate-800">
              {grade}年の学年会
            </h2>
            <span className="text-[12px] text-slate-400">
              {formatHeldOn(board.meeting.heldOn)}
            </span>
            {board.previousMeeting && (
              <span className="text-[11px] text-slate-400">
                前回 {formatHeldOn(board.previousMeeting.heldOn)}
              </span>
            )}
          </div>

          {/* クラス目標。クラスごとの話に入る前に、その学年が何を目指しているかを揃える。
              比較のためではないので、件数や達成度は出さない。 */}
          {board.classes.some((c) => c.goalText) && (
            <div
              className="rounded-2xl border border-vn-border bg-vn-muted-bg/40 px-4 py-3"
              data-testid="grade-class-goals"
            >
              <p className="text-[11px] font-semibold text-slate-500">クラス目標</p>
              <ul className="mt-1.5 space-y-1">
                {board.classes.map((c) => (
                  <li key={c.id} className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[12px] font-bold text-slate-700">
                      {c.name}
                    </span>
                    <span className="min-w-0 break-words text-[13px] leading-[1.7] text-slate-600">
                      {c.goalText ?? (
                        <span className="text-slate-400">まだ決まっていません</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canStart && board.meeting.heldOn !== todayDate && (
            <button
              type="button"
              onClick={start}
              disabled={starting}
              className="inline-flex items-center gap-1.5 rounded-full border border-vn-accent bg-white px-4 py-1.5 text-[12px] font-semibold text-vn-accent transition-colors hover:bg-vn-accent-bg disabled:opacity-40"
              data-testid="grade-meeting-start-new"
            >
              <CalendarPlus size={14} strokeWidth={2} aria-hidden />
              今日の学年会をはじめる
            </button>
          )}

          {/* 学年の「やること」。クラスの話に入る前に、学年まるごとの仕事を片づける。 */}
          <GradeTaskList
            grade={grade}
            tasks={board.gradeTasks}
            categories={(categories ?? []).map((c) => ({
              id: c.id,
              name: c.name,
            }))}
            onCreate={(params) =>
              createGradeTask({ meetingId: board.meeting!.id, ...params })
            }
            onUnlink={(taskId) =>
              unlinkGradeTask({ meetingId: board.meeting!.id, taskId })
            }
          />

          {/* クラスカード。並びはクラス名順で固定 (サーバ側で保証)。 */}
          <div className="space-y-4">
            {board.classes.map((klass) => (
              <ClassStatusCard
                key={klass.id}
                klass={klass}
                notes={board.notes.filter((n) => n.classId === klass.id)}
                previousAction={
                  board.previousActions.find((a) => a.classId === klass.id) ?? null
                }
                period={period}
                onAdd={(kind: ClassNoteKind, content: string) =>
                  addNote({
                    meetingId: board.meeting!.id,
                    classId: klass.id,
                    kind,
                    content,
                  })
                }
                onDelete={deleteNote}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
