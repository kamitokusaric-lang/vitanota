// baton-relay の SWR フック群。GET は S1 の API を叩くだけ。
import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';
import type {
  ClassDto,
  StudentDto,
  BatonNoteDto,
  StudentReactionDto,
} from '../types';

export function useClasses() {
  const { data, error, isLoading, mutate } = useSWR<{ classes: ClassDto[] }>(
    '/api/baton-relay/classes',
    jsonFetcher,
  );
  return { classes: data?.classes ?? [], error, isLoading, mutate };
}

export function useStudents(classId: string | null) {
  const key = classId ? `/api/baton-relay/students?classId=${classId}` : null;
  const { data, error, isLoading, mutate } = useSWR<{ students: StudentDto[] }>(
    key,
    jsonFetcher,
  );
  return { students: data?.students ?? [], error, isLoading, mutate };
}

// アーカイブ済み生徒。enabled=false の間は取得しない (トグル ON で初めて叩く)。
export function useArchivedStudents(classId: string | null, enabled: boolean) {
  const key =
    enabled && classId
      ? `/api/baton-relay/students?classId=${classId}&status=archived`
      : null;
  const { data, error, isLoading, mutate } = useSWR<{ students: StudentDto[] }>(
    key,
    jsonFetcher,
  );
  return { archived: data?.students ?? [], error, isLoading, mutate };
}

export function useNotes(classId: string | null, date: string) {
  const key = classId
    ? `/api/baton-relay/notes?classId=${classId}&date=${date}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<{ notes: BatonNoteDto[] }>(
    key,
    jsonFetcher,
  );
  return { notes: data?.notes ?? [], error, isLoading, mutate };
}

export function useReactions(classId: string | null) {
  const key = classId ? `/api/baton-relay/reactions?classId=${classId}` : null;
  const { data, error, isLoading, mutate } = useSWR<{
    reactions: StudentReactionDto[];
  }>(key, jsonFetcher);
  return { reactions: data?.reactions ?? [], error, isLoading, mutate };
}

// テナント教員一覧 (一言の著者名表示用)。既存 /api/tasks/assignees を再利用。
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
