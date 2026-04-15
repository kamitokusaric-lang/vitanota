import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogEvents, logEvent, logWarnEvent } from '@/shared/lib/log-events';

describe('LogEvents 定数', () => {
  it('全イベント名が kebab/snake_case で定義されている', () => {
    const values = Object.values(LogEvents);
    for (const v of values) {
      expect(v).toMatch(/^[a-z_]+$/);
    }
  });

  it('重複がない', () => {
    const values = Object.values(LogEvents);
    expect(new Set(values).size).toBe(values.length);
  });

  it('Unit-02 の主要イベントが全て含まれている', () => {
    expect(LogEvents.JournalEntryCreated).toBe('journal_entry_created');
    expect(LogEvents.JournalEntryUpdated).toBe('journal_entry_updated');
    expect(LogEvents.JournalEntryDeleted).toBe('journal_entry_deleted');
    expect(LogEvents.JournalEntryRead).toBe('journal_entry_read');
    expect(LogEvents.JournalEntryListRead).toBe('journal_entry_list_read');
    expect(LogEvents.TagCreated).toBe('tag_created');
    expect(LogEvents.TagDeleted).toBe('tag_deleted');
    expect(LogEvents.TagListRead).toBe('tag_list_read');
    expect(LogEvents.SessionCreated).toBe('session_created');
    expect(LogEvents.SessionRevoked).toBe('session_revoked');
    expect(LogEvents.SessionExpired).toBe('session_expired');
  });
});

describe('logEvent', () => {
  let mockLogger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockLogger = { info: vi.fn(), warn: vi.fn() };
  });

  it('event 名と payload を info で出力する', () => {
    logEvent(
      LogEvents.JournalEntryCreated,
      {
        entryId: 'e1',
        userId: 'u1',
        tenantId: 't1',
        isPublic: true,
        tagCount: 2,
      },
      mockLogger as never
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'journal_entry_created',
        entryId: 'e1',
        userId: 'u1',
        tenantId: 't1',
        isPublic: true,
        tagCount: 2,
      })
    );
  });

  it('異なるイベントは異なる event 名で出力される', () => {
    logEvent(
      LogEvents.TagCreated,
      {
        tagId: 'tag1',
        userId: 'u1',
        tenantId: 't1',
        name: 'test',
        isEmotion: false,
      },
      mockLogger as never
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'tag_created', name: 'test' })
    );
  });
});

describe('logWarnEvent', () => {
  let mockLogger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockLogger = { info: vi.fn(), warn: vi.fn() };
  });

  it('message なしで呼ぶと obj のみ warn に渡される', () => {
    logWarnEvent(
      LogEvents.TagDeleteForbidden,
      {
        tagId: 'tag1',
        userId: 'u1',
        tenantId: 't1',
        roles: ['teacher'],
      },
      undefined,
      mockLogger as never
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'tag_delete_forbidden',
        roles: ['teacher'],
      })
    );
    // 引数は1つだけ（message なし）
    expect(mockLogger.warn.mock.calls[0]).toHaveLength(1);
  });

  it('message ありで呼ぶと (obj, message) の形で warn に渡される', () => {
    logWarnEvent(
      LogEvents.JournalEntryCreateInvalidTags,
      {
        userId: 'u1',
        tenantId: 't1',
        invalidTagIds: ['bad-id'],
      },
      'Invalid tag references',
      mockLogger as never
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'journal_entry_create_invalid_tags' }),
      'Invalid tag references'
    );
  });
});
