// Step 18: OpenAPI 3.1 レジストリ
// 全 Unit-02 エンドポイントを登録し、scripts/gen-openapi.ts から呼び出される
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import {
  createEntrySchema,
  updateEntrySchema,
  timelineQuerySchema,
} from '@/features/journal/schemas/journal';
import { createTagSchema, tagIdParamSchema } from '@/features/journal/schemas/tag';
import { reactionTypeQuerySchema } from '@/features/journal/schemas/journal';
import { createJournalCommentSchema } from '@/features/journal/schemas/journalComment';
import {
  journalCommentsResponseSchema,
  journalCommentResponseSchema,
} from './journalCommentSchemas';
import { knowledgeTagCreateSchema } from '@/features/journal/schemas/knowledgeTag';
import { updateProfileSchema } from '@/features/profile/schemas/profile';
import {
  aiCaptureOnboardingStateSchema,
  onboardingContextSchema,
} from '@/schemas/userOnboardingStates';
import { feedbackSubmissionSchema } from '@/features/feedback/lib/feedbackSchemas';
import {
  createTaskSchema,
  updateTaskSchema,
  taskIdParamSchema,
  duplicateTaskSchema,
  listTasksQuerySchema,
} from '@/features/tasks/schemas/task';
import {
  createTaskCommentSchema,
} from '@/features/tasks/schemas/taskComment';
import { taskTagCreateSchema } from '@/features/tasks/schemas/taskTag';
import { taskFilterSettingsSchema } from '@/schemas/userFilterPreferences';
import {
  createClassSchema,
  updateClassSchema,
  classIdParamSchema,
  createStudentSchema,
  updateStudentSchema,
  studentIdParamSchema,
  bulkStudentsSchema,
  listStudentsQuerySchema,
  createNoteSchema,
  updateNoteSchema,
  noteIdParamSchema,
  listNotesQuerySchema,
  classResponseSchema,
  classesListResponseSchema,
  studentResponseSchema,
  studentsListResponseSchema,
  batonNoteResponseSchema,
  notesListResponseSchema,
  importRequestSchema,
  importResultResponseSchema,
} from '@/features/baton-relay/schemas/batonRelay';
import {
  createBoardSchema,
  listBoardQuerySchema,
  boardResponseSchema,
  boardListResponseSchema,
  studentSupportResponseSchema,
} from '@/features/staffroom/schemas/staffroom';

