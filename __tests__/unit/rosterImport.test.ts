import { describe, it, expect } from 'vitest';
import { parseRosterCsv } from '@/features/baton-relay/lib/parseRosterCsv';
import {
  planRosterImport,
  type ExistingClass,
  type ExistingStudent,
} from '@/features/baton-relay/lib/rosterImportPlan';

describe('parseRosterCsv', () => {
  it('ヘッダー + 行をパースする', () => {
    const csv = 'クラス,クラス目標,生徒名,学年\n2-A,あいさつ,さくら,3年\n2-A,あいさつ,ひろき,3年';
    const { rows, errors } = parseRosterCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      className: '2-A',
      studentName: 'さくら',
      classGoal: 'あいさつ',
      grade: '3年',
    });
  });

  it('引用符でくくられたカンマ入りフィールドを扱う', () => {
    const csv = 'クラス,クラス目標,生徒名\n2-A,"あいさつ, えがお",さくら';
    const { rows } = parseRosterCsv(csv);
    expect(rows[0].classGoal).toBe('あいさつ, えがお');
  });

  it('列順が違ってもヘッダー名で対応づける', () => {
    const csv = '生徒名,学年,クラス\nさくら,3年,2-A';
    const { rows } = parseRosterCsv(csv);
    expect(rows[0]).toEqual({ className: '2-A', studentName: 'さくら', grade: '3年' });
  });

  it('必須列が無ければエラー', () => {
    const { rows, errors } = parseRosterCsv('なまえ,がくねん\nさくら,3年');
    expect(rows).toHaveLength(0);
    expect(errors[0]).toContain('クラス');
  });

  it('空行はスキップ、クラス/生徒名が空の行はエラーで飛ばす', () => {
    const csv = 'クラス,クラス目標,生徒名\n2-A,あいさつ,さくら\n\n,,ひろき\n2-B,めあて,';
    const { rows, errors } = parseRosterCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].studentName).toBe('さくら');
    expect(errors).toHaveLength(2);
  });
});

describe('planRosterImport', () => {
  const rows = [
    { className: '2-A', classGoal: 'あいさつ', studentName: 'さくら', grade: '3年' },
    { className: '2-A', classGoal: 'あいさつ', studentName: 'ひろき', grade: '3年' },
    { className: '2-B', classGoal: 'めあて', studentName: 'みなと', grade: '3年' },
  ];

  it('全部新規: クラス2・生徒3を作成', () => {
    const plan = planRosterImport(rows, [], []);
    expect(plan.summary).toEqual({
      classesCreated: 2,
      classesUpdated: 0,
      studentsAdded: 3,
      studentsSkipped: 0,
    });
    expect(plan.classesToCreate).toHaveLength(2);
    expect(plan.studentsToAdd).toHaveLength(3);
  });

  it('冪等: 同じ内容を再インポートすると何も増えない', () => {
    const existingClasses: ExistingClass[] = [
      { id: 'c-a', name: '2-A', goalText: 'あいさつ' },
      { id: 'c-b', name: '2-B', goalText: 'めあて' },
    ];
    const existingStudents: ExistingStudent[] = [
      { classId: 'c-a', displayName: 'さくら' },
      { classId: 'c-a', displayName: 'ひろき' },
      { classId: 'c-b', displayName: 'みなと' },
    ];
    const plan = planRosterImport(rows, existingClasses, existingStudents);
    expect(plan.summary).toEqual({
      classesCreated: 0,
      classesUpdated: 0,
      studentsAdded: 0,
      studentsSkipped: 3,
    });
  });

  it('既存クラスの目標が変わっていれば更新する', () => {
    const existingClasses: ExistingClass[] = [
      { id: 'c-a', name: '2-A', goalText: '古い目標' },
      { id: 'c-b', name: '2-B', goalText: 'めあて' },
    ];
    const plan = planRosterImport(rows, existingClasses, []);
    expect(plan.summary.classesUpdated).toBe(1);
    expect(plan.goalsToUpdate).toEqual([{ id: 'c-a', goalText: 'あいさつ' }]);
  });

  it('CSV 内の重複生徒はスキップ、新規クラスの生徒は className で追加', () => {
    const dupRows = [
      { className: '3-C', studentName: 'たろう' },
      { className: '3-C', studentName: 'たろう' },
    ];
    const plan = planRosterImport(dupRows, [], []);
    expect(plan.summary.studentsAdded).toBe(1);
    expect(plan.summary.studentsSkipped).toBe(1);
    expect(plan.studentsToAdd[0]).toEqual({
      className: '3-C',
      displayName: 'たろう',
      gradeLabel: null,
    });
  });
});
