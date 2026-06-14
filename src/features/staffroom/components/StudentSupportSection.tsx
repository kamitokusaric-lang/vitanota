// 生徒サポート (A→B seam: 朝バトンをクラス(学年)別に集約)。
// 印 (ポジティブ / 気になる) が付いた生徒を、クラスごとに 名前 + 印件数 + 今週の一言 で出す。
// 名前を出す = baton 画面と同じ可視範囲 (相互関心層)。数値化・ランキングはしない。
import { Smile, Eye } from 'lucide-react';
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

  if (isLoading) return null;
  // 印が付いた生徒がまだいないときは「まだありません」(chimo 2026-06-14)
  if (classes.length === 0) {
    return <p className="px-1 py-3 text-xs text-gray-400">まだありません</p>;
  }

  return (
    <section className="space-y-3 rounded-lg border border-vn-border bg-vn-bg p-2.5">
      <h2 className="px-1 text-sm font-semibold text-slate-700">生徒サポート</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {classes.map((c) => (
          <div key={c.classId} className="rounded-lg border border-vn-border bg-white p-2.5">
            <div className="mb-2 flex items-baseline gap-2 px-0.5">
              <h3 className="text-sm font-semibold text-slate-700">{c.className}</h3>
              {c.schoolYear && (
                <span className="text-[11px] text-gray-400">{c.schoolYear}</span>
              )}
            </div>
            <div className="space-y-2">
              {c.students.map((s) => (
                <StudentRow key={s.studentId} student={s} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
