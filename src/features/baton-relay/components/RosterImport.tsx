import { useState } from 'react';
import { Upload, FileDown, AlertTriangle } from 'lucide-react';
import { useToast } from '@/shared/components/Toast';
import { parseRosterCsv } from '../lib/parseRosterCsv';
import type { ImportRow, ImportResult } from '../schemas/batonRelay';

interface RosterImportProps {
  onImported: () => Promise<void> | void;
}

const TEMPLATE_CSV = [
  'クラス,クラス目標,生徒名,学年',
  '2-A,あいさつから一日を,さくら,3年',
  '2-A,あいさつから一日を,ひろき,3年',
  '2-B,めあてをもとう,みなと,3年',
].join('\n');

// ロスター CSV インポート (一括登録)。CSV はクライアントでパースして行を送る。
export function RosterImport({ onImported }: RosterImportProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const handleText = (text: string, name: string) => {
    const result = parseRosterCsv(text);
    setRows(result.rows);
    setErrors(result.errors);
    setFileName(name);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    handleText(text, file.name);
  };

  const downloadTemplate = () => {
    // Excel が UTF-8 として開けるよう BOM を付ける
    const blob = new Blob(['﻿' + TEMPLATE_CSV], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roster-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/baton-relay/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        showToast('取り込みに失敗しました', 'error');
        return;
      }
      const r = (await res.json()) as ImportResult;
      showToast(
        `クラス ${r.classesCreated + r.classesUpdated} 件 / 生徒 ${r.studentsAdded} 人を取り込みました` +
          (r.studentsSkipped > 0 ? `（${r.studentsSkipped} 人は登録済みでスキップ）` : ''),
        'success',
      );
      setRows([]);
      setErrors([]);
      setFileName('');
      await onImported();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-vn border border-vn-border bg-white p-3.5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <Upload size={16} aria-hidden />
        CSV でまとめて取り込む
      </div>
      <p className="mt-1 text-xs text-gray-500">
        列は「クラス / クラス目標 / 生徒名 / 学年」。同じ生徒は何度入れても重複しません。
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-vn-border-strong bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Upload size={15} aria-hidden />
          CSV を選ぶ
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 text-sm text-vn-accent hover:underline"
        >
          <FileDown size={15} aria-hidden />
          テンプレートをダウンロード
        </button>
      </div>

      {/* 貼り付け */}
      <textarea
        placeholder="または CSV をここに貼り付け…"
        onChange={(e) => handleText(e.target.value, '貼り付け')}
        rows={3}
        className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-base placeholder:text-gray-400 focus:border-vn-accent focus:outline-none"
      />

      {/* プレビュー / エラー */}
      {(rows.length > 0 || errors.length > 0) && (
        <div className="mt-2 text-xs">
          {fileName && <span className="text-gray-500">{fileName}: </span>}
          <span className="font-medium text-slate-700">{rows.length} 行を読み込み</span>
          {errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-amber-700">
              {errors.slice(0, 5).map((e) => (
                <li key={e} className="flex items-start gap-1">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden />
                  {e}
                </li>
              ))}
              {errors.length > 5 && <li>…ほか {errors.length - 5} 件</li>}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || rows.length === 0}
        className="mt-3 w-full rounded-md bg-vn-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-vn-accent/90 disabled:opacity-40 sm:w-auto"
      >
        {busy ? '取り込み中…' : `${rows.length} 行を取り込む`}
      </button>
    </div>
  );
}
