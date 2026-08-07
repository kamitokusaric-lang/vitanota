// 学年会 (grade-meeting) の SWR フック。
// 卓上の行は無記名で返ってくる (authorUserId は API に無い)。
import useSWR from 'swr';
import { jsonFetcher } from '@/shared/lib/fetcher';
import type { ClassNoteKind } from '../constants';

export interface GradeClassDto {
  id: string;
  name: string;
  goalText: string | null;
}

export interface GradeMeetingDto {
  id: string;
  grade: number;
  heldOn: string;
}

export interface ClassNoteDto {
  id: string;
  classId: string;
  kind: ClassNoteKind;
  content: string;
  createdAt: string;
}

// 学年の「やること」(実体は既存 tasks)。
export interface GradeTaskAssigneeDto {
  userId: string;
  name: string | null;
}

export interface GradeTaskDto {
  taskId: string;
  title: string;
  dueDate: string | null;
  status: string;
  categoryId: string;
  assignees: GradeTaskAssigneeDto[];
}

export interface GradeMeetingBoardDto {
  grade: number;
  availableGrades: number[];
  classes: GradeClassDto[];
  meeting: GradeMeetingDto | null;
  notes: ClassNoteDto[];
  previousMeeting: GradeMeetingDto | null;
  previousActions: ClassNoteDto[];
  gradeTasks: GradeTaskDto[];
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function useGradeMeeting(
  grade: number | null,
  period: { from: string; to: string },
) {
  const { data, error, isLoading, mutate } = useSWR<GradeMeetingBoardDto>(
    grade === null
      ? null
      : `/api/grade-meeting?grade=${grade}&from=${period.from}&to=${period.to}`,
    jsonFetcher,
  );

  // 「学年会をはじめる」。同学年・同日なら既存の会が返る (二度押しで増えない)。
  async function startMeeting(heldOn: string): Promise<void> {
    if (grade === null) return;
    await postJson('/api/grade-meeting', { grade, heldOn });
    await mutate();
  }

  async function addNote(params: {
    meetingId: string;
    classId: string;
    kind: ClassNoteKind;
    content: string;
  }): Promise<void> {
    await postJson('/api/grade-meeting/notes', params);
    await mutate();
  }

  // 学年の「やること」を起こす (既存 tasks に作られ、タスクタブにも出る)。
  async function createGradeTask(params: {
    meetingId: string;
    categoryId: string;
    title: string;
    dueDate?: string;
  }): Promise<void> {
    await postJson('/api/grade-meeting/tasks', params);
    await mutate();
  }

  // 会から外す (タスク本体は残る)。
  async function unlinkGradeTask(params: {
    meetingId: string;
    taskId: string;
  }): Promise<void> {
    const res = await fetch('/api/grade-meeting/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await mutate();
  }

  async function deleteNote(id: string): Promise<void> {
    const res = await fetch(`/api/grade-meeting/notes/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await mutate();
  }

  return {
    board: data,
    isLoading,
    error,
    mutate,
    startMeeting,
    addNote,
    deleteNote,
    createGradeTask,
    unlinkGradeTask,
  };
}
