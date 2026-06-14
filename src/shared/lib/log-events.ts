// 構造化ログイベントの型安全な中央定義
// Unit-02 で追加した全イベントを型レベルで統一管理する。
// 使い方:
//   import { LogEvents, logEvent } from '@/shared/lib/log-events';
//   logEvent(LogEvents.JournalEntryCreated, { entryId, userId, tenantId, isPublic, tagCount });
//
// 利点:
// - イベント名のタイポが TypeScript で検出される
// - 各イベントが要求するフィールドを型で強制
// - P1-D 対応: イベント種類の網羅的レビューが可能
import type { Logger } from 'pino';
import { logger as defaultLogger } from './logger';

// ─────────────────────────────────────────────────────────────
// イベント名定数
// ─────────────────────────────────────────────────────────────

export const LogEvents = {
  // Unit-02: Journal Entry 書き込み系
  JournalEntryCreated: 'journal_entry_created',
  JournalEntryUpdated: 'journal_entry_updated',
  JournalEntryDeleted: 'journal_entry_deleted',

  // Unit-02: Journal Entry 読み取り系（P1-D 対応）
  JournalEntryRead: 'journal_entry_read',
  JournalEntryListRead: 'journal_entry_list_read',

  // Unit-02: Tag 系
  TagCreated: 'tag_created',
  TagDeleted: 'tag_deleted',
  TagListRead: 'tag_list_read',

  // Unit-02: バリデーション/セキュリティ警告
  JournalEntryCreateInvalidTags: 'journal_entry_create_invalid_tags',
  JournalEntryUpdateNotFound: 'journal_entry_update_not_found',
  TagForbidden: 'tag_forbidden',

  // Unit-01/02: Session 系（SP-07）
  SessionCreated: 'session_created',
  SessionRevoked: 'session_revoked',
  SessionExpired: 'session_expired',

  // AI 整理 (Phase 1 コア体験) の利用イベント
  // 注: 全て logEvent (info) のみ使用 (feedback_observed_moment_broken 踏み絵)。
  AiCaptureInputStarted: 'ai_capture_input_started',
  AiCaptureSubmitted: 'ai_capture_submitted',

  // chimo 2026-05-20: H3 morning_plan は撤去 (project_h3_reframing_20260520)。
  // 旧 MorningPlanHint* / CapacityModalDefaultHint* / PlanResultButtonsHint* /
  // PlanResultStartHint* / TodayPlanFeedbackHint* / TodayPlanDoneHint* は削除。

  // F3: フィードバック返信 (片方向スレッド)。全て info 出力、踏み絵で warn 化しない
  FeedbackReplyPosted: 'feedback_reply_posted',
  FeedbackThreadMarkedRead: 'feedback_thread_marked_read',

  // F3: FAB の未読 dot 上に出すヒント (chimo 2026-05-17)
  FeedbackUnreadHintShown: 'feedback_unread_hint_shown',
  FeedbackUnreadHintDismissed: 'feedback_unread_hint_dismissed',

  // カレンダー機能 (Unit-06) の利用計測 (chimo 2026-05-30)。
  // 全て info 出力 (踏み絵: 観測感を作らない)。新 H3 仮説 (週/月の偏り把握 +
  // calendar が朝の来訪価値を代替できるか) の検証データ。
  CalendarViewSwitched: 'calendar_view_switched',
  CalendarTaskMoved: 'calendar_task_moved',
  CalendarTaskPushedToNextWeek: 'calendar_task_pushed_to_next_week',
  CalendarTaskCreatedFromPlus: 'calendar_task_created_from_plus',
  CalendarDayDetailOpened: 'calendar_day_detail_opened',

  // H7-B 職員室ボード (staffroom) 循環計測 (chimo 2026-06-10)。
  // 循環の「書く・反応する」段階のログ点。全て info 出力 (踏み絵: 観測感を作らない /
  // 数値化・ランキングしない)。閲覧率・役立ち率の計測は UI スライス S4 で追加。
  StaffroomBoardPosted: 'staffroom_board_posted',
  StaffroomBoardReacted: 'staffroom_board_reacted',
} as const;

export type LogEventName = (typeof LogEvents)[keyof typeof LogEvents];

// ─────────────────────────────────────────────────────────────
// 共通ベースフィールド
// ─────────────────────────────────────────────────────────────

interface BaseEventFields {
  userId: string;
  tenantId: string;
}

