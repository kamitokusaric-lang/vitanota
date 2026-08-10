// 研修 (workshop) の SWR フック。GET /api/workshop を叩き、チェックイン/振り返りを投稿する。
import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';

export interface WorkshopBoxDto {
  id: string;
  schedule?: string;
  title: string;
  checkinQuestion: string;
}

export interface WorkshopCheckinDto {
  id: string;
  userId: string | null;
  userName: string | null;
  answer: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkshopReflectionDto {
  journalEntryId: string;
  userId: string | null;
  userName: string | null;
  content: string;
  createdAt: string;
}

// チーム振り返り (1班1枚)。「最後に書いた人」は返らない (入力係を可視化しない)。
export interface WorkshopTeamReflectionDto {
  teamKey: string;
  vision: string;
  respect: string;
  autonomy: string;
  next: string;
  updatedAt: string;
}

export interface WorkshopBoardDto {
  workshop: WorkshopBoxDto;
  myCheckin: { answer: string; updatedAt: string } | null;
  checkins: WorkshopCheckinDto[];
  reflections: WorkshopReflectionDto[];
  teamReflections: WorkshopTeamReflectionDto[];
}

export interface UpsertTeamReflectionArgs {
  teamKey: string;
  vision: string;
  respect: string;
  autonomy: string;
  next: string;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function useWorkshop() {
  const { data, error, isLoading, mutate } = useSWR<WorkshopBoardDto>(
    '/api/workshop',
    jsonFetcher,
  );

  async function submitCheckin(answer: string): Promise<void> {
    await postJson('/api/workshop/checkin', { answer });
    await mutate();
  }

  async function postReflection(content: string): Promise<void> {
    await postJson('/api/workshop/reflection', { content });
    await mutate();
  }

  async function upsertTeamReflection(
    args: UpsertTeamReflectionArgs,
  ): Promise<void> {
    await postJson('/api/workshop/team-reflection', args);
    await mutate();
  }

  return {
    board: data,
    isLoading,
    error,
    mutate,
    submitCheckin,
    postReflection,
    upsertTeamReflection,
  };
}
