// ふりかえり → AIリコメンドの区分ルーティング (ルール側) と宛先導出・出力スキーマの単体テスト。
import { describe, it, expect } from 'vitest';
import { routeCategory, type RouterTag } from '@/features/journal/recommend/recommendRouter';
import {
  categoryToDestination,
  categoryToBoardKind,
  retroRecommendResultSchema,
} from '@/features/journal/recommend/recommendSchema';
import { composeReflection } from '@/features/journal/lib/reflectionTemplate';

const neg: RouterTag = { name: '不安', category: 'negative' };
const pos: RouterTag = { name: '喜び', category: 'positive' };

describe('routeCategory', () => {
  it('困りごと欄 + ネガタグ → 相談 (soudan)', () => {
    const content = composeReflection({
      keep: '',
      problem: '連絡帳の返事をどこまで書くか毎回迷う',
      try: '',
    });
    expect(routeCategory(content, [neg])).toBe('soudan');
  });

  it('困りごと欄に助けを求める語があれば、ネガタグ無しでも相談', () => {
    const content = composeReflection({
      keep: '',
      problem: '保護者対応をどうすればいいか相談したい',
      try: '',
    });
    expect(routeCategory(content, [])).toBe('soudan');
  });

  it('よかったことが並んでいても、困りごと欄に中身があれば相談を優先 (chimo 2026-07-01)', () => {
    const content = composeReflection({
      keep: '授業の前に生徒たちと雑談ができた',
      problem: '1人でいる子が気になる',
      try: '',
    });
    // ポジタグしか無くても、困りごと欄に書いた時点で相談。
    expect(routeCategory(content, [pos])).toBe('soudan');
  });

  it('困りごと欄が「特になし」なら相談にしない', () => {
    const content = composeReflection({
      keep: '今日は落ち着いた一日だった',
      problem: '特になし',
      try: '',
    });
    expect(routeCategory(content, [pos])).toBe('tweet');
  });

  it('keep 欄に感謝の語 → 感謝 (kansha)', () => {
    const content = composeReflection({
      keep: '学年の先生に助けてもらって本当にありがとう',
      problem: '',
      try: '',
    });
    expect(routeCategory(content, [pos])).toBe('kansha');
  });

  it('再現できる工夫の語 → ナレッジ (knowledge)', () => {
    const content = composeReflection({
      keep: '授業の導入の小ネタがウケた。このやり方は使える',
      problem: '',
      try: '',
    });
    expect(routeCategory(content, [pos])).toBe('knowledge');
  });

  it('「次に試したいこと」欄あり → ナレッジ寄り', () => {
    const content = composeReflection({
      keep: '',
      problem: '',
      try: '来週は席替えの方法を変えてみる',
    });
    expect(routeCategory(content, [])).toBe('knowledge');
  });

  it('ポジタグだけの軽い keep → つぶやき (tweet)', () => {
    const content = composeReflection({
      keep: '今日は気持ちのいい一日だった',
      problem: '',
      try: '',
    });
    expect(routeCategory(content, [pos])).toBe('tweet');
  });

  it('手がかりが無ければ null (ゼロ件を許容)', () => {
    expect(routeCategory('', [])).toBeNull();
  });
});

describe('categoryToDestination / categoryToBoardKind (AI に選ばせず関数導出)', () => {
  it('相談/感謝/ナレッジ → board、つぶやき → note', () => {
    expect(categoryToDestination('soudan')).toBe('board');
    expect(categoryToDestination('kansha')).toBe('board');
    expect(categoryToDestination('knowledge')).toBe('board');
    expect(categoryToDestination('tweet')).toBe('note');
  });

  it('board 区分は staffroom board kind に対応、つぶやきは board kind なし', () => {
    expect(categoryToBoardKind('soudan')).toBe('help');
    expect(categoryToBoardKind('kansha')).toBe('thanks');
    expect(categoryToBoardKind('knowledge')).toBe('knowledge');
    expect(categoryToBoardKind('tweet')).toBeNull();
  });
});

describe('retroRecommendResultSchema (strict)', () => {
  it('正しい主提案を受理する', () => {
    const ok = {
      surface: true,
      primary: {
        category: 'soudan',
        awareness: '一人で抱えなくていいかも',
        draft: 'みなさんどうしていますか?',
        meta: {},
      },
      tweet: null,
      reason: 'ネガ + 困りごと',
    };
    expect(retroRecommendResultSchema.safeParse(ok).success).toBe(true);
  });

  it('つぶやき枠は nudge のみ・surface=false は primary/tweet null を許容', () => {
    expect(
      retroRecommendResultSchema.safeParse({
        surface: false,
        primary: null,
        tweet: null,
        reason: '出す価値なし',
      }).success,
    ).toBe(true);
  });

  it('未知フィールドは strict で弾く (AI が mood を勝手に足す等を防ぐ)', () => {
    const withMood = {
      surface: true,
      primary: null,
      tweet: { nudge: 'つぶやいてみては?' },
      reason: 'ok',
      mood: 'positive', // ← 許可しない
    };
    expect(retroRecommendResultSchema.safeParse(withMood).success).toBe(false);
  });
});
