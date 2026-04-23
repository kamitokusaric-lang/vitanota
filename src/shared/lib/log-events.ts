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
