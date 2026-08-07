// 投稿種別 (kind) の表示メタ。
//
// ここが投稿欄 (TodayCaptureBox) とタイムライン (PublicTimelineRail) の**共通の正本**。
// 別々に定義するとラベルや色がズレるので、両方がこれを見ていることを固定する。
import { describe, it, expect } from 'vitest';
import {
  JOURNAL_KIND_META,
  findJournalKindMeta,
} from '@/features/journal/kindMeta';

describe('JOURNAL_KIND_META', () => {
  it('投稿欄で選べる4種を持つ', () => {
    expect(Object.keys(JOURNAL_KIND_META).sort()).toEqual(
      ['help', 'knowledge', 'note', 'thanks'].sort(),
    );
  });

  it('ラベルは投稿欄のチップと同じ文言', () => {
    expect(JOURNAL_KIND_META.note.label).toBe('つぶやき');
    expect(JOURNAL_KIND_META.thanks.label).toBe('感謝');
    expect(JOURNAL_KIND_META.help.label).toBe('相談・確認');
    expect(JOURNAL_KIND_META.knowledge.label).toBe('ナレッジ');
  });

  it('生徒系 (keep/concern) は職員室ノートの種別に含めない (踏み絵)', () => {
    expect(findJournalKindMeta('keep')).toBeNull();
    expect(findJournalKindMeta('concern')).toBeNull();
  });
});

describe('findJournalKindMeta', () => {
  it('既知の kind はメタを返す', () => {
    expect(findJournalKindMeta('help')?.label).toBe('相談・確認');
  });

  it('旧 kind (diary / tweet) には何も出さない', () => {
    expect(findJournalKindMeta('diary')).toBeNull();
    expect(findJournalKindMeta('tweet')).toBeNull();
  });

  it('null / undefined / 空文字でも落ちない', () => {
    expect(findJournalKindMeta(null)).toBeNull();
    expect(findJournalKindMeta(undefined)).toBeNull();
    expect(findJournalKindMeta('')).toBeNull();
  });
});
