// system_admin 向け /admin/access-distribution の集計 API
// 全メトリクス (UU / AI 整理 / 日々ノート / タスク / カレンダー) を date×hour の
// バブルチャート用の点として返す (2026-05-30 chimo: ヒートマップ + 折れ線を廃止)。
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { getUuByHourDate } from '@/features/access-distribution/lib/sessionUuRepository';
import { getAiSessionUsageByHourDate } from '@/features/access-distribution/lib/aiSessionUsageRepository';
import { getJournalUsageByHourDate } from '@/features/access-distribution/lib/journalUsageRepository';
import { getTaskUsageByHourDate } from '@/features/access-distribution/lib/taskUsageRepository';
import { getCalendarDateHourEventPoints } from '@/features/access-distribution/lib/calendarUsageRepository';
import type {
  AccessDistributionResponse,
  CalendarEventTypeKey,
  CalendarScatterPoint,
  MetricBubblePoint,
} from '@/features/access-distribution/types';
import { logger } from '@/shared/lib/logger';

const CALENDAR_EVENT_KEYS: CalendarEventTypeKey[] = [
  'view_switched',
  'task_moved',
  'task_pushed_to_next_week',
  'task_created_from_plus',
  'day_detail_opened',
];

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
    const [uu, ai, journal, task, calendarRows] = await Promise.all([
      getUuByHourDate(session.user.userId, startUtc, endUtcExclusive),
      getAiSessionUsageByHourDate(
        session.user.userId,
        startUtc,
        endUtcExclusive,
      ),
      getJournalUsageByHourDate(session.user.userId, startUtc, endUtcExclusive),
      getTaskUsageByHourDate(session.user.userId, startUtc, endUtcExclusive),
      getCalendarDateHourEventPoints(
        session.user.userId,
        startUtc,
        endUtcExclusive,
      ),
    ]);

    // 単一系列メトリクス: 集計行をそのままバブル点に (sub は WithSub 行のみ付与)
    const toBubble = (
      rows: Array<{ date: string; hour: number; count: number; subCount?: number }>,
    ): MetricBubblePoint[] =>
      rows.map((r) => ({
        date: r.date,
        hour: r.hour,
        count: r.count,
        ...(typeof r.subCount === 'number' ? { sub: r.subCount } : {}),
      }));

    // カレンダー: 既知 event 種別のみ通す
    const calendar: CalendarScatterPoint[] = calendarRows
      .filter((row) => (CALENDAR_EVENT_KEYS as string[]).includes(row.event_type))
      .map((row) => ({
        date: row.date,
        hour: row.hour,
        eventType: row.event_type as CalendarEventTypeKey,
        count: row.count,
      }));

    const response: AccessDistributionResponse = {
      uu: toBubble(uu.rows),
      quickCapture: toBubble(ai.quickCapture),
      journal: toBubble(journal.rows),
      task: toBubble(task.rows),
      calendar,
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
