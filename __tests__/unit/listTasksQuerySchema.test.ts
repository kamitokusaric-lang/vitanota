import { describe, it, expect } from 'vitest';
import { listTasksQuerySchema } from '@/features/tasks/schemas/task';

describe('listTasksQuerySchema', () => {
  describe('mode 未指定 (旧互換: 期間フィルタなし)', () => {
    it('空オブジェクトは通る (全件取得)', () => {
      expect(listTasksQuerySchema.safeParse({}).success).toBe(true);
    });

    it('scope=mine のみは通る', () => {
      expect(listTasksQuerySchema.safeParse({ scope: 'mine' }).success).toBe(true);
    });

    it('ownerUserId のみは通る', () => {
      const ok = listTasksQuerySchema.safeParse({
        ownerUserId: '11111111-1111-1111-1111-111111111111',
      });
      expect(ok.success).toBe(true);
    });

    it('ownerUserId が UUID でない場合は reject', () => {
      expect(listTasksQuerySchema.safeParse({ ownerUserId: 'not-uuid' }).success).toBe(false);
    });
  });

  describe('mode=default (3 点セット: 今週 + null + 期限切れ未完了)', () => {
    it('weekStart と weekEnd の両方が揃っていれば通る', () => {
      const ok = listTasksQuerySchema.safeParse({
        mode: 'default',
        weekStart: '2026-05-04',
        weekEnd: '2026-05-10',
      });
      expect(ok.success).toBe(true);
    });

    it('weekStart 欠損は reject', () => {
      const ng = listTasksQuerySchema.safeParse({
        mode: 'default',
        weekEnd: '2026-05-10',
      });
      expect(ng.success).toBe(false);
    });

    it('weekEnd 欠損は reject', () => {
      const ng = listTasksQuerySchema.safeParse({
        mode: 'default',
        weekStart: '2026-05-04',
      });
      expect(ng.success).toBe(false);
    });

    it('両方欠損は reject', () => {
      expect(listTasksQuerySchema.safeParse({ mode: 'default' }).success).toBe(false);
    });

    it('weekStart が YYYY-MM-DD 以外なら reject', () => {
      const ng = listTasksQuerySchema.safeParse({
        mode: 'default',
        weekStart: '2026/05/04',
        weekEnd: '2026-05-10',
      });
      expect(ng.success).toBe(false);
    });
  });

  describe('mode=range (純粋に due_date が from〜to)', () => {
    it('from と to の両方が揃っていれば通る', () => {
      const ok = listTasksQuerySchema.safeParse({
        mode: 'range',
        from: '2026-04-27',
        to: '2026-05-03',
      });
      expect(ok.success).toBe(true);
    });

    it('from 欠損は reject', () => {
      const ng = listTasksQuerySchema.safeParse({
        mode: 'range',
        to: '2026-05-03',
      });
      expect(ng.success).toBe(false);
    });

    it('to 欠損は reject', () => {
      const ng = listTasksQuerySchema.safeParse({
        mode: 'range',
        from: '2026-04-27',
      });
      expect(ng.success).toBe(false);
    });

    it('両方欠損は reject', () => {
      expect(listTasksQuerySchema.safeParse({ mode: 'range' }).success).toBe(false);
    });

    it('from が不正フォーマットなら reject', () => {
      const ng = listTasksQuerySchema.safeParse({
        mode: 'range',
        from: '20260427',
        to: '2026-05-03',
      });
      expect(ng.success).toBe(false);
    });
  });

  describe('mode 値の妥当性', () => {
    it('未知の mode は reject', () => {
      const ng = listTasksQuerySchema.safeParse({ mode: 'weekly' });
      expect(ng.success).toBe(false);
    });
  });

  describe('複合', () => {
    it('scope=mine + mode=default + 期間指定は通る', () => {
      const ok = listTasksQuerySchema.safeParse({
        scope: 'mine',
        mode: 'default',
        weekStart: '2026-05-04',
        weekEnd: '2026-05-10',
      });
      expect(ok.success).toBe(true);
    });

    it('ownerUserId + mode=range は通る', () => {
      const ok = listTasksQuerySchema.safeParse({
        ownerUserId: '11111111-1111-1111-1111-111111111111',
        mode: 'range',
        from: '2026-04-27',
        to: '2026-05-03',
      });
      expect(ok.success).toBe(true);
    });
  });
});
