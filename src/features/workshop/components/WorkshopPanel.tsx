// 研修 (workshop) の箱の中身 (chimo 2026-07-29)。
// 上から時間順: チェックイン (研修前・箱に閉じる) → 資料 → チーム振り返り (62-74分・
// 箱に閉じる) → 振り返り (研修後・職員室にも流れる)。
// 任意性を文言に埋める (「答えたいなら」「読みたいなら」)。未回答者リストは作らない (踏み絵)。
// 投稿主と他者で見た目を変えない (isMine で分岐しない)。
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PenLine,
  NotebookPen,
  Maximize2,
  Presentation,
  Users,
  X,
} from 'lucide-react';
import { formatRelativeTime } from '@/features/journal/lib/relativeTime';
import {
  useWorkshop,
  type WorkshopTeamReflectionDto,
} from '../hooks/useWorkshop';
import {
  WORKSHOP_MATERIAL,
  WORKSHOP_TEAMS,
  WORKSHOP_TEAM_KEYS,
  WORKSHOP_TEAM_QUESTIONS,
  findWorkshopTeam,
  type WorkshopTeam,
} from '../constants';

export function WorkshopPanel() {
  const {
    board,
    isLoading,
    error,
    submitCheckin,
    postReflection,
    upsertTeamReflection,
  } = useWorkshop();

  const [checkinDraft, setCheckinDraft] = useState('');
  const [checkinBusy, setCheckinBusy] = useState(false);
  // チェックインだけ最初から開けておく (研修前に答えてもらうものなので、
  // タブを開いた時点で問いが目に入るようにする)。他のセクションは畳んだまま。
  const [checkinOpen, setCheckinOpen] = useState(true);
  const [reflectionDraft, setReflectionDraft] = useState('');
  const [reflectionBusy, setReflectionBusy] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);

  // 自分の既存回答をプリフィル (上書き編集できるように)。
  useEffect(() => {
    if (board?.myCheckin) setCheckinDraft(board.myCheckin.answer);
  }, [board?.myCheckin]);

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-slate-400">読み込み中…</div>;
  }
  if (error || !board) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        研修を読み込めませんでした
      </div>
    );
  }

  const { workshop, myCheckin, checkins, reflections, teamReflections } = board;

  const submitCheckinHandler = async () => {
    const answer = checkinDraft.trim();
    if (!answer) return;
    setCheckinBusy(true);
    try {
      await submitCheckin(answer);
    } finally {
      setCheckinBusy(false);
    }
  };

  const submitReflectionHandler = async () => {
    const content = reflectionDraft.trim();
    if (!content) return;
    setReflectionBusy(true);
    try {
      await postReflection(content);
      setReflectionDraft('');
    } finally {
      setReflectionBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8" data-testid="workshop-panel">
      {/* ヘッダ */}
      <header className="space-y-1">
        {workshop.schedule && (
          <p className="text-[12px] font-semibold tracking-wide text-vn-accent">
            {workshop.schedule}
          </p>
        )}
        <h1 className="text-lg font-bold text-slate-800 sm:text-xl">
          {workshop.title}
        </h1>
      </header>

      {/* ① チェックイン (研修前・箱に閉じる・折りたたみ可) */}
      <section className="space-y-4" data-testid="workshop-checkin">
        <button
          type="button"
          onClick={() => setCheckinOpen((o) => !o)}
          aria-expanded={checkinOpen}
          className="-mx-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-vn-muted-bg"
          data-testid="workshop-checkin-toggle"
        >
          <PenLine
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-vn-accent"
            aria-hidden
          />
          <span className="min-w-0 text-left text-[14px] font-semibold text-slate-800">
            研修前のチェックイン
          </span>
          {myCheckin && !checkinOpen && (
            <span className="shrink-0 text-[12px] text-slate-400">回答ずみ</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-vn-accent/30 bg-vn-accent-bg px-2.5 py-1 text-[12px] font-semibold text-vn-accent">
            {checkinOpen ? '折りたたむ' : 'ひらく'}
            <ChevronDown
              size={14}
              strokeWidth={2.5}
              aria-hidden
              className={`transition-transform ${checkinOpen ? '' : '-rotate-90'}`}
            />
          </span>
        </button>

        {checkinOpen && (
          <div className="space-y-4">
            <p className="rounded-xl border border-vn-accent/30 bg-vn-accent-bg px-4 py-3 text-[14px] font-bold text-vn-accent">
              研修がはじまるまでに、書いてみてください。
            </p>
            <div className="rounded-2xl border border-vn-border bg-white p-4 shadow-sm sm:p-5">
              <p className="text-[15px] font-semibold text-slate-800">
                {workshop.checkinQuestion}
              </p>
              <textarea
                value={checkinDraft}
                onChange={(e) => setCheckinDraft(e.target.value)}
                placeholder="ゾウの前・ふれあいコーナー・売店・お弁当を食べた芝生… 動物じゃなくても"
                maxLength={2000}
                rows={3}
                className="mt-3 w-full resize-none rounded-xl border border-vn-border bg-white px-3.5 py-2.5 text-[14px] leading-[1.7] text-slate-900 placeholder:text-slate-400 focus:border-vn-accent focus:outline-none"
                data-testid="workshop-checkin-input"
              />
              <div className="mt-2 flex items-center justify-end gap-3">
                {myCheckin && (
                  <span className="text-[12px] text-slate-400">
                    {formatRelativeTime(myCheckin.updatedAt)}に回答ずみ
                  </span>
                )}
                <button
                  type="button"
                  onClick={submitCheckinHandler}
                  disabled={checkinBusy || !checkinDraft.trim()}
                  className="rounded-full bg-vn-accent px-5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:opacity-40"
                  data-testid="workshop-checkin-submit"
                >
                  送信
                </button>
              </div>
            </div>

            {/* みんなの回答 */}
            {checkins.length > 0 && (
              <div className="space-y-2" data-testid="workshop-checkin-list">
                <p className="px-1 text-[12px] text-slate-400">みんなの回答</p>
                {checkins.map((c) => (
                  <PersonCard
                    key={c.id}
                    name={c.userName}
                    when={c.createdAt}
                    body={c.answer}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ② 研修資料 (スライド・1ページずつめくる) */}
      <MaterialPager />

      {/* ③ チーム振り返り (ワーク最後の12分・箱に閉じる・そのまま発表に映す) */}
      <TeamReflectionSection
        teamReflections={teamReflections}
        onSave={upsertTeamReflection}
      />

      {/* ④ 振り返り (研修後・職員室にも流れる・折りたたみ可) */}
      <section className="space-y-4" data-testid="workshop-reflection">
        <button
          type="button"
          onClick={() => setReflectionOpen((o) => !o)}
          aria-expanded={reflectionOpen}
          className="-mx-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-vn-muted-bg"
          data-testid="workshop-reflection-toggle"
        >
          <NotebookPen
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-vn-accent"
            aria-hidden
          />
          <span className="min-w-0 text-left text-[14px] font-semibold text-slate-800">
            研修後の振り返り
          </span>
          {reflections.length > 0 && !reflectionOpen && (
            <span className="shrink-0 text-[12px] text-slate-400">
              {reflections.length}件
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-vn-accent/30 bg-vn-accent-bg px-2.5 py-1 text-[12px] font-semibold text-vn-accent">
            {reflectionOpen ? '折りたたむ' : 'ひらく'}
            <ChevronDown
              size={14}
              strokeWidth={2.5}
              aria-hidden
              className={`transition-transform ${reflectionOpen ? '' : '-rotate-90'}`}
            />
          </span>
        </button>

        {reflectionOpen && (
          <div className="space-y-4">
            <p className="rounded-xl border border-vn-accent/30 bg-vn-accent-bg px-4 py-3 text-[14px] font-bold text-vn-accent">
              職員室ノートにも公開されます。他の人の振り返りにも目を通してみてください。
            </p>
            <div className="rounded-2xl border border-vn-border bg-white p-4 shadow-sm sm:p-5">
              <p className="text-[15px] font-semibold text-slate-800">
                今日の研修をふりかえって
              </p>
              <textarea
                value={reflectionDraft}
                onChange={(e) => setReflectionDraft(e.target.value)}
                placeholder="気づいたこと・持ち帰りたいこと・チームに渡したいこと"
                maxLength={4000}
                rows={4}
                className="mt-3 w-full resize-none rounded-xl border border-vn-border bg-white px-3.5 py-2.5 text-[14px] leading-[1.7] text-slate-900 placeholder:text-slate-400 focus:border-vn-accent focus:outline-none"
                data-testid="workshop-reflection-input"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={submitReflectionHandler}
                  disabled={reflectionBusy || !reflectionDraft.trim()}
                  className="rounded-full bg-vn-accent px-5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:opacity-40"
                  data-testid="workshop-reflection-submit"
                >
                  送信
                </button>
              </div>
            </div>

            {/* みんなの振り返り */}
            {reflections.length > 0 && (
              <div className="space-y-2" data-testid="workshop-reflection-list">
                <p className="px-1 text-[12px] text-slate-400">みんなの振り返り</p>
                {reflections.map((r) => (
                  <PersonCard
                    key={r.journalEntryId}
                    name={r.userName}
                    when={r.createdAt}
                    body={r.content}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// 研修資料を1ページずつめくるビューア (PDF を PNG 化したスライド・16:9・折りたたみ可)。
function MaterialPager() {
  const { pageCount, pagePath } = WORKSHOP_MATERIAL;
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const go = (n: number) => setPage(Math.min(pageCount, Math.max(1, n)));

  // 全画面中はキーボードで操作 (← → めくり / Esc 閉じる)。
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
      else if (e.key === 'ArrowRight') setPage((p) => Math.min(pageCount, p + 1));
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // 背景スクロールを止める
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen, pageCount]);

  return (
    <section className="space-y-4" data-testid="workshop-material">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-vn-muted-bg"
        data-testid="workshop-material-toggle"
      >
        <FileText
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-vn-accent"
          aria-hidden
        />
        <span className="min-w-0 text-left text-[14px] font-semibold text-slate-800">
          研修資料
        </span>
        {!open && (
          <span className="shrink-0 text-[12px] text-slate-400">
            {pageCount}ページ
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-vn-accent/30 bg-vn-accent-bg px-2.5 py-1 text-[12px] font-semibold text-vn-accent">
          {open ? '折りたたむ' : 'ひらく'}
          <ChevronDown
            size={14}
            strokeWidth={2.5}
            aria-hidden
            className={`transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </span>
      </button>

      {open && (
      <div className="overflow-hidden rounded-2xl border border-vn-border bg-white shadow-sm">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pagePath(page)}
            alt={`研修資料 ${page} / ${pageCount} ページ目`}
            className="block aspect-video w-full bg-slate-50 object-contain"
            data-testid="workshop-material-image"
          />
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            aria-label="全画面で見る"
            className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60"
            data-testid="workshop-material-fullscreen"
          >
            <Maximize2 size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="flex items-center justify-between border-t border-vn-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="前のページ"
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-vn-muted-bg disabled:opacity-30"
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
            前へ
          </button>
          <span className="text-[13px] tabular-nums text-slate-500">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={page >= pageCount}
            aria-label="次のページ"
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-vn-muted-bg disabled:opacity-30"
          >
            次へ
            <ChevronRight size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
      )}

      {/* 全画面表示 (iOS でも動くオーバーレイ方式・portal で body 直下に出し stacking context を脱出) */}
      {fullscreen &&
        createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-label="研修資料 全画面"
          data-testid="workshop-material-overlay"
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-[13px] tabular-nums text-white/80">
              {page} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              aria-label="閉じる"
              className="rounded-full p-1.5 transition hover:bg-white/10"
              data-testid="workshop-material-overlay-close"
            >
              <X size={22} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center overflow-hidden px-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pagePath(page)}
              alt={`研修資料 ${page} / ${pageCount} ページ目`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex items-center justify-between px-4 py-4">
            <button
              type="button"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              aria-label="前のページ"
              className="flex items-center gap-1 rounded-full px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft size={18} strokeWidth={2} aria-hidden />
              前へ
            </button>
            <button
              type="button"
              onClick={() => go(page + 1)}
              disabled={page >= pageCount}
              aria-label="次のページ"
              className="flex items-center gap-1 rounded-full px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-white/10 disabled:opacity-30"
            >
              次へ
              <ChevronRight size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}

// ── チーム振り返り (紙の配布物5「振り返り・発表シート」の画面化) ──────────
// ワーク最後の12分でチームごとに1枚を埋め、そのまま発表 (74-94分) に映す。
//   - 埋めるそばから下でポスターが組み上がる (書式を整える手間をチームにかけさせない)
//   - 「発表する」で全画面。← → で班をめくる (プロジェクタ投影想定)
//   - 箱の中に閉じる (journal に乗せない) → 職員室ノートには流れない
// 未記入の班は並べない (進捗管理の見た目にしない・踏み絵)。
// 「最後に書いた人」は出さない (入力係を可視化しない)。

type TeamAnswers = {
  respect: string;
  autonomy: string;
  next: string;
};

const EMPTY_ANSWERS: TeamAnswers = {
  respect: '',
  autonomy: '',
  next: '',
};

// 12分の作業中にリロードされても、選んだ班を思い出せるように。
const TEAM_STORAGE_KEY = 'vitanota.workshop.teamKey';

function hasAnyAnswer(a: TeamAnswers): boolean {
  return Boolean(a.respect.trim() || a.autonomy.trim() || a.next.trim());
}

function TeamReflectionSection({
  teamReflections,
  onSave,
}: {
  teamReflections: WorkshopTeamReflectionDto[];
  onSave: (args: TeamAnswers & { teamKey: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [teamKey, setTeamKey] = useState(WORKSHOP_TEAMS[0].key);
  const [draft, setDraft] = useState<TeamAnswers>(EMPTY_ANSWERS);
  const [busy, setBusy] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const loadedTeamRef = useRef<string | null>(null);

  // 前回選んだ班を復元する。
  useEffect(() => {
    const saved = window.localStorage.getItem(TEAM_STORAGE_KEY);
    if (saved && WORKSHOP_TEAM_KEYS.includes(saved)) setTeamKey(saved);
  }, []);

  // 班を選び直したときだけ保存ずみの内容を読み込む。
  // 再検証のたびに上書きすると、入力中の文字が消えてしまう。
  useEffect(() => {
    if (loadedTeamRef.current === teamKey) return;
    const saved = teamReflections.find((t) => t.teamKey === teamKey);
    setDraft(
      saved
        ? {
            respect: saved.respect,
            autonomy: saved.autonomy,
            next: saved.next,
          }
        : EMPTY_ANSWERS,
    );
    loadedTeamRef.current = teamKey;
  }, [teamKey, teamReflections]);

  const selectTeam = (key: string) => {
    setTeamKey(key);
    window.localStorage.setItem(TEAM_STORAGE_KEY, key);
  };

  const team = findWorkshopTeam(teamKey) ?? WORKSHOP_TEAMS[0];
  const savedForTeam = teamReflections.find((t) => t.teamKey === teamKey);

  // 発表の対象 = 何か書かれた班だけ (班の並び順 = 発表順)。
  const writtenTeams = WORKSHOP_TEAMS.flatMap((t) => {
    const answers = teamReflections.find((r) => r.teamKey === t.key);
    return answers && hasAnyAnswer(answers) ? [{ team: t, answers }] : [];
  });
  const otherTeams = writtenTeams.filter((w) => w.team.key !== teamKey);

  const save = async () => {
    if (!hasAnyAnswer(draft)) return;
    setBusy(true);
    try {
      await onSave({ teamKey, ...draft });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" data-testid="workshop-team-reflection">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="-mx-2 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-vn-muted-bg"
        data-testid="workshop-team-toggle"
      >
        <Users
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-vn-accent"
          aria-hidden
        />
        <span className="min-w-0 text-left text-[14px] font-semibold text-slate-800">
          チームでの振り返り
        </span>
        {writtenTeams.length > 0 && !open && (
          <span className="shrink-0 text-[12px] text-slate-400">
            {writtenTeams.length}班
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-vn-accent/30 bg-vn-accent-bg px-2.5 py-1 text-[12px] font-semibold text-vn-accent">
          {open ? '折りたたむ' : 'ひらく'}
          <ChevronDown
            size={14}
            strokeWidth={2.5}
            aria-hidden
            className={`transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-4">
          {/* 班を選ぶ */}
          <div className="flex flex-wrap gap-2" data-testid="workshop-team-picker">
            {WORKSHOP_TEAMS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTeam(t.key)}
                aria-pressed={t.key === teamKey}
                className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                  t.key === teamKey
                    ? 'border-vn-accent bg-vn-accent text-white'
                    : 'border-vn-border bg-white text-slate-600 hover:bg-vn-muted-bg'
                }`}
                data-testid={`workshop-team-pick-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 4問 (紙のシートと同じ設問) */}
          <div className="space-y-4 rounded-2xl border border-vn-border bg-white p-4 shadow-sm sm:p-5">
            {WORKSHOP_TEAM_QUESTIONS.map((q) => (
              <div key={q.field}>
                <label
                  htmlFor={`workshop-team-${q.field}`}
                  className="block text-[14px] font-semibold leading-[1.6] text-slate-800"
                >
                  {q.formLabel}
                </label>
                <textarea
                  id={`workshop-team-${q.field}`}
                  value={draft[q.field]}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [q.field]: e.target.value }))
                  }
                  placeholder={q.hint || undefined}
                  maxLength={2000}
                  rows={q.field === 'next' ? 2 : 3}
                  className="mt-2 w-full resize-none rounded-xl border border-vn-border bg-white px-3.5 py-2.5 text-[14px] leading-[1.7] text-slate-900 placeholder:text-slate-400 focus:border-vn-accent focus:outline-none"
                  data-testid={`workshop-team-input-${q.field}`}
                />
              </div>
            ))}
            <div className="flex items-center justify-end gap-3">
              {savedForTeam && (
                <span className="text-[12px] text-slate-400">
                  {formatRelativeTime(savedForTeam.updatedAt)}に保存
                </span>
              )}
              <button
                type="button"
                onClick={save}
                disabled={busy || !hasAnyAnswer(draft)}
                className="rounded-full bg-vn-accent px-5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-vn-accent-hover disabled:opacity-40"
                data-testid="workshop-team-submit"
              >
                送信
              </button>
            </div>
          </div>

          {/* 書いたそばから組み上がるポスター (保存前のドラフトを映す) */}
          <div className="space-y-2">
            <p className="px-1 text-[12px] text-slate-400">
              {team.label}の発表用ポスター
            </p>
            <TeamReflectionPoster team={team} answers={draft} />
          </div>

          {writtenTeams.length > 0 && (
            <button
              type="button"
              onClick={() => setStageOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-vn-accent bg-white px-5 py-2.5 text-[14px] font-semibold text-vn-accent transition-colors hover:bg-vn-accent-bg"
              data-testid="workshop-team-present"
            >
              <Presentation size={17} strokeWidth={2} aria-hidden />
              発表する ({writtenTeams.length}班)
            </button>
          )}

          {/* ほかの班のポスター (書かれた班だけ・発表後に読み返せる) */}
          {otherTeams.length > 0 && (
            <div className="space-y-3" data-testid="workshop-team-list">
              <p className="px-1 text-[12px] text-slate-400">ほかの班のポスター</p>
              {otherTeams.map(({ team: t, answers }) => (
                <TeamReflectionPoster key={t.key} team={t} answers={answers} />
              ))}
            </div>
          )}
        </div>
      )}

      {stageOpen && writtenTeams.length > 0 && (
        <TeamReflectionStage
          items={writtenTeams}
          onClose={() => setStageOpen(false)}
        />
      )}
    </section>
  );
}

// 「仕事で活かせること」(④) はポスターの主役。文字数で段階的にサイズを落として、
// 長く書かれても崩れないようにする。
function heroSizeClass(length: number, stage: boolean): string {
  if (stage) {
    if (length <= 12) return 'text-4xl sm:text-6xl';
    if (length <= 24) return 'text-3xl sm:text-5xl';
    return 'text-2xl sm:text-4xl';
  }
  if (length <= 12) return 'text-2xl';
  if (length <= 24) return 'text-xl';
  return 'text-lg';
}

// 発表用ポスター。カード (一覧・プレビュー) と全画面 (発表) で同じものを使い、
// タイポグラフィのスケールだけ切り替える。
// 空欄は見出しごと描画しない (穴の空いた紙に見せない)。
function TeamReflectionPoster({
  team,
  answers,
  size = 'card',
}: {
  team: WorkshopTeam;
  answers: TeamAnswers;
  size?: 'card' | 'stage';
}) {
  const stage = size === 'stage';
  // 主役 = ④ 仕事で活かせること。発表のクライマックスを「で、明日から何をするか」に置く。
  const hero = answers.next.trim();
  const bodyQuestions = WORKSHOP_TEAM_QUESTIONS.filter((q) => q.field !== 'next');
  const bodyFilled = bodyQuestions.some((q) => answers[q.field].trim());
  const empty = !hasAnyAnswer(answers);

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${team.tone.border} ${team.tone.surface} ${
        stage ? 'p-8 sm:p-12' : 'p-5 sm:p-6'
      }`}
      data-testid={`workshop-team-poster-${team.key}`}
    >
      {hero ? (
        <>
          <p
            className={`font-bold tracking-wide ${team.tone.text} ${
              stage ? 'text-[18px] sm:text-2xl' : 'text-[13px]'
            }`}
          >
            {team.label}
          </p>
          <p
            className={`mt-2 text-balance break-words font-bold leading-[1.35] ${team.tone.text} ${heroSizeClass(hero.length, stage)}`}
          >
            {hero}
          </p>
        </>
      ) : (
        // 主役がまだなら班名を昇格させ、穴を空けない。
        <p
          className={`text-balance font-bold leading-[1.35] ${team.tone.text} ${
            stage ? 'text-4xl sm:text-6xl' : 'text-2xl'
          }`}
        >
          {team.label}
        </p>
      )}

      {bodyFilled && (
        <div
          className={`border-t ${team.tone.border} ${stage ? 'mt-8' : 'mt-5'}`}
        />
      )}

      {bodyQuestions.map((q) => {
        const value = answers[q.field].trim();
        if (!value) return null;
        return (
          <div key={q.field} className={stage ? 'mt-6' : 'mt-4'}>
            <p
              className={`font-semibold opacity-70 ${team.tone.text} ${
                stage ? 'text-[15px] sm:text-lg' : 'text-[12px]'
              }`}
            >
              {q.posterLabel}
            </p>
            <p
              className={`mt-1 whitespace-pre-wrap break-words leading-[1.8] text-vn-ink ${
                stage ? 'text-[17px] sm:text-2xl' : 'text-[13px]'
              }`}
            >
              {value}
            </p>
          </div>
        );
      })}


      {empty && !stage && (
        <p className="mt-4 text-[12px] leading-[1.7] text-slate-400">
          ここに書いたものが、そのまま発表用のポスターになります。
        </p>
      )}
    </div>
  );
}

// 発表モード (74-94分)。全画面で班を ← → でめくる。
// 資料ビューアの全画面オーバーレイと同じ作法 (portal / Esc / 背景スクロール停止)。
function TeamReflectionStage({
  items,
  onClose,
}: {
  items: { team: WorkshopTeam; answers: TeamAnswers }[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const total = items.length;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 背景スクロールの停止は mount/unmount の1回だけ (再実行すると復元値が壊れる)。
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight')
        setIndex((i) => Math.min(total - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  const current = items[Math.min(index, total - 1)];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-vn-bg"
      role="dialog"
      aria-modal="true"
      aria-label="チーム振り返り 発表"
      data-testid="workshop-team-stage"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[13px] tabular-nums text-slate-500">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="rounded-full p-1.5 text-slate-600 transition hover:bg-vn-muted-bg"
          data-testid="workshop-team-stage-close"
        >
          <X size={22} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-2">
        <div className="w-full max-w-4xl">
          <TeamReflectionPoster
            team={current.team}
            answers={current.answers}
            size="stage"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-4">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index <= 0}
          aria-label="前の班"
          className="flex items-center gap-1 rounded-full px-4 py-2 text-[14px] font-semibold text-slate-600 transition hover:bg-vn-muted-bg disabled:opacity-30"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden />
          前へ
        </button>
        <span className="text-[14px] font-bold text-slate-700">
          {current.team.label}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          disabled={index >= total - 1}
          aria-label="次の班"
          className="flex items-center gap-1 rounded-full px-4 py-2 text-[14px] font-semibold text-slate-600 transition hover:bg-vn-muted-bg disabled:opacity-30"
        >
          次へ
          <ChevronRight size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function PersonCard({
  name,
  when,
  body,
}: {
  name: string | null;
  when: string;
  body: string;
}) {
  return (
    <div className="rounded-[14px] bg-vn-muted-bg/50 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-[12px] font-semibold text-slate-700">
          {name ?? 'ほかの先生'}
        </span>
        <time className="shrink-0 text-[11px] text-slate-400">
          {formatRelativeTime(when)}
        </time>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-slate-700">
        {body}
      </p>
    </div>
  );
}