// ─────────────────────────────────────────────────────────────
// イベントごとのペイロード型
// ─────────────────────────────────────────────────────────────

interface JournalEntryCreatedPayload extends BaseEventFields {
  entryId: string;
  isPublic: boolean;
  tagCount: number;
}

interface JournalEntryUpdatedPayload extends BaseEventFields {
  entryId: string;
}

interface JournalEntryDeletedPayload extends BaseEventFields {
  entryId: string;
}

interface JournalEntryReadPayload extends BaseEventFields {
  entryId: string;
  isPublic: boolean;
  accessType: 'owner' | 'public_feed';
}

interface JournalEntryListReadPayload extends BaseEventFields {
  endpoint: 'public' | 'mine';
  count: number;
  page?: number;
}

interface TagCreatedPayload extends BaseEventFields {
  tagId: string;
  name: string;
  category: 'positive' | 'negative' | 'neutral';
}

interface TagDeletedPayload extends BaseEventFields {
  tagId: string;
  affectedEntries: number;
}

interface TagListReadPayload extends BaseEventFields {
  count: number;
}

interface JournalEntryCreateInvalidTagsPayload extends BaseEventFields {
  invalidTagIds: string[];
}

interface JournalEntryUpdateNotFoundPayload extends BaseEventFields {
  entryId: string;
}

interface TagForbiddenPayload extends BaseEventFields {
  tagId?: string;
  action: 'create' | 'delete';
  roles: string[];
}

interface SessionCreatedPayload extends BaseEventFields {
  sessionId: string;
  ip?: string;
  userAgent?: string;
}

interface SessionRevokedPayload extends BaseEventFields {
  sessionId: string;
  reason: 'user_logout' | 'admin_force' | 'role_change' | 'tenant_suspended';
}

interface SessionExpiredPayload extends BaseEventFields {
  sessionId: string;
  reason: 'idle_timeout' | 'absolute_max';
}

// AI 整理 入力イベント
interface AiCaptureInputStartedPayload extends BaseEventFields {
  // textarea で初めて 1 文字以上入力された瞬間。同セッションで 1 回のみ発火想定。
  source: 'rough_capture';
}

interface AiCaptureSubmittedPayload extends BaseEventFields {
  inputLength: number;
}

// chimo 2026-05-20: H3 morning_plan は撤去 (project_h3_reframing_20260520)。
// 旧 MorningPlanHint*Payload / CapacityModalDefaultHint*Payload /
// PlanResultButtonsHint*Payload / PlanResultStartHint*Payload /
// TodayPlanFeedbackHint*Payload / TodayPlanDoneHint*Payload は削除。

// F3: フィードバック返信。 system_admin による返信投稿
interface FeedbackReplyPostedPayload extends BaseEventFields {
  // userId は system_admin の id、tenantId は対象 submission のもの
  // (system_admin 自身は tenantId を持たないため)
  submissionId: string;
  replyId: string;
  contentLength: number;
}

// 教員側: mark-read API call (accordion 展開で 1 度だけ)
type FeedbackThreadMarkedReadPayload = BaseEventFields;

interface FeedbackUnreadHintShownPayload extends BaseEventFields {
  version: string;
}

interface FeedbackUnreadHintDismissedPayload extends BaseEventFields {
  // close_button: × クリック / cta_click: FAB 押下 (= 教員が気づいてモーダル開いた)
  reason: 'close_button' | 'cta_click';
  version: string;
}

// カレンダー機能 (Unit-06) analytics (chimo 2026-05-30)
// version は server 側で定数 'calendar-v1' を付与 (calendar に version 概念は無いが
// morning_card_events と同型を保つため列を残す)。
interface CalendarViewSwitchedPayload extends BaseEventFields {
  version: string;
  view: 'board' | 'calendar';
}

interface CalendarTaskMovedPayload extends BaseEventFields {
  version: string;
  taskId: string;
  fromDate: string | null;
  toDate: string;
}

interface CalendarTaskPushedToNextWeekPayload extends BaseEventFields {
  version: string;
  taskId: string;
  fromDate: string | null;
  toDate: string;
}

interface CalendarTaskCreatedFromPlusPayload extends BaseEventFields {
  version: string;
  date: string;
  taskId: string;
}

interface CalendarDayDetailOpenedPayload extends BaseEventFields {
  version: string;
  date: string;
}

