// ロスター CSV をクライアントでパースして行 (ImportRow) に変換する純関数。
// 形式: 先頭行ヘッダー、列 = クラス / クラス目標 / 生徒名 / 学年 (順不同・別名許容)。
// 引用符 (" ") でくくられたフィールド内のカンマ・改行・"" エスケープに対応。
import type { ImportRow } from '../schemas/batonRelay';

export interface ParseResult {
  rows: ImportRow[];
  errors: string[];
}

// RFC4180 ゆるめのトークナイザ。text → レコード (フィールド配列) の配列。
function parseCsvRecords(text: string): string[][] {
  const s = text.replace(/\r\n?/g, '\n');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  record.push(field);
  records.push(record);

  // 完全に空のレコードを除外
  return records.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  className: ['クラス', 'クラス名', 'class'],
  classGoal: ['クラス目標', '目標', 'goal'],
  studentName: ['生徒名', '氏名', '名前', '生徒', 'student'],
  grade: ['学年', 'grade'],
};

function findIndex(header: string[], aliases: string[]): number {
  return header.findIndex((h) => aliases.includes(h.trim().toLowerCase()) || aliases.includes(h.trim()));
}

export function parseRosterCsv(text: string): ParseResult {
  const errors: string[] = [];
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { rows: [], errors: ['CSV が空です'] };
  }

  const header = records[0];
  const idx = {
    className: findIndex(header, HEADER_ALIASES.className),
    classGoal: findIndex(header, HEADER_ALIASES.classGoal),
    studentName: findIndex(header, HEADER_ALIASES.studentName),
    grade: findIndex(header, HEADER_ALIASES.grade),
  };

  if (idx.className < 0 || idx.studentName < 0) {
    return {
      rows: [],
      errors: ['ヘッダー行に「クラス」と「生徒名」の列が必要です'],
    };
  }

  const rows: ImportRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    const className = (rec[idx.className] ?? '').trim();
    const studentName = (rec[idx.studentName] ?? '').trim();
    const classGoal = idx.classGoal >= 0 ? (rec[idx.classGoal] ?? '').trim() : '';
    const grade = idx.grade >= 0 ? (rec[idx.grade] ?? '').trim() : '';

    if (!className || !studentName) {
      errors.push(`${i + 1} 行目: クラスまたは生徒名が空のため飛ばしました`);
      continue;
    }
    rows.push({
      className,
      studentName,
      ...(classGoal ? { classGoal } : {}),
      ...(grade ? { grade } : {}),
    });
  }

  return { rows, errors };
}