import {
  errorResponseSchema,
  timelineResponseSchema,
  myJournalResponseSchema,
  entryResponseSchema,
  tagListResponseSchema,
  tagResponseSchema,
  tagDeleteResponseSchema,
  knowledgeTagListResponseSchema,
  knowledgeTagResponseSchema,
  profileResponseSchema,
  onboardingStateResponseSchema,
  createInvitationSchema,
  invitationCreatedResponseSchema,
  invitationInfoResponseSchema,
  successResponseSchema,
} from './schemas';
import {
  tasksListResponseSchema,
  taskResponseSchema,
  taskCommentsResponseSchema,
  taskCommentResponseSchema,
  assigneesResponseSchema,
  taskCategoriesResponseSchema,
  taskTagsListResponseSchema,
  taskTagResponseSchema,
  okResponseSchema,
  setTaskTagsSchema,
  taskFilterPreferenceResponseSchema,
} from './taskSchemas';
import {
  feedbackTopicsResponseSchema,
  feedbackSubmissionCreatedResponseSchema,
  myThreadsResponseSchema,
  myThreadsQuerySchema,
  aiChatExtractRequestSchema,
  aiChatExtractResponseSchema,
  aiChatConfirmRequestSchema,
  aiChatConfirmResponseSchema,
  aiChatEventRequestSchema,
  aiChatFeedbackRequestSchema,
} from './aiChatFeedbackSchemas';
import {
  journalRecommendResponseSchema,
  journalRecommendPostRequestSchema,
  journalRecommendPatchRequestSchema,
  journalRecommendStatusResponseSchema,
} from './journalRecommendSchemas';
import {
  submitCheckinSchema,
  postReflectionSchema,
  upsertTeamReflectionSchema,
} from '@/features/workshop/schemas/workshop';
import {
  workshopBoardResponseSchema,
  workshopCheckinResponseSchema,
  workshopTeamReflectionResponseSchema,
} from './workshopSchemas';
import {
  gradeMeetingQuerySchema,
  startGradeMeetingSchema,
  addClassNoteSchema,
  classNoteIdParamSchema,
  createGradeTaskSchema,
  unlinkGradeTaskSchema,
} from '@/features/grade-meeting/schemas/gradeMeeting';
import {
  gradeMeetingBoardResponseSchema,
  gradeMeetingStartResponseSchema,
  classMeetingNoteResponseSchema,
  gradeTaskResponseSchema,
} from './gradeMeetingSchemas';

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  // ─── 共通エラー応答 ─────────────────────────────────────────
  const errorResponses = {
    400: {
      description: 'バリデーションエラー',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: '未認証',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    403: {
      description: '権限不足',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'リソースが見つからない',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    423: {
      description: 'テナント停止中',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    500: {
      description: 'サーバーエラー',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  };

  const sessionCookie = {
    cookieAuth: [],
  };

  registry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'next-auth.session-token',
    description: 'Auth.js セッション Cookie（database 戦略）',
  });

  // ─────────────────────────────────────────────────────────────
  // /api/public/journal/entries - 共有タイムライン
  // SP-U02-04 Layer 1-2: パス名前空間分離
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/public/journal/entries',
    summary: '共有タイムライン取得（テナント内の全公開エントリ）',
    description:
      'is_public=true のエントリのみが返却される。CloudFront でエッジキャッシュされる（s-maxage=30, stale-while-revalidate=60）。SP-U02-04 8層防御で is_public=false の漏えいを物理的に防ぐ。',
    tags: ['Journal (Public)'],
    security: [sessionCookie],
    request: {
      query: timelineQuerySchema,
    },
    responses: {
      200: {
        description: '共有タイムラインのページ',
        content: {
          'application/json': { schema: timelineResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/private/journal/entries - エントリ作成
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'post',
    path: '/api/private/journal/entries',
    summary: '日誌エントリを作成（US-T-010）',
    description: 'Cache-Control: private, no-store。所有者は自動的に現在のセッションユーザー。',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      body: {
        content: {
          'application/json': { schema: createEntrySchema },
        },
      },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: entryResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/private/journal/entries/[id] - 取得・更新・削除
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/private/journal/entries/{id}',
    summary: 'エントリ単体取得（所有者のみ）',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().guid() }),
    },
    responses: {
      200: {
        description: '取得成功',
        content: { 'application/json': { schema: entryResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/private/journal/entries/{id}',
    summary: 'エントリ更新（US-T-011・所有者のみ）',
    description: 'SP-U02-03: API 層の WHERE 句 + RLS WITH CHECK で IDOR を二重防御',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().guid() }),
      body: {
        content: { 'application/json': { schema: updateEntrySchema } },
      },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: entryResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/private/journal/entries/{id}',
    summary: 'エントリ削除（US-T-012・所有者のみ）',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().guid() }),
    },
    responses: {
      204: { description: '削除成功' },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/private/journal/entries/mine - マイ記録
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/private/journal/entries/mine',
    summary: 'マイ記録取得（自分の全エントリ・公開非公開両方）',
    description: 'Cache-Control: private, no-store。CloudFront はバイパス。',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      query: timelineQuerySchema,
    },
    responses: {
      200: {
        description: 'マイ記録のページ',
        content: { 'application/json': { schema: myJournalResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/private/journal/tags - タグ一覧・作成
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/private/journal/tags',
    summary: 'テナント内タグ一覧取得',
    tags: ['Tag'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'タグ一覧',
        content: { 'application/json': { schema: tagListResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/private/journal/tags',
    summary: 'タグ作成（teacher 以上）',
    tags: ['Tag'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: createTagSchema } } },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: tagResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/private/journal/tags/{id}',
    summary: 'タグ削除（school_admin のみ・システムデフォルト不可）',
    tags: ['Tag'],
    security: [sessionCookie],
    request: {
      params: tagIdParamSchema,
    },
    responses: {
      200: {
        description: '削除成功（影響を受けたエントリ数を返却）',
        content: { 'application/json': { schema: tagDeleteResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ═════════════════════════════════════════════════════════════
  // Tasks (タスク管理)
  // ═════════════════════════════════════════════════════════════
  const taskIdParam = z.object({ id: z.string().guid() });

  // /api/tasks - 一覧・作成
  registry.registerPath({
    method: 'get',
    path: '/api/tasks',
    summary: 'タスク一覧取得（フィルタ・期間指定可）',
    description:
      'scope=mine は自分が担当 or 作成したタスク。mode=default は「今週 + 期限なし + 期限切れ未完了」の3点セット、mode=range は due_date の範囲指定。',
    tags: ['Task'],
    security: [sessionCookie],
    request: { query: listTasksQuerySchema },
    responses: {
      200: {
        description: 'タスク一覧',
        content: { 'application/json': { schema: tasksListResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/tasks',
    summary: 'タスク作成',
    tags: ['Task'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: createTaskSchema } } },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: taskResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // /api/tasks/{id} - 取得・更新・削除
  registry.registerPath({
    method: 'get',
    path: '/api/tasks/{id}',
    summary: 'タスク単体取得',
    tags: ['Task'],
    security: [sessionCookie],
    request: { params: taskIdParamSchema },
    responses: {
      200: {
        description: '取得成功',
        content: { 'application/json': { schema: taskResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/tasks/{id}',
    summary: 'タスク更新（status / 担当者 / 期限 等）',
    tags: ['Task'],
    security: [sessionCookie],
    request: {
      params: taskIdParamSchema,
      body: { content: { 'application/json': { schema: updateTaskSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: taskResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/tasks/{id}',
    summary: 'タスク削除',
    tags: ['Task'],
    security: [sessionCookie],
    request: { params: taskIdParamSchema },
    responses: {
      204: { description: '削除成功' },
      ...errorResponses,
    },
  });

  // /api/tasks/{id}/comments - コメント一覧・作成
  registry.registerPath({
    method: 'get',
    path: '/api/tasks/{id}/comments',
    summary: 'タスクのコメント一覧取得',
    tags: ['Task'],
    security: [sessionCookie],
    request: { params: taskIdParamSchema },
    responses: {
      200: {
        description: 'コメント一覧',
        content: { 'application/json': { schema: taskCommentsResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/tasks/{id}/comments',
    summary: 'タスクにコメント追加',
    tags: ['Task'],
    security: [sessionCookie],
    request: {
      params: taskIdParamSchema,
      body: {
        content: { 'application/json': { schema: createTaskCommentSchema } },
      },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: taskCommentResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/tasks/{id}/comments/{commentId}',
    summary: 'タスクコメント削除（投稿者本人）',
    tags: ['Task'],
    security: [sessionCookie],
    request: {
      params: z.object({
        id: z.string().guid(),
        commentId: z.string().guid(),
      }),
    },
    responses: {
      204: { description: '削除成功' },
      ...errorResponses,
    },
  });

  // /api/tasks/{id}/duplicate - 複製
  registry.registerPath({
    method: 'post',
    path: '/api/tasks/{id}/duplicate',
    summary: 'タスク複製（担当者を指定して複製）',
    tags: ['Task'],
    security: [sessionCookie],
    request: {
      params: taskIdParamSchema,
      body: { content: { 'application/json': { schema: duplicateTaskSchema } } },
    },
    responses: {
      201: {
        description: '複製成功',
        content: { 'application/json': { schema: taskResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // /api/tasks/{id}/tags - タスクのタグ集合を置換
  registry.registerPath({
    method: 'put',
    path: '/api/tasks/{id}/tags',
    summary: 'タスクに紐づくタグ集合を置換',
    tags: ['Task'],
    security: [sessionCookie],
    request: {
      params: taskIdParam,
      body: { content: { 'application/json': { schema: setTaskTagsSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: okResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // /api/tasks/assignees - 担当者候補一覧
  registry.registerPath({
    method: 'get',
    path: '/api/tasks/assignees',
    summary: '担当者として選択可能な教員一覧',
    tags: ['Task'],
    security: [sessionCookie],
    responses: {
      200: {
        description: '担当者候補一覧',
        content: { 'application/json': { schema: assigneesResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // /api/task-categories - カテゴリ一覧
  registry.registerPath({
    method: 'get',
    path: '/api/task-categories',
    summary: 'テナント内タスクカテゴリ一覧',
    tags: ['Task'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'カテゴリ一覧',
        content: {
          'application/json': { schema: taskCategoriesResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  // /api/task-tags - タスクタグ一覧・作成
  registry.registerPath({
    method: 'get',
    path: '/api/task-tags',
    summary: 'テナント内タスクタグ一覧（利用件数付き）',
    tags: ['Task'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'タスクタグ一覧',
        content: { 'application/json': { schema: taskTagsListResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/task-tags',
    summary: 'タスクタグ作成（teacher 以上）',
    tags: ['Task'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: taskTagCreateSchema } } },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: taskTagResponseSchema } },
      },
      409: {
        description: '同名タグが既に存在',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/task-tags/{id}',
    summary: 'タスクタグ削除',
    tags: ['Task'],
    security: [sessionCookie],
    request: { params: taskIdParam },
    responses: {
      200: {
        description: '削除成功',
        content: { 'application/json': { schema: okResponseSchema } },
      },
      409: {
        description: 'タグが使用中',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // /api/users/me/filter-preferences/tasks - タスクボードのフィルタ設定
  registry.registerPath({
    method: 'get',
    path: '/api/users/me/filter-preferences/tasks',
    summary: 'タスクボードのフィルタ設定取得（未保存なら null）',
    tags: ['Task'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'フィルタ設定',
        content: {
          'application/json': { schema: taskFilterPreferenceResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/users/me/filter-preferences/tasks',
    summary: 'タスクボードのフィルタ設定を保存（UPSERT）',
    tags: ['Task'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: taskFilterSettingsSchema } },
      },
    },
    responses: {
      200: {
        description: '保存成功',
        content: { 'application/json': { schema: okResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ═════════════════════════════════════════════════════════════
  // Journal (リアクション・ナレッジタグ)
  // ═════════════════════════════════════════════════════════════
  registry.registerPath({
    method: 'post',
    path: '/api/private/journal/entries/{id}/reactions',
    summary: 'エントリにリアクションを付ける（knowledge / appreciation / endorsement）',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().guid() }),
      body: { content: { 'application/json': { schema: reactionTypeQuerySchema } } },
    },
    responses: {
      201: { description: 'リアクション付与成功' },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/private/journal/entries/{id}/reactions',
    summary: 'リアクションを外す',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().guid() }),
      query: reactionTypeQuerySchema,
    },
    responses: {
      204: { description: '削除成功' },
      ...errorResponses,
    },
  });

  // 職員室ノートのコメント (公開エントリのみ・非公開は 403)
  registry.registerPath({
    method: 'get',
    path: '/api/private/journal/entries/{id}/comments',
    summary: 'エントリのコメント一覧取得',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: { params: z.object({ id: z.string().guid() }) },
    responses: {
      200: {
        description: 'コメント一覧',
        content: {
          'application/json': { schema: journalCommentsResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/private/journal/entries/{id}/comments',
    summary: 'エントリにコメント追加',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({ id: z.string().guid() }),
      body: {
        content: { 'application/json': { schema: createJournalCommentSchema } },
      },
    },
    responses: {
      201: {
        description: '作成成功',
        content: {
          'application/json': { schema: journalCommentResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/private/journal/entries/{id}/comments/{commentId}',
    summary: 'コメント削除（本人 or school_admin）',
    tags: ['Journal (Private)'],
    security: [sessionCookie],
    request: {
      params: z.object({
        id: z.string().guid(),
        commentId: z.string().guid(),
      }),
    },
    responses: {
      204: { description: '削除成功' },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/private/journal/knowledge-tags',
    summary: 'ナレッジタグ一覧取得（利用件数付き）',
    tags: ['Tag'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'ナレッジタグ一覧',
        content: {
          'application/json': { schema: knowledgeTagListResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/private/journal/knowledge-tags',
    summary: 'ナレッジタグ作成（teacher 以上）',
    tags: ['Tag'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: knowledgeTagCreateSchema } },
      },
    },
    responses: {
      201: {
        description: '作成成功',
        content: {
          'application/json': { schema: knowledgeTagResponseSchema },
        },
      },
      409: {
        description: '同名タグが既に存在',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ═════════════════════════════════════════════════════════════
  // Account / Org (プロフィール・オンボーディング・お知らせ・招待)
  // ═════════════════════════════════════════════════════════════
  registry.registerPath({
    method: 'get',
    path: '/api/me/profile',
    summary: '自分のプロフィール取得（テナント内ニックネーム）',
    tags: ['Account'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'プロフィール',
        content: { 'application/json': { schema: profileResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/me/profile',
    summary: 'ニックネーム更新',
    tags: ['Account'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: updateProfileSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: profileResponseSchema } },
      },
      409: {
        description: 'ニックネーム重複',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/users/me/onboarding-states/{context}',
    summary: 'オンボーディング/ヒントの表示状態取得（未保存なら null）',
    tags: ['Account'],
    security: [sessionCookie],
    request: { params: z.object({ context: onboardingContextSchema }) },
    responses: {
      200: {
        description: '表示状態',
        content: {
          'application/json': { schema: onboardingStateResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/users/me/onboarding-states/{context}',
    summary: 'オンボーディング/ヒントの表示状態を保存（UPSERT）',
    tags: ['Account'],
    security: [sessionCookie],
    request: {
      params: z.object({ context: onboardingContextSchema }),
      body: {
        content: {
          'application/json': { schema: aiCaptureOnboardingStateSchema },
        },
      },
    },
    responses: {
      200: {
        description: '保存成功',
        content: { 'application/json': { schema: okResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/invitations',
    summary: '教員/管理者を招待（school_admin 以上）',
    tags: ['Account'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: createInvitationSchema } } },
    },
    responses: {
      201: {
        description: '招待リンク発行',
        content: {
          'application/json': { schema: invitationCreatedResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/invitations/{token}',
    summary: '招待トークン検証（招待先メール・ロールを返す）',
    description: '認証不要。サインアップ画面で招待内容を表示するために使う。',
    tags: ['Account'],
    request: { params: z.object({ token: z.string() }) },
    responses: {
      200: {
        description: '招待情報',
        content: {
          'application/json': { schema: invitationInfoResponseSchema },
        },
      },
      410: {
        description: '招待リンクが期限切れ・使用済み',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/invitations/{token}',
    summary: '招待を受諾してテナントに参加',
    tags: ['Account'],
    security: [sessionCookie],
    request: { params: z.object({ token: z.string() }) },
    responses: {
      200: {
        description: '参加成功',
        content: { 'application/json': { schema: successResponseSchema } },
      },
      410: {
        description: '招待リンクが期限切れ・使用済み',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ═════════════════════════════════════════════════════════════
  // Feedback (運営フィードバック)
  // ═════════════════════════════════════════════════════════════
  registry.registerPath({
    method: 'get',
    path: '/api/feedback/topics',
    summary: 'フィードバックのトピック一覧（有効なもの）',
    tags: ['Feedback'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'トピック一覧',
        content: {
          'application/json': { schema: feedbackTopicsResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/feedback/submissions',
    summary: '運営へフィードバックを送信',
    tags: ['Feedback'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: feedbackSubmissionSchema } },
      },
    },
    responses: {
      201: {
        description: '送信成功',
        content: {
          'application/json': {
            schema: feedbackSubmissionCreatedResponseSchema,
          },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/feedback/my-threads',
    summary: '自分のフィードバックと運営返信スレッド',
    description:
      'summary=1 のときは未読サマリ ({ unreadAny, latestUnreadReply }) を、それ以外はスレッド一覧 ({ threads }) を返す。',
    tags: ['Feedback'],
    security: [sessionCookie],
    request: { query: myThreadsQuerySchema },
    responses: {
      200: {
        description: 'スレッド一覧 または 未読サマリ',
        content: { 'application/json': { schema: myThreadsResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/feedback/mark-read',
    summary: '運営返信を既読にする',
    tags: ['Feedback'],
    security: [sessionCookie],
    responses: {
      200: {
        description: '既読化成功',
        content: { 'application/json': { schema: okResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ═════════════════════════════════════════════════════════════
  // AI Chat (雑に書く → AI がタスク候補を整理)
  // ═════════════════════════════════════════════════════════════
  registry.registerPath({
    method: 'post',
    path: '/api/ai-chat/extract',
    summary: '入力文から AI がタスク候補を抽出',
    description:
      '1 日あたりの利用回数制限あり（超過で 429）。AI 基盤が一時的に使えない場合は 503。',
    tags: ['AI Chat'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: aiChatExtractRequestSchema } },
      },
    },
    responses: {
      200: {
        description: '抽出されたタスク候補',
        content: {
          'application/json': { schema: aiChatExtractResponseSchema },
        },
      },
      429: {
        description: '1 日の利用上限に到達',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      503: {
        description: 'AI 基盤が一時的に利用不可',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/journal/kind-suggest',
    summary: '本文から journal 種別を AI が提案（そっと提案・本人確定）',
    description:
      '提案のみで保存はしない。本人が確認ステップで種別を確定する。フラグ off は 404、利用上限超過は 429、AI 基盤不可は 503。',
    tags: ['AI Chat'],
    security: [sessionCookie],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ content: z.string().min(1).max(2000) }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'AI の種別提案（suggestedKind=null は tweet 据え置き）',
        content: {
          'application/json': {
            schema: z.object({
              suggestedKind: z
                .enum(['knowledge', 'thanks', 'help'])
                .nullable(),
              confidence: z.enum(['high', 'medium', 'low']),
            }),
          },
        },
      },
      429: {
        description: '1 日の利用上限に到達',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      503: {
        description: 'AI 基盤が一時的に利用不可',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ふりかえり → AIリコメンド (マイノートの非公開ふりかえりを読み、公開をそっと提案)
  registry.registerPath({
    method: 'post',
    path: '/api/journal/recommend',
    summary: 'ふりかえりから公開リコメンドを計算 or キャッシュ取得',
    description:
      'マイノート(非公開 note)のふりかえりを AI が読み、区分つきで公開をそっと提案する。idempotent (entry あたり最大1回計算)。フラグ off は 404、対象外 entry は 400、利用上限超過は 429、AI 基盤不可は 503。',
    tags: ['AI Chat'],
    security: [sessionCookie],
    request: {
      body: {
        content: {
          'application/json': { schema: journalRecommendPostRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'リコメンド (surface=false は出す価値なし)',
        content: {
          'application/json': { schema: journalRecommendResponseSchema },
        },
      },
      429: {
        description: '1 日の利用上限に到達',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      503: {
        description: 'AI 基盤が一時的に利用不可',
        content: { 'application/json': { schema: errorResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/journal/recommend',
    summary: 'ふりかえりの既存リコメンドを取得',
    description:
      'マイノート詳細での表示用。未計算なら recommendation=null。フラグ off は 404。',
    tags: ['AI Chat'],
    security: [sessionCookie],
    request: {
      query: z.object({ entryId: z.string().guid() }),
    },
    responses: {
      200: {
        description: '既存リコメンド (なければ null)',
        content: {
          'application/json': { schema: journalRecommendResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/journal/recommend',
    summary: 'リコメンドの対応状態を更新（出した / やめておく）',
    description:
      'published=公開した / dismissed=今日はやめておく。本人のみ。対象なしは 404。',
    tags: ['AI Chat'],
    security: [sessionCookie],
    request: {
      body: {
        content: {
          'application/json': { schema: journalRecommendPatchRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: '更新後の状態',
        content: {
          'application/json': { schema: journalRecommendStatusResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/ai-chat/confirm',
    summary: 'タスク候補を確定（作成）または破棄',
    description:
      'action=confirm で選択したタスクを作成、action=discard でセッションを破棄（任意で理由を記録）。',
    tags: ['AI Chat'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: aiChatConfirmRequestSchema } },
      },
    },
    responses: {
      200: {
        description: '破棄成功（createdCount=0）',
        content: {
          'application/json': { schema: aiChatConfirmResponseSchema },
        },
      },
      201: {
        description: '作成成功',
        content: {
          'application/json': { schema: aiChatConfirmResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/ai-chat/events',
    summary: '利用計測イベントを記録（AI チャット / カレンダー）',
    tags: ['AI Chat'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: aiChatEventRequestSchema } },
      },
    },
    responses: {
      204: { description: '記録成功' },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/ai-chat/feedback',
    summary: 'AI 整理体験のスコア/理由を記録',
    tags: ['AI Chat'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: aiChatFeedbackRequestSchema } },
      },
    },
    responses: {
      200: {
        description: '記録成功',
        content: { 'application/json': { schema: okResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/baton-relay/* - H7 朝のバトンリレー (学校知の循環の入口)
  // teacher / school_admin が自テナントを読み書き (相互関心層)。書込は本人の行のみ。
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/baton-relay/classes',
    summary: 'クラス一覧取得',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    responses: {
      200: {
        description: 'クラス一覧',
        content: { 'application/json': { schema: classesListResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/baton-relay/classes',
    summary: 'クラス作成',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: createClassSchema } } },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: z.object({ class: classResponseSchema }) } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/baton-relay/classes/{id}',
    summary: 'クラス更新（クラス目標等）',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: {
      params: classIdParamSchema,
      body: { content: { 'application/json': { schema: updateClassSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: z.object({ class: classResponseSchema }) } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/baton-relay/students',
    summary: '生徒一覧取得（クラス指定・status 省略時 active）',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: { query: listStudentsQuerySchema },
    responses: {
      200: {
        description: '生徒一覧',
        content: { 'application/json': { schema: studentsListResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/baton-relay/students',
    summary: '生徒作成（手動ロスター投入）',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: createStudentSchema } } },
    },
    responses: {
      201: {
        description: '作成成功',
        content: { 'application/json': { schema: z.object({ student: studentResponseSchema }) } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/baton-relay/students/{id}',
    summary: '生徒の更新（クラス移動 / 氏名修正 / アーカイブ・復元）',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: {
      params: studentIdParamSchema,
      body: { content: { 'application/json': { schema: updateStudentSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: z.object({ student: studentResponseSchema }) } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/baton-relay/students/bulk',
    summary: '選んだ生徒をまとめて操作（削除 / アーカイブ / クラス移動）',
    description:
      '1トランザクションで処理するので、途中で失敗しても半端に消えたり動いたりしない。delete はその子の印象・コメントも cascade で消える（UI は合計件数を見せてから呼ぶこと）。他テナントの行は RLS が弾くので affected に数えられない。',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: bulkStudentsSchema } } },
    },
    responses: {
      200: {
        description: '処理した件数',
        content: {
          'application/json': {
            schema: z.object({ affected: z.number().int() }),
          },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/baton-relay/students/{id}',
    summary: '生徒の削除（誤登録の取り消し）',
    description:
      'アーカイブ（在籍終了）とは意味が違う。あちらは転校・卒業という「起きた出来事」、こちらは「そもそも無かったこと」。baton_notes は ON DELETE CASCADE なので、その子の印象・コメントも一緒に消える（UI は削除前に StudentDto.noteCount を見せること）。他テナントの行は RLS で 0 件 → 存在しないのと区別せず 404。',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: { params: studentIdParamSchema },
    responses: {
      204: { description: '削除した' },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/baton-relay/notes',
    summary: '生徒欄の一言取得（クラス + 日付で生徒横断）',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: { query: listNotesQuerySchema },
    responses: {
      200: {
        description: 'ノート一覧',
        content: { 'application/json': { schema: notesListResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/baton-relay/notes',
    summary: '生徒欄に一言を追加（append-only）',
    description: '著者は自動的に現在のセッションユーザー。同じ生徒・同じ日に何度でも追加できる。',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: createNoteSchema } } },
    },
    responses: {
      201: {
        description: '追加成功',
        content: { 'application/json': { schema: z.object({ note: batonNoteResponseSchema }) } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/baton-relay/notes/{id}',
    summary: '自分の一言を編集',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: {
      params: noteIdParamSchema,
      body: { content: { 'application/json': { schema: updateNoteSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: z.object({ note: batonNoteResponseSchema }) } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/baton-relay/notes/{id}',
    summary: '自分の一言を削除',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: { params: noteIdParamSchema },
    responses: {
      204: { description: '削除成功' },
      ...errorResponses,
    },
  });



  registry.registerPath({
    method: 'post',
    path: '/api/baton-relay/import',
    summary: 'ロスター CSV インポート（クラス・クラス目標・生徒を一括登録）',
    description:
      'クライアントで CSV をパースした行 (className/classGoal/studentName/grade) を送る。冪等: クラスは名前で統合・目標は最新値で更新・生徒は同名スキップ。',
    tags: ['Baton Relay'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: importRequestSchema } } },
    },
    responses: {
      200: {
        description: '取り込み結果のサマリ',
        content: { 'application/json': { schema: importResultResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/staffroom/* - H7-B 職員室ボード (学校知の循環の出口)
  // board 投稿は journal_entries(kind='board', is_public=false)。teacher / school_admin が
  // 自テナントの board を読み (相互関心層)、書きは投稿者本人。コメントはツリー。
  // リアクション (3 種) は既存 /api/private/journal/entries/{id}/reactions を再利用。
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/staffroom/board',
    summary: '職員室ボード投稿の一覧取得（種別・クラスで絞り込み可）',
    tags: ['Staffroom'],
    security: [sessionCookie],
    request: { query: listBoardQuerySchema },
    responses: {
      200: {
        description: 'ボード投稿一覧',
        content: { 'application/json': { schema: boardListResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/staffroom/board',
    summary: '職員室ボードに投稿（KPT+Thanks / Help / 共有）',
    description:
      'is_public=false 固定で個人タイムラインには載らない。boardType=kpt のとき kptLabel 必須。数値化・ランキングはしない。',
    tags: ['Staffroom'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: createBoardSchema } } },
    },
    responses: {
      201: {
        description: '投稿成功',
        content: { 'application/json': { schema: z.object({ board: boardResponseSchema }) } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/staffroom/student-support',
    summary: '生徒サポート（朝バトンをクラス別に集約）',
    description: 'A→B seam。印が付いた生徒をクラス(学年)別に 名前 + 印件数 + 今週の一言 で返す。数値化・ランキングはしない。',
    tags: ['Staffroom'],
    security: [sessionCookie],
    responses: {
      200: {
        description: '生徒サポート',
        content: { 'application/json': { schema: studentSupportResponseSchema } },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/workshop - 研修 (決め打ちワークショップの箱)
  // 研修無効テナントには 404 (機能の存在を悟らせない・観測者原則)。
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/workshop',
    summary: '研修の箱の中身（箱メタ + 自分のチェックイン + みんなのチェックイン）',
    description:
      'Cache-Control: private, no-store。研修が有効でないテナントには 404。チェックインは職員室には出ない（別テーブル）。',
    tags: ['Workshop'],
    security: [sessionCookie],
    responses: {
      200: {
        description: '研修の箱',
        content: { 'application/json': { schema: workshopBoardResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/workshop/checkin',
    summary: 'チェックイン回答を投稿（upsert・1人1回答・上書き可）',
    description: '研修前チェックイン。回答は箱の中で参加者に見え、職員室には出ない。',
    tags: ['Workshop'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: submitCheckinSchema } } },
    },
    responses: {
      200: {
        description: '投稿成功',
        content: { 'application/json': { schema: workshopCheckinResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/workshop/reflection',
    summary: '振り返りを投稿（公開 note を作成し箱に紐付け）',
    description:
      '研修後の振り返り。公開 note (kind=note, is_public=true) として作成され、箱の中にも職員室ノートにも流れる。',
    tags: ['Workshop'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: postReflectionSchema } } },
    },
    responses: {
      201: {
        description: '投稿成功（作成された公開 note）',
        content: { 'application/json': { schema: entryResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/workshop/team-reflection',
    summary: 'チーム振り返りを保存（upsert・1班1枚・上書き可）',
    description:
      'ワーク最後の12分でチームごとに1枚を埋める（紙の「振り返り・発表シート」の4問）。チームの誰が書いても同じ1枚を更新する（入力係が交代できる）。箱の中に閉じ、職員室ノートには流れない。途中保存を許すため個々の欄は空でよいが、4問すべて空なら 400。',
    tags: ['Workshop'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: upsertTeamReflectionSchema } },
      },
    },
    responses: {
      200: {
        description: '保存成功',
        content: {
          'application/json': { schema: workshopTeamReflectionResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // /api/grade-meeting - 学年会 (クラス状況を持ち寄る同期 Orient の場)
  // 卓上の行はすべて無記名で返す (author を含めない)。
  // ─────────────────────────────────────────────────────────────
  registry.registerPath({
    method: 'get',
    path: '/api/grade-meeting',
    summary: '学年の卓上（クラス + 今回の会 + 観察/状況判断/次の一手 + 前回の一手）',
    description:
      'Cache-Control: private, no-store。学年が設定されたクラスだけを、クラス名順で返す（「活発な順」等のソートは提供しない）。会がまだ無ければ meeting=null（自動では作らない）。行に author は含めない（無記名）。',
    tags: ['GradeMeeting'],
    security: [sessionCookie],
    request: { query: gradeMeetingQuerySchema },
    responses: {
      200: {
        description: '学年の卓上',
        content: {
          'application/json': { schema: gradeMeetingBoardResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/grade-meeting',
    summary: '学年会をはじめる（同学年・同日なら既存の会を返す）',
    description:
      '手で押したときだけ回を作る（自動生成しない）。二度押しで会は増えない。',
    tags: ['GradeMeeting'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: startGradeMeetingSchema } },
      },
    },
    responses: {
      200: {
        description: '学年会',
        content: {
          'application/json': { schema: gradeMeetingStartResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/grade-meeting/notes',
    summary: '卓上に1行置く（観察 / 状況判断 / 次の一手）',
    description:
      'observe・orient は何行でも積む（複数の見立てを1つに畳まない）。action は 1回×1クラスで1行なので upsert になる。レスポンスに author は含めない。',
    tags: ['GradeMeeting'],
    security: [sessionCookie],
    request: {
      body: { content: { 'application/json': { schema: addClassNoteSchema } } },
    },
    responses: {
      200: {
        description: '置いた行',
        content: {
          'application/json': { schema: classMeetingNoteResponseSchema },
        },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/grade-meeting/notes/{id}',
    summary: '卓上から1行引っ込める',
    description:
      '観察・状況判断は本人のみ、次の一手はテナント内なら誰でも（RLS で判定）。消せない場合は、他人の行か存在しないかを区別せず 404 を返す（誰が書いたかを推測させない）。',
    tags: ['GradeMeeting'],
    security: [sessionCookie],
    request: { params: classNoteIdParamSchema },
    responses: {
      204: { description: '引っ込めた' },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/grade-meeting/tasks',
    summary: '学年の「やること」を1つ起こす（実体は既存 tasks）',
    description:
      'クラスに紐づかない仕事（行事の準備・学年通信・保護者対応など）。TODO の仕組みを学年会の中に二重に作らず、既存 tasks に作って中間テーブルで会に紐付ける。担当・期限・完了はタスク側の仕組みをそのまま使い、タスクタブにも出る。',
    tags: ['GradeMeeting'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: createGradeTaskSchema } },
      },
    },
    responses: {
      200: {
        description: '起こしたやること',
        content: { 'application/json': { schema: gradeTaskResponseSchema } },
      },
      ...errorResponses,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/grade-meeting/tasks',
    summary: '会から「やること」を外す（タスク本体は残す）',
    description:
      '紐付けだけを外す。タスクタブで生きているものを学年会の画面から消させない。',
    tags: ['GradeMeeting'],
    security: [sessionCookie],
    request: {
      body: {
        content: { 'application/json': { schema: unlinkGradeTaskSchema } },
      },
    },
    responses: {
      204: { description: '外した' },
      ...errorResponses,
    },
  });

  // ─────────────────────────────────────────────────────────────
  // OpenAPI ドキュメント生成
  // ─────────────────────────────────────────────────────────────
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'vitanota API',
      version: '0.2.0', // Unit-02 リリース時点
      description: `
教員向け BtoB SaaS「vitanota」の REST API 仕様。

## 認証
全エンドポイントが Auth.js の database セッション戦略（SP-07）でログイン必須。
Cookie \`next-auth.session-token\` を介してセッション検証される。

## パス設計
- \`/api/public/*\` — CloudFront でキャッシュ可能（is_public=true のリソース）
- \`/api/private/*\` — Cache-Control: private, no-store

## エラーコード
- 400 VALIDATION_ERROR — Zod バリデーション失敗
- 401 UNAUTHORIZED — セッション無効
- 403 FORBIDDEN / TENANT_LOCKED — 権限不足・テナント停止
- 404 JOURNAL_NOT_FOUND / TAG_NOT_FOUND — 所有者でない or 存在しない
- 423 TENANT_LOCKED — テナント suspended
- 500 INTERNAL_ERROR — 予期しないエラー
      `.trim(),
      contact: {
        name: 'vitanota dev',
      },
    },
    servers: [
      { url: 'https://dev.vitanota.example.com', description: 'Development' },
      { url: 'https://vitanota.example.com', description: 'Production' },
    ],
  });
}
