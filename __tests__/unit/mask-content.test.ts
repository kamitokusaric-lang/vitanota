import { describe, it, expect } from 'vitest';
import { maskContent } from '@/features/journal/lib/mask-content';

describe('maskContent', () => {
  describe('生徒系', () => {
    it('「太郎くん」を「生徒」に置換', () => {
      expect(maskContent('太郎くんが頑張った')).toBe('生徒が頑張った');
    });
    it('「○○ちゃん」を「生徒」に置換', () => {
      expect(maskContent('花子ちゃんと話した')).toBe('生徒と話した');
    });
    it('「○○君」(漢字) を「生徒」に置換', () => {
      expect(maskContent('健太君の質問に答えた')).toBe('生徒の質問に答えた');
    });
  });

  describe('教員系', () => {
    it('「○○先生」を「同僚」に置換', () => {
      expect(maskContent('田中先生と相談した')).toBe('同僚と相談した');
    });
    it('「○○教諭」を「同僚」に置換', () => {
      expect(maskContent('佐藤教諭から助言をもらった')).toBe(
        '同僚から助言をもらった',
      );
    });
    it('「校長」「教頭」「主任」も置換', () => {
      expect(maskContent('山田校長の話')).toBe('同僚の話');
      expect(maskContent('鈴木教頭からのメール')).toBe('同僚からのメール');
      expect(maskContent('木村主任が確認')).toBe('同僚が確認');
    });
  });

  describe('一般敬称 (さん/様)', () => {
    it('「○○さん」を「ある人」に置換', () => {
      expect(maskContent('田中さんから連絡があった')).toBe(
        'ある人から連絡があった',
      );
    });
    it('「○○様」を「ある人」に置換', () => {
      expect(maskContent('鈴木様への返信')).toBe('ある人への返信');
    });
    it('過剰検出回避: 「子どもさん」(ひらがな接頭辞) はマスクされない', () => {
      // 接頭辞を漢字・カタカナのみに限定したことで、ひらがな一般語は無傷
      expect(maskContent('子どもさんの様子')).toBe('子どもさんの様子');
    });
    it('過剰検出回避: 「皆さん」もマスクされない', () => {
      expect(maskContent('皆さんお疲れ様')).toBe('皆さんお疲れ様');
    });
  });

  describe('クラス名', () => {
    it('「○年○組」を「クラス」に置換', () => {
      expect(maskContent('3年2組の授業')).toBe('クラスの授業');
    });
    it('「○年○組○班」も「クラス」に置換', () => {
      expect(maskContent('1年5組3班での活動')).toBe('クラスでの活動');
    });
    it('漢数字「○年○組」も置換', () => {
      expect(maskContent('三年一組のクラスで')).toBe('クラスのクラスで');
    });
  });

  describe('学校名', () => {
    it('「○○小学校」を「学校」に置換', () => {
      expect(maskContent('桜丘小学校の校門前')).toBe('学校の校門前');
    });
    it('「○○中学校」「○○高校」も置換', () => {
      expect(maskContent('青葉中学校に異動')).toBe('学校に異動');
      expect(maskContent('北陵高校の校長会')).toBe('学校の同僚会');
      // ↑ 学校 → 「学校」、その後役職単独 「校長」 → 「同僚」
    });
  });

  describe('複合', () => {
    it('複数のパターンを同時に置換', () => {
      const input = '田中先生と3年2組の太郎くんについて話した';
      const expected = '同僚とクラスの生徒について話した';
      expect(maskContent(input)).toBe(expected);
    });
    it('原文に何もマスク対象がなければそのまま', () => {
      const input = '今日は静かな一日だった';
      expect(maskContent(input)).toBe(input);
    });
    it('空文字はそのまま', () => {
      expect(maskContent('')).toBe('');
    });
  });
});
