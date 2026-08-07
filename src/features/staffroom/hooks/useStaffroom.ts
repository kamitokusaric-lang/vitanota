// staffroom の SWR フック。
// 2026-08-07: 「会議で話す」タブから 情報共有 (kind ごとの箱) を撤去したため、
// useBoards / useTeacherNames は削除した。投稿の入口 (postStaffroomBoard) は
// TodayCaptureBox / RetroRecommendation から生きている。
import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';

// 生徒サポート (A→B seam): その週に印象が残された生徒を クラス別に。
// 0062 以降、サインとコメントは同じ行に載る (コメントに Good/気になるが紐づく)。
export interface SupportImpression {
  sign: 'good' | 'concern' | null;
  content: string | null;
}
export interface SupportStudent {
  studentId: string;
  displayName: string;
  goodCount: number;
  concernCount: number;
  impressions: SupportImpression[];
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
