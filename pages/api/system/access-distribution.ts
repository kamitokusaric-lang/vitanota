// system_admin 向け /admin/access-distribution の集計 API
// UU (sessions.created_at の date×hour distinct) + AI 利用 (ai_sessions の type 別件数) を時間帯別に集約
// PV (旧 CloudWatch AppRunner Requests) は 2026-05-19 廃止 — HTTP リクエスト数は page view と対応しないため
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import {
  initializeHeatmap,
  fillHeatmap,
  initializeHeatmapWithSub,
  fillHeatmapWithSub,
  initializeDailySeries,
  fillDailySeries,
} from '@/features/access-distribution/lib/aggregator';
import {
  getUuByHourDate,
  getDailyUu,
} from '@/features/access-distribution/lib/sessionUuRepository';
import {
  getAiSessionUsageByHourDate,
  getDailyQuickCapture,
} from '@/features/access-distribution/lib/aiSessionUsageRepository';
import {
  getJournalUsageByHourDate,
  getDailyJournalEntries,
} from '@/features/access-distribution/lib/journalUsageRepository';
import {
  getTaskUsageByHourDate,
  getDailyTaskTouches,
} from '@/features/access-distribution/lib/taskUsageRepository';
import {
  getMorningCardUsageByHourDate,
  getDailyMorningCardClicks,
} from '@/features/access-distribution/lib/morningCardUsageRepository';
import type { AccessDistributionResponse } from '@/features/access-distribution/types';
import { logger } from '@/shared/lib/logger';

const MAX_PERIOD_DAYS = 90;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user.roles.includes('system_admin')) {
    return res
      .status(403)
      .json({ error: 'FORBIDDEN', message: '権限がありません' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const startStr = req.query.start;
  const endStr = req.query.end;
  if (
    typeof startStr !== 'string' ||
    typeof endStr !== 'string' ||
    !DATE_RE.test(startStr) ||
    !DATE_RE.test(endStr)
  ) {
    return res
      .status(400)
      .json({ error: 'INVALID_QUERY', message: 'start / end は YYYY-MM-DD' });
  }

  // start / end は JST 日付として解釈、UTC に変換 (JST 00:00 == UTC 前日 15:00)
  const startUtc = new Date(`${startStr}T00:00:00+09:00`);
  const endUtcInclusive = new Date(`${endStr}T00:00:00+09:00`);
  if (
    Number.isNaN(startUtc.getTime()) ||
    Number.isNaN(endUtcInclusive.getTime())
  ) {
    return res
      .status(400)
      .json({ error: 'INVALID_QUERY', message: '日付の解釈に失敗' });
  }

  // end は inclusive、 範囲は end の翌日 00:00 JST まで
  const endUtcExclusive = new Date(endUtcInclusive.getTime() + ONE_DAY_MS);
  const periodMs = endUtcExclusive.getTime() - startUtc.getTime();
  const periodDays = Math.round(periodMs / ONE_DAY_MS);
  if (periodDays < 1 || periodDays > MAX_PERIOD_DAYS) {
    return res.status(400).json({
      error: 'INVALID_RANGE',
      message: `期間は 1〜${MAX_PERIOD_DAYS} 日 (start <= end)`,
    });
  }

  try {
    const [
      uu,
      ai,
      journal,
      task,
      morningCard,
      dailyUu,
      dailyQuickCapture,
      dailyJournal,
      dailyTask,
      dailyMorningCard,
    ] = await Promise.all([
      getUuByHourDate(session.user.userId, startUtc, endUtcExclusive),
      getAiSessionUsageByHourDate(
        session.user.userId,
        startUtc,
        endUtcExclusive,
      ),
      getJournalUsageByHourDate(
        session.user.userId,
        startUtc,
        endUtcExclusive,
      ),
      getTaskUsageByHourDate(
        session.user.userId,
        startUtc,
        endUtcExclusive,
      ),
      getMorningCardUsageByHourDate(
        session.user.userId,
        startUtc,
        endUtcExclusive,
      ),
      getDailyUu(session.user.userId, startUtc, endUtcExclusive),
      getDailyQuickCapture(session.user.userId, startUtc, endUtcExclusive),
      getDailyJournalEntries(session.user.userId, startUtc, endUtcExclusive),
      getDailyTaskTouches(session.user.userId, startUtc, endUtcExclusive),
      getDailyMorningCardClicks(
        session.user.userId,
        startUtc,
        endUtcExclusive,
      ),
    ]);

    const uuHeatmap = fillHeatmap(
      initializeHeatmap(startUtc, endUtcExclusive),
      uu.rows,
    );
    const quickCaptureHeatmap = fillHeatmap(
      initializeHeatmap(startUtc, endUtcExclusive),
      ai.quickCapture,
    );
    // chimo 2026-05-20: morning_plan は撤去 (project_h3_reframing_20260520)
    const journalHeatmap = fillHeatmapWithSub(
      initializeHeatmapWithSub(startUtc, endUtcExclusive),
      journal.rows,
    );
    const taskHeatmap = fillHeatmapWithSub(
      initializeHeatmapWithSub(startUtc, endUtcExclusive),
      task.rows,
    );
    const morningCardHeatmap = fillHeatmap(
      initializeHeatmap(startUtc, endUtcExclusive),
      morningCard.clicks,
    );

    // 折れ線グラフ用の日次系列 (期間内すべての JST 日付を 0 埋め)
    const dailySeries = {
      uu: fillDailySeries(
        initializeDailySeries(startUtc, endUtcExclusive),
        dailyUu,
      ),
      quickCapture: fillDailySeries(
        initializeDailySeries(startUtc, endUtcExclusive),
        dailyQuickCapture,
      ),
      journal: fillDailySeries(
        initializeDailySeries(startUtc, endUtcExclusive),
        dailyJournal,
      ),
      task: fillDailySeries(
        initializeDailySeries(startUtc, endUtcExclusive),
        dailyTask,
      ),
      morningCard: fillDailySeries(
        initializeDailySeries(startUtc, endUtcExclusive),
        dailyMorningCard,
      ),
    };

    const response: AccessDistributionResponse = {
      uuHeatmap,
      quickCaptureHeatmap,
      journalHeatmap,
      taskHeatmap,
      morningCardHeatmap,
      dailySeries,
      summary: {
        totalUu: uu.totalUu,
        totalQuickCaptureSessions: ai.totalQuickCaptureSessions,
        totalJournalEntries: journal.totalEntries,
        totalJournalPrivateEntries: journal.totalPrivateEntries,
        totalTaskTouches: task.totalTouches,
        totalTaskCompletes: task.totalCompletes,
        morningCardShownUu: morningCard.shownUu,
        morningCardDismissedUu: morningCard.dismissedUu,
        morningCardCandidateClickedUu: morningCard.candidateClickedUu,
        morningCardCandidateStatusChangedUu:
          morningCard.candidateStatusChangedUu,
      },
      meta: {
        start: startStr,
        end: endStr,
        periodDays,
        generatedAt: new Date().toISOString(),
      },
    };
    return res.status(200).json(response);
  } catch (err) {
    logger.error(
      {
        event: 'admin.access_distribution.fetch_failed',
        error: err instanceof Error ? err.message : String(err),
      },
      'access-distribution fetch failed',
    );
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
