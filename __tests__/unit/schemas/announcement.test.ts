import { describe, it, expect } from 'vitest';
import {
  announcementCreateSchema,
  announcementUpdateSchema,
} from '@/schemas/announcement';

describe('announcementCreateSchema', () => {
  it('最小構成 (publishDate + title) を受け入れ、body は空配列 default', () => {
    const result = announcementCreateSchema.safeParse({
      publishDate: '2026-05-09',
      title: 'タスクボードを更新しました',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).toEqual([]);
    }
  });

  it('全フィールド指定を受け入れる', () => {
    const result = announcementCreateSchema.safeParse({
      publishDate: '2026-05-08',
      title: '不具合修正のお知らせ',
      body: ['担当者選択スクロール修正', 'タスクボード初期表示変更'],
    });
    expect(result.success).toBe(true);
  });

  it('publishDate が YYYY-MM-DD じゃないと拒否', () => {
    const result = announcementCreateSchema.safeParse({
      publishDate: '05/09/2026',
      title: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('title が空文字を拒否', () => {
    const result = announcementCreateSchema.safeParse({
      publishDate: '2026-05-09',
      title: '',
    });
    expect(result.success).toBe(false);
  });

  it('title が trim 後空 (空白のみ) を拒否', () => {
    const result = announcementCreateSchema.safeParse({
      publishDate: '2026-05-09',
      title: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('title 500 文字を受け入れる', () => {
    const result = announcementCreateSchema.safeParse({
      publishDate: '2026-05-09',
      title: 'x'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('title 501 文字を拒否', () => {
    const result = announcementCreateSchema.safeParse({
      publishDate: '2026-05-09',
      title: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('body が配列じゃないと拒否', () => {
    const result = announcementCreateSchema.safeParse({
      publishDate: '2026-05-09',
      title: 'X',
      body: 'not an array',
    });
    expect(result.success).toBe(false);
  });

  it('publishDate 欠落を拒否', () => {
    const result = announcementCreateSchema.safeParse({
      title: 'X',
    });
    expect(result.success).toBe(false);
  });
});

describe('announcementUpdateSchema', () => {
  it('title のみの部分更新を受け入れる', () => {
    const result = announcementUpdateSchema.safeParse({
      title: '新タイトル',
    });
    expect(result.success).toBe(true);
  });

  it('publishDate のみの部分更新を受け入れる', () => {
    const result = announcementUpdateSchema.safeParse({
      publishDate: '2026-06-01',
    });
    expect(result.success).toBe(true);
  });

  it('body のみの部分更新を受け入れる (空配列 OK)', () => {
    const result = announcementUpdateSchema.safeParse({ body: [] });
    expect(result.success).toBe(true);
  });

  it('全フィールド指定を受け入れる', () => {
    const result = announcementUpdateSchema.safeParse({
      publishDate: '2026-06-01',
      title: '更新',
      body: ['行1', '行2'],
    });
    expect(result.success).toBe(true);
  });

  it('空オブジェクトを拒否 (更新項目なし)', () => {
    const result = announcementUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('publishDate が不正形式だと拒否', () => {
    const result = announcementUpdateSchema.safeParse({
      publishDate: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });

  it('title が 501 文字だと拒否', () => {
    const result = announcementUpdateSchema.safeParse({
      title: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
