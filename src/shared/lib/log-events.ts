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

  // AI 整理 (Phase 1 コア体験) のオンボーディング + 利用イベント
  // 注: 全て logEvent (info) のみ使用。「閉じる」を負シグナル扱いしない
  // (feedback_observed_moment_broken / feedback_design_vocab 踏み絵)。
  AiCaptureCoachmarkShown: 'ai_capture_coachmark_shown',
  AiCaptureCoachmarkAdvanced: 'ai_capture_coachmark_advanced',
  AiCaptureCoachmarkDismissed: 'ai_capture_coachmark_dismissed',
  AiCaptureInputStarted: 'ai_capture_input_started',
  AiCaptureSubmitted: 'ai_capture_submitted',

  // H3「今日の見通し」入口カード上のヒント (chimo 2026-05-16 方針転換、
  // 3 ステップ overlay から各 CTA 個別ヒントへ)
  MorningPlanHintShown: 'morning_plan_hint_shown',
  MorningPlanHintDismissed: 'morning_plan_hint_dismissed',

  // CapacityModal「ふつう」ボタン上のヒント (chimo 2026-05-17、離脱対策)
  CapacityModalDefaultHintShown: 'capacity_modal_default_hint_shown',
  CapacityModalDefaultHintDismissed: 'capacity_modal_default_hint_dismissed',

  // PlanResultModal の 3 ボタン (余裕があれば / 今日やらない / 完了にする) ヒント
  // 1 番目カードのみ表示、1 回の dismiss で 3 つ一括非表示
  PlanResultButtonsHintShown: 'plan_result_buttons_hint_shown',
  PlanResultButtonsHintDismissed: 'plan_result_buttons_hint_dismissed',

  // PlanResultModal「このタスクで今日の仕事を始める」CTA ヒント
  PlanResultStartHintShown: 'plan_result_start_hint_shown',
  PlanResultStartHintDismissed: 'plan_result_start_hint_dismissed',

  // TodayPlanView「今日の見通しは持てましたか?」フィードバック上のヒント
  TodayPlanFeedbackHintShown: 'today_plan_feedback_hint_shown',
  TodayPlanFeedbackHintDismissed: 'today_plan_feedback_hint_dismissed',

  // TodayPlanView「完了」ボタン上のヒント (1 番目タスクのみ)
  TodayPlanDoneHintShown: 'today_plan_done_hint_shown',
  TodayPlanDoneHintDismissed: 'today_plan_done_hint_dismissed',
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

// AI 整理コーチマーク + 入力イベント
interface AiCaptureCoachmarkShownPayload extends BaseEventFields {
  version: string;
}

interface AiCaptureCoachmarkAdvancedPayload extends BaseEventFields {
  step: 1 | 2 | 3;
  version: string;
}

interface AiCaptureCoachmarkDismissedPayload extends BaseEventFields {
  step: 1 | 2 | 3;
  reason: 'skip' | 'completed' | 'outside_click';
  version: string;
}

interface AiCaptureInputStartedPayload extends BaseEventFields {
  // textarea で初めて 1 文字以上入力された瞬間。同セッションで 1 回のみ発火想定。
  source: 'rough_capture';
}

interface AiCaptureSubmittedPayload extends BaseEventFields {
  inputLength: number;
}

interface MorningPlanHintShownPayload extends BaseEventFields {
  version: string;
}

interface MorningPlanHintDismissedPayload extends BaseEventFields {
  reason: 'close_button' | 'cta_click';
  version: string;
}

interface CapacityModalDefaultHintShownPayload extends BaseEventFields {
  version: string;
}

interface CapacityModalDefaultHintDismissedPayload extends BaseEventFields {
  // close_button: × クリック / cta_click: いずれかの capacity ボタン押下 (normal 以外も含む)
  reason: 'close_button' | 'cta_click';
  version: string;
}

interface PlanResultButtonsHintShownPayload extends BaseEventFields {
  version: string;
}

interface PlanResultButtonsHintDismissedPayload extends BaseEventFields {
  // close_button: × クリック / cta_click: いずれかの 3 ボタン押下
  reason: 'close_button' | 'cta_click';
  version: string;
}

interface PlanResultStartHintShownPayload extends BaseEventFields {
  version: string;
}

interface PlanResultStartHintDismissedPayload extends BaseEventFields {
  // close_button: × クリック / cta_click: 「今日の仕事を始める」押下
  reason: 'close_button' | 'cta_click';
  version: string;
}

interface TodayPlanFeedbackHintShownPayload extends BaseEventFields {
  version: string;
}

interface TodayPlanFeedbackHintDismissedPayload extends BaseEventFields {
  // close_button: × クリック / cta_click: フィードバックボタン押下 (持てた等) or × 押下
  reason: 'close_button' | 'cta_click';
  version: string;
}

interface TodayPlanDoneHintShownPayload extends BaseEventFields {
  version: string;
}

interface TodayPlanDoneHintDismissedPayload extends BaseEventFields {
  // close_button: × クリック / cta_click: 完了ボタン押下
  reason: 'close_button' | 'cta_click';
  version: string;
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
  [LogEvents.AiCaptureCoachmarkShown]: AiCaptureCoachmarkShownPayload;
  [LogEvents.AiCaptureCoachmarkAdvanced]: AiCaptureCoachmarkAdvancedPayload;
  [LogEvents.AiCaptureCoachmarkDismissed]: AiCaptureCoachmarkDismissedPayload;
  [LogEvents.AiCaptureInputStarted]: AiCaptureInputStartedPayload;
  [LogEvents.AiCaptureSubmitted]: AiCaptureSubmittedPayload;
  [LogEvents.MorningPlanHintShown]: MorningPlanHintShownPayload;
  [LogEvents.MorningPlanHintDismissed]: MorningPlanHintDismissedPayload;
  [LogEvents.CapacityModalDefaultHintShown]: CapacityModalDefaultHintShownPayload;
  [LogEvents.CapacityModalDefaultHintDismissed]: CapacityModalDefaultHintDismissedPayload;
  [LogEvents.PlanResultButtonsHintShown]: PlanResultButtonsHintShownPayload;
  [LogEvents.PlanResultButtonsHintDismissed]: PlanResultButtonsHintDismissedPayload;
  [LogEvents.PlanResultStartHintShown]: PlanResultStartHintShownPayload;
  [LogEvents.PlanResultStartHintDismissed]: PlanResultStartHintDismissedPayload;
  [LogEvents.TodayPlanFeedbackHintShown]: TodayPlanFeedbackHintShownPayload;
  [LogEvents.TodayPlanFeedbackHintDismissed]: TodayPlanFeedbackHintDismissedPayload;
  [LogEvents.TodayPlanDoneHintShown]: TodayPlanDoneHintShownPayload;
  [LogEvents.TodayPlanDoneHintDismissed]: TodayPlanDoneHintDismissedPayload;
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
