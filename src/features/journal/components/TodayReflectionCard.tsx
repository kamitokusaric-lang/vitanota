// 「今日のふりかえり」カード。デフォルトは折りたたみ (低い CTA だけ)。
// 「今日のふりかえりを書く」を押すと、grid-rows 0fr→1fr でぬるっとフォームが下に現れる
// (内容の高さを知らなくても滑らかに開閉できる定番テクニック)。chimo 2026-07-01。
import { useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { DiaryNoteBox } from './DiaryNoteBox';

export function TodayReflectionCard() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-[14px] border border-vn-border bg-vn-surface px-7 pb-4 pt-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[20px] font-bold leading-[1.4] text-slate-800">
            📝 今日のふりかえり
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-vn-green-bg px-2.5 py-0.5 text-[11px] font-medium text-vn-green-text">
            <Lock size={11} strokeWidth={2} aria-hidden />
            自分だけの記録
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'ふりかえりを閉じる' : 'ふりかえりを開く'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          data-testid="reflection-toggle"
        >
          <ChevronDown
            size={18}
            className={`transition-transform duration-300 ease-out ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      </header>

      {/* 折りたたみ本体: grid-rows でぬるっと開閉。閉じてる間も DOM には残す。 */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-4">
            <DiaryNoteBox onSuccess={() => setOpen(false)} />
          </div>
        </div>
      </div>

      {/* 折りたたみ時の入口。開いたら消す (フォームが下に現れる)。 */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-vn-accent/40 bg-vn-accent-bg/30 py-3.5 text-sm font-semibold text-vn-accent-text transition-colors hover:border-vn-accent/60 hover:bg-vn-accent-bg/50"
          data-testid="reflection-open-cta"
        >
          ✍️ 今日のふりかえりを書く
        </button>
      )}
    </section>
  );
}
