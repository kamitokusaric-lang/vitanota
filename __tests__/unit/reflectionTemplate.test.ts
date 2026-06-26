// ふりかえり「3行日誌テンプレ」直列化/復元ヘルパーの単体テスト。
import { describe, it, expect } from 'vitest';
import {
  composeReflection,
  parseReflection,
  emptyReflectionValues,
} from '@/features/journal/lib/reflectionTemplate';

describe('composeReflection', () => {
  it('全欄埋まっていれば見出し付きで 3 区分を連結する', () => {
    const out = composeReflection({ keep: 'a', problem: 'b', try: 'c' });
    expect(out).toBe(
      'よかった・続けたいこと\na\n\n気になった・困ったこと\nb\n\n次に試したいこと\nc',
    );
  });

  it('空欄の見出しは含めない (一部だけでも OK)', () => {
    const out = composeReflection({ keep: 'やったやった', problem: '', try: '' });
    expect(out).toBe('よかった・続けたいこと\nやったやった');
    expect(out).not.toContain('気になった');
    expect(out).not.toContain('次に試したい');
  });

  it('全欄空なら空文字 (保存不可の判定に使う)', () => {
    expect(composeReflection(emptyReflectionValues())).toBe('');
  });

  it('前後の空白はトリムする', () => {
    expect(composeReflection({ keep: '  x  ', problem: '', try: '' })).toBe(
      'よかった・続けたいこと\nx',
    );
  });
});

describe('parseReflection', () => {
  it('compose した content を往復で復元できる', () => {
    const values = { keep: 'よかった', problem: '困った\n2行目', try: '試す' };
    const parsed = parseReflection(composeReflection(values));
    expect(parsed.isTemplate).toBe(true);
    expect(parsed.values).toEqual(values);
  });

  it('見出しが 1 つだけでもテンプレとして復元する', () => {
    const parsed = parseReflection('次に試したいこと\nやってみる');
    expect(parsed.isTemplate).toBe(true);
    expect(parsed.values).toEqual({ keep: '', problem: '', try: 'やってみる' });
  });

  it('見出しが無ければ自由記述 (isTemplate=false・各欄は空)', () => {
    const parsed = parseReflection('ただのメモ。今日は疲れた。');
    expect(parsed.isTemplate).toBe(false);
    expect(parsed.values).toEqual(emptyReflectionValues());
  });

  it('空文字も自由記述扱い', () => {
    expect(parseReflection('').isTemplate).toBe(false);
  });
});
