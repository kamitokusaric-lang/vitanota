// 生徒サポート (A→B seam: 朝バトンをクラス(学年)別に集約)。
// クラスごとに畳めるアコーディオン。見出しにダイジェスト集計、開くと生徒の印 + コメントを全部表示。
// 踏み絵: クラス単位の活動ダイジェストは出すが、生徒個人をスコア化・ランキングはしない。
import { useState } from 'react';
import { Smile, Eye, ChevronDown } from 'lucide-react';
import { useStudentSupport, type SupportStudent } from '../hooks/useStaffroom';

function StudentRow({ student }: { student: SupportStudent }) {
  return (
    <div className="rounded-md border border-vn-border bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-800">{student.displayName}</span>
        {student.positiveCount > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-vn-green-bg px-2 py-0.5 text-[11px] text-vn-green-text">
            <Smile size={13} strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums">{student.positiveCount}</span>
          </span>
        )}
        {student.concernCount > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-vn-warning-bg px-2 py-0.5 text-[11px] text-vn-warning-text">
            <Eye size={13} strokeWidth={1.75} aria-hidden />
            <span className="tabular-nums">{student.concernCount}</span>
          </span>
        )}
      </div>
      {student.notes.length > 0 && (
        <ul className="mt-1.5 space-y-1 border-t border-vn-border pt-1.5">
          {student.notes.map((n, i) => (
            <li key={i} className="whitespace-pre-wrap break-words text-sm text-slate-700">
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StudentSupportSection({
  period,
}: {
  period?: { from: string; to: string };
}) {
  const { classes, isLoading } = useStudentSupport(period);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  if (isLoading) return null;
  // 印が付いた生徒がまだいないときは「まだありません」(chimo 2026-06-14)
  if (classes.length === 0) {
    return <p className="px-1 py-3 text-xs text-gray-400">まだありません</p>;
  }

  const toggle = (id: string) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
        {classes.map((c) => {
          const open = openIds.has(c.classId);
          const positiveSum = c.students.reduce((a, s) => a + s.positiveCount, 0);
          const concernSum = c.students.reduce((a, s) => a + s.concernCount, 0);
          return (
            <div key={c.classId} className="overflow-hidden rounded-lg border border-vn-border bg-white">
              {/* 見出し全体をクリックで開閉。ダイジェスト集計を右に。 */}
              <button
                type="button"
                onClick={() => toggle(c.classId)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                data-testid={`support-class-toggle-${c.classId}`}
              >
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold text-slate-700">{c.className}</span>
                  {c.schoolYear && (
                    <span className="text-[11px] font-normal text-gray-400">{c.schoolYear}</span>
                  )}
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-[11px]">
                  <span className="text-gray-400">{c.students.length}人</span>
                  {positiveSum > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-vn-green-text">
                      <Smile size={13} strokeWidth={1.75} aria-hidden />
                      <span className="tabular-nums">{positiveSum}</span>
                    </span>
                  )}
                  {concernSum > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-vn-warning-text">
                      <Eye size={13} strokeWidth={1.75} aria-hidden />
                      <span className="tabular-nums">{concernSum}</span>
                    </span>
                  )}
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>
              {/* 展開: 生徒 + 付いたコメントを全部 (grid-rows でスライド) */}
              <div
                className={`grid transition-all duration-300 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-2 border-t border-vn-border px-3 py-2.5">
                    {c.students.map((s) => (
                      <StudentRow key={s.studentId} student={s} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
