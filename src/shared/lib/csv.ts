// RFC 4180 準拠の CSV 生成ユーティリティ。
// system_admin 用データエクスポートで使う。Excel で開いて文字化けしないよう UTF-8 BOM 付き。

const QUOTE_NEEDLE = /[",\n\r]/;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === 'object') {
    s = JSON.stringify(value);
  } else {
    s = String(value);
  }
  if (QUOTE_NEEDLE.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCell).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  // UTF-8 BOM + CRLF
  return '﻿' + lines.join('\r\n') + '\r\n';
}