// H7-B 職員室ボード (staffroom) 循環計測。数値化・スコア化はしない (踏み絵ガード 2/3/7)。
interface StaffroomBoardPostedPayload extends BaseEventFields {
  boardEntryId: string;
  boardKind: 'keep' | 'concern' | 'thanks' | 'help';
}
interface StaffroomBoardReactedPayload extends BaseEventFields {
  boardEntryId: string;
  reactionType: 'knowledge' | 'appreciation' | 'endorsement';
}

// ─────────────────────────────────────────────────────────────
// イベント名 → ペイロード型のマッピング
// ─────────────────────────────────────────────────────────────

export interface LogEventPayloads {
  [LogEvents.JournalEntryCreated]: JournalEntryCreatedPayload;
  [LogEvents.JournalEntryUpdated]: JournalEntryUpdatedPayload;
  [LogEvents.JournalEntryDeleted]: JournalEntryDeletedPayload;
  [LogEvents.JournalEntryRead]: JournalEntryReadPayload;
  [LogEvents.JournalEntryListRead]: JournalEntryListReadPayload;
  [LogEvents.TagCreated]: TagCreatedPayload;
  [LogEvents.TagDeleted]: TagDeletedPayload;
  [LogEvents.TagListRead]: TagListReadPayload;
  [LogEvents.JournalEntryCreateInvalidTags]: JournalEntryCreateInvalidTagsPayload;
  [LogEvents.JournalEntryUpdateNotFound]: JournalEntryUpdateNotFoundPayload;
  [LogEvents.TagForbidden]: TagForbiddenPayload;
  [LogEvents.SessionCreated]: SessionCreatedPayload;
  [LogEvents.SessionRevoked]: SessionRevokedPayload;
  [LogEvents.SessionExpired]: SessionExpiredPayload;
  [LogEvents.AiCaptureInputStarted]: AiCaptureInputStartedPayload;
  [LogEvents.AiCaptureSubmitted]: AiCaptureSubmittedPayload;
  [LogEvents.FeedbackReplyPosted]: FeedbackReplyPostedPayload;
  [LogEvents.FeedbackThreadMarkedRead]: FeedbackThreadMarkedReadPayload;
  [LogEvents.FeedbackUnreadHintShown]: FeedbackUnreadHintShownPayload;
  [LogEvents.FeedbackUnreadHintDismissed]: FeedbackUnreadHintDismissedPayload;
  [LogEvents.CalendarViewSwitched]: CalendarViewSwitchedPayload;
  [LogEvents.CalendarTaskMoved]: CalendarTaskMovedPayload;
  [LogEvents.CalendarTaskPushedToNextWeek]: CalendarTaskPushedToNextWeekPayload;
  [LogEvents.CalendarTaskCreatedFromPlus]: CalendarTaskCreatedFromPlusPayload;
  [LogEvents.CalendarDayDetailOpened]: CalendarDayDetailOpenedPayload;
  [LogEvents.StaffroomBoardPosted]: StaffroomBoardPostedPayload;
  [LogEvents.StaffroomBoardReacted]: StaffroomBoardReactedPayload;
}

// ─────────────────────────────────────────────────────────────
// 型安全なイベントログ出力ヘルパー
// ─────────────────────────────────────────────────────────────

/**
 * 型安全に構造化ログを出力する。
 * イベント名とペイロードの組み合わせがコンパイル時に検証される。
 *
 * @example
 *   logEvent(LogEvents.JournalEntryCreated, {
 *     entryId: 'e1', userId: 'u1', tenantId: 't1',
 *     isPublic: true, tagCount: 2
 *   });
 */
export function logEvent<K extends LogEventName>(
  event: K,
  payload: LogEventPayloads[K],
  log: Logger = defaultLogger
): void {
  // pino の conditional type が generic K でエラーになるため Record にキャスト
  // 呼び出し側の型安全性（event 名 × payload）は維持される
  log.info({ event, ...payload } as Record<string, unknown>);
}

/**
 * 警告レベルのイベントログ（バリデーション失敗・権限エラー等）
 */
export function logWarnEvent<K extends LogEventName>(
  event: K,
  payload: LogEventPayloads[K],
  message?: string,
  log: Logger = defaultLogger
): void {
  const obj = { event, ...payload } as Record<string, unknown>;
  if (message) {
    log.warn(obj, message);
  } else {
    log.warn(obj);
  }
}
