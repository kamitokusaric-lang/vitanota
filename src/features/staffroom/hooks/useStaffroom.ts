// staffroom (職員室ボード) の SWR フック群。GET は S3 の API を叩くだけ。
import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';
import type { BoardDto, StaffroomBoardKind } from '../types';

// boardKind='all' のときは絞り込みなし (全カテゴリを時系列で)。
// period (投稿日 from/to・YYYY-MM-DD) を渡すと期間で絞る (未指定は API 側で今週)。
export function useBoards(
  boardKind: StaffroomBoardKind | 'all',
  period?: { from: string; to: string },
) {
  const params = new URLSearchParams();
  if (boardKind !== 'all') params.set('boardKind', boardKind);
  if (period) {
    params.set('from', period.from);
    params.set('to', period.to);
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  const { data, error, isLoading, mutate } = useSWR<{ boards: BoardDto[] }>(
    `/api/staffroom/board${qs}`,
    jsonFetcher,
  );
  return { boards: data?.boards ?? [], error, isLoading, mutate };
}

// 生徒サポート (A→B seam): 印が付いた生徒を クラス別に 名前 + 印件数 + 今週の一言。
export interface SupportStudent {
  studentId: string;
  displayName: string;
  positiveCount: number;
  concernCount: number;
  notes: string[];
}
export interface SupportClass {
  classId: string;
  className: string;
  schoolYear: string | null;
  students: SupportStudent[];
}

export function useStudentSupport(period?: { from: string; to: string }) {
  const qs = period ? `?from=${period.from}&to=${period.to}` : '';
  const { data, error, isLoading, mutate } = useSWR<{ classes: SupportClass[] }>(
    `/api/staffroom/student-support${qs}`,
    jsonFetcher,
  );
  return { classes: data?.classes ?? [], error, isLoading, mutate };
}

// テナント教員一覧 (投稿者名表示用)。既存 /api/tasks/assignees を再利用。
export function useTeacherNames() {
  const { data } = useSWR<{ assignees: { userId: string; name: string | null }[] }>(
    '/api/tasks/assignees',
    jsonFetcher,
  );
  const nameById = new Map<string, string>();
  for (const a of data?.assignees ?? []) {
    if (a.name) nameById.set(a.userId, a.name);
  }
  return nameById;
}
