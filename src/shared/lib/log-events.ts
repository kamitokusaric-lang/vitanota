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

  // chimo 2026-05-20: H3 morning_plan は撤去 (project_h3_reframing_20260520)。
  // 旧 MorningPlanHint* / CapacityModalDefaultHint* / PlanResultButtonsHint* /
  // PlanResultStartHint* / TodayPlanFeedbackHint* / TodayPlanDoneHint* は削除。

  // F3: フィードバック返信 (片方向スレッド)。全て info 出力、踏み絵で warn 化しない
  FeedbackReplyPosted: 'feedback_reply_posted',
  FeedbackThreadMarkedRead: 'feedback_thread_marked_read',

  // F3: FAB の未読 dot 上に出すヒント (chimo 2026-05-17)
  FeedbackUnreadHintShown: 'feedback_unread_hint_shown',
  FeedbackUnreadHintDismissed: 'feedback_unread_hint_dismissed',

  // H3-B: 朝カード (project_h3_morning_arrival_value) の利用計測 (chimo 2026-05-20)。
  // 全て info 出力、 「dismiss = 負シグナル」 として扱わない (踏み絵: 観測感を作らない)。
  MorningCardShown: 'morning_card_shown',
  MorningCardDismissed: 'morning_card_dismissed',
  MorningCardCandidateClicked: 'morning_card_candidate_clicked',
  MorningCardCandidateStatusChanged: 'morning_card_candidate_status_changed',
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

// H3-B 朝カード analytics (chimo 2026-05-20)
// position は候補リスト上の 1-indexed の表示位置 (1 = 一番上)。
// urgency は朝カード API の MorningCardCandidate.urgency と同値。
type MorningCardUrgency =
  | 'overdue'
  | 'today'
  | 'soon'
  | 'in_progress'
  | 'no_due_date'
  | 'other';
type MorningCardStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

interface MorningCardShownPayload extends BaseEventFields {
  version: string;
  candidateCount: number;
  overdueCount: number;
  todayDueCount: number;
  noDueDateCount: number;
  yesterdayDoneCount: number;
}

interface MorningCardDismissedPayload extends BaseEventFields {
  version: string;
}

interface MorningCardCandidateClickedPayload extends BaseEventFields {
  version: string;
  position: number;
  urgency: MorningCardUrgency;
}

interface MorningCardCandidateStatusChangedPayload extends BaseEventFields {
  version: string;
  position: number;
  urgency: MorningCardUrgency;
  from: MorningCardStatus;
  to: MorningCardStatus;
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
  [LogEvents.FeedbackReplyPosted]: FeedbackReplyPostedPayload;
  [LogEvents.FeedbackThreadMarkedRead]: FeedbackThreadMarkedReadPayload;
  [LogEvents.FeedbackUnreadHintShown]: FeedbackUnreadHintShownPayload;
  [LogEvents.FeedbackUnreadHintDismissed]: FeedbackUnreadHintDismissedPayload;
  [LogEvents.MorningCardShown]: MorningCardShownPayload;
  [LogEvents.MorningCardDismissed]: MorningCardDismissedPayload;
  [LogEvents.MorningCardCandidateClicked]: MorningCardCandidateClickedPayload;
  [LogEvents.MorningCardCandidateStatusChanged]: MorningCardCandidateStatusChangedPayload;
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
