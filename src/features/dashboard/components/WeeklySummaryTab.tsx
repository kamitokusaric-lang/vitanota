// 先週のvitanotaレポート (週次レポート AI) 表示タブ
// /api/me/weekly-summary を SWR で取得 → 初回アクセス時に AI 生成
// 設計書: aidlc-docs/construction/weekly-summary-design.md § 10
import useSWR from 'swr';

interface WeeklySummaryStats {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;
  entryCount: number;
  publicCount: number;
  privateCount: number;
  moodDistribution: {
    very_positive: number;
    positive: number;
    neutral: number;
    negative: number;
    very_negative: number;
  };
  topTags: Array<{ name: string; count: number }>;
  tasksCompleted: number;
  tasksActive: number;
  tasksDueThisWeek: number;
  tasksAssignedFromOthers: number;
  tasksDelegatedToOthers: number;
}

interface WeeklySummaryResponse {
  summary: string;
  weekStart: string;
  generatedAt: string;
  stats: WeeklySummaryStats;
}

const fetcher = async (url: string): Promise<WeeklySummaryResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

function formatDateJa(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00`);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${wd})`;
}

export function WeeklySummaryTab() {
  const { data, error, isLoading } = useSWR(
    '/api/me/weekly-summary',
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="py-16 text-center" data-testid="weekly-summary-loading">
        <p className="text-sm text-gray-500">考えています...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="py-16 text-center text-sm text-red-600"
        data-testid="weekly-summary-error"
      >
        ねぎらいの取得に失敗しました
      </div>
    );
  }

  const { stats, summary } = data;
  const moodLine = `😊 ${stats.moodDistribution.very_positive} / 🙂 ${stats.moodDistribution.positive} / 😐 ${stats.moodDistribution.neutral} / 😥 ${stats.moodDistribution.negative} / 😣 ${stats.moodDistribution.very_negative}`;
  const tagsLine =
    stats.topTags.length > 0
      ? stats.topTags.map((t) => `${t.name}(${t.count})`).join(', ')
      : '(なし)';

  return (
    <div className="mx-auto max-w-2xl py-8" data-testid="weekly-summary">
      <article className="space-y-6 rounded-vn border border-vn-border bg-white p-8">
        <header className="space-y-1 border-b border-vn-border pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-vn-accent">
            先週のvitanotaレポート
          </p>
          <p className="text-xs text-gray-500">
            {formatDateJa(stats.weekStart)} 〜 {formatDateJa(stats.weekEnd)}
          </p>
        </header>

        {/* 数字サマリー (DB から直接) */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            先週の数字
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm text-gray-700">
            <dt className="text-gray-500">投稿</dt>
            <dd>
              {stats.entryCount} 件 (公開 {stats.publicCount} / 非公開{' '}
              {stats.privateCount})
            </dd>

            <dt className="text-gray-500">mood</dt>
            <dd>{moodLine}</dd>

            <dt className="text-gray-500">主なタグ</dt>
            <dd>{tagsLine}</dd>

            <dt className="text-gray-500">タスク</dt>
            <dd>
              完了 {stats.tasksCompleted} / 動きあり {stats.tasksActive} / 期限到来{' '}
              {stats.tasksDueThisWeek}
            </dd>

            <dt className="text-gray-500">依頼</dt>
            <dd>
              受けた {stats.tasksAssignedFromOthers} / 出した{' '}
              {stats.tasksDelegatedToOthers}
            </dd>
          </dl>
        </section>

        {/* AI コメント + ねぎらい */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            ひとこと
          </h3>
          <div
            className="whitespace-pre-line text-[15px] leading-[1.9] text-gray-800"
            data-testid="weekly-summary-text"
          >
            {summary}
          </div>
        </section>
      </article>
    </div>
  );
}
