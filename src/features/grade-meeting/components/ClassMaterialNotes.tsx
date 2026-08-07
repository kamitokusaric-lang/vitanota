// 観察を書くときの「材料」— そのクラスの生徒ノート (印 + 一言)。
//
// 非同期で溜めたものを、同期の場 (学年会) の卓上に出す受け渡し。
// 生徒ノートを見ながら「事実として何が見えるか」を書ける。
//
// ★ クラス単位の合計を出さない。
//   撤去した「生徒の様子」セクションは見出しに 😊n / 👀n の集計を出していたが、
//   学年会では3クラスが並ぶので、合計を出すとクラス間の比較が立ってしまう。
//   ここでは生徒を並べるだけ (既存 StudentSupportSection をそのまま流用せず
//   専用に作ったのはこのため)。
//
// 既定は畳んでおく。会議の主役は観察を出し合うことで、材料を眺めることではない。
import { useState } from 'react';
import { ChevronDown, Smile, Eye } from 'lucide-react';
import { useStudentSupport } from '@/features/staffroom/hooks/useStaffroom';

export function ClassMaterialNotes({
  classId,
  period,
}: {
  classId: string;
  /** 表示中の週。学年会の週ナビと同じ期間で引く。 */
  period: { from: string; to: string };
}) {
  const { classes, isLoading } = useStudentSupport(period);
  const [open, setOpen] = useState(false);

  if (isLoading) return null;

  const students = classes.find((c) => c.classId === classId)?.students ?? [];

  return (
    <section data-testid={`class-material-${classId}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-1 flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-vn-muted-bg/60"
        data-testid={`class-material-toggle-${classId}`}
      >
        <span className="text-[12px] font-semibold text-slate-500">
          この週の生徒ノート
        </span>
        <span className="text-[11px] text-slate-400">
          {students.length > 0 ? `${students.length}人` : 'まだありません'}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          aria-hidden
          className={`ml-auto shrink-0 text-slate-400 transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />
      </button>

      {open && students.length > 0 && (
        <ul
          className="mt-2 space-y-1.5"
          data-testid={`class-material-list-${classId}`}
        >
          {students.map((s) => (
            <li
              key={s.studentId}
              className="rounded-xl bg-vn-muted-bg/40 px-3.5 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-slate-700">
                  {s.displayName}
                </span>
                {s.goodCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-vn-green-text">
                    <Smile size={12} strokeWidth={1.75} aria-hidden />
                    <span className="tabular-nums">{s.goodCount}</span>
                  </span>
                )}
                {s.concernCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-vn-warning-text">
                    <Eye size={12} strokeWidth={1.75} aria-hidden />
                    <span className="tabular-nums">{s.concernCount}</span>
                  </span>
                )}
              </div>
              {/* コメントは「Good なのか気になるのか」を保ったまま出す。
                  サインだけの行はカウントに出るのでここでは省く。 */}
              {s.impressions.some((im) => im.content) && (
                <ul className="mt-1 space-y-0.5">
                  {s.impressions
                    .filter((im) => im.content)
                    .map((im, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-1.5 text-[12px] leading-[1.7]"
                      >
                        {im.sign && (
                          <span
                            title={im.sign === 'good' ? 'Good' : '気になる'}
                            aria-label={im.sign === 'good' ? 'Good' : '気になる'}
                            className={`mt-[3px] shrink-0 ${
                              im.sign === 'good'
                                ? 'text-vn-green-text'
                                : 'text-vn-warning-text'
                            }`}
                          >
                            {im.sign === 'good' ? (
                              <Smile size={12} strokeWidth={2} aria-hidden />
                            ) : (
                              <Eye size={12} strokeWidth={2} aria-hidden />
                            )}
                          </span>
                        )}
                        <span className="min-w-0 whitespace-pre-wrap break-words text-slate-600">
                          {im.content}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && students.length === 0 && (
        <p className="mt-2 px-1 text-[11px] text-slate-400">
          この週に書かれた生徒ノートはまだありません。
        </p>
      )}
    </section>
  );
}
