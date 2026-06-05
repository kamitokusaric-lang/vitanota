// feedback (運営フィードバック) + ai-chat エンドポイントの OpenAPI スキーマ。
// ai-chat ハンドラの RequestSchema は module top で LambdaClient/DB を生成するため
// import すると副作用が出る → ここで同等の schema を再定義する (ハンドラ側と要同期)。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// confirm/feedback 共通の理由 enum (ハンドラの DISCARD_REASONS / EDIT_REASONS と同期)
const REASONS = [
  'wrong_candidate',
  'too_detailed',
  'too_rough',
  'not_a_task',
  'inconvenient',
  'privacy_concern',
  'other',
] as const;
// confirm の親カテゴリ名 (ハンドラの PARENT_NAME_VALUES と同期)
const PARENT_NAMES = [
  '学び',
  '育み',
  '安心',
  '1学年',
  '2学年',
  '3学年',
  '特別支援学級',
  '校務',
] as const;

// ═══ Feedback ═══════════════════════════════════════════════
export const feedbackTopicSchema = z
  .object({
    id: z.string().guid(),
    title: z.string().openapi({ example: '使い勝手について' }),
    description: z.string().nullable(),
    sortOrder: z.number().int(),
  })
  .openapi('FeedbackTopic');

export const feedbackTopicsResponseSchema = z
  .object({ topics: z.array(feedbackTopicSchema) })
  .openapi('FeedbackTopicsResponse');

export const feedbackSubmissionCreatedResponseSchema = z
  .object({ submission: z.object({ id: z.string().guid() }) })
  .openapi('FeedbackSubmissionCreatedResponse');

const feedbackReplySchema = z
  .object({
    id: z.string().guid(),
    body: z.string(),
    createdAt: z.string().datetime(),
  })
  .openapi('FeedbackReply');

const feedbackThreadSchema = z
  .object({
    submissionId: z.string().guid(),
    topicTitle: z.string(),
    content: z.string(),
    createdAt: z.string().datetime(),
    replyCount: z.number().int(),
    latestReplyAt: z.string().datetime().nullable(),
    hasUnread: z.boolean(),
    replies: z.array(feedbackReplySchema),
  })
  .openapi('FeedbackThread');

const feedbackThreadsResponseSchema = z
  .object({ threads: z.array(feedbackThreadSchema) })
  .openapi('FeedbackThreadsResponse');

const feedbackSummaryResponseSchema = z
  .object({
    unreadAny: z.boolean(),
    latestUnreadReply: z
      .object({
        body: z.string(),
        topicTitle: z.string(),
        createdAt: z.string().datetime(),
      })
      .nullable(),
  })
  .openapi('FeedbackSummaryResponse');

// GET /api/feedback/my-threads は summary=1 で要約形、それ以外でスレッド一覧形を返す
export const myThreadsResponseSchema = z
  .union([feedbackThreadsResponseSchema, feedbackSummaryResponseSchema])
  .openapi('MyThreadsResponse');

export const myThreadsQuerySchema = z
  .object({ summary: z.string().optional().openapi({ example: '1' }) })
  .openapi('MyThreadsQuery');

// ═══ AI Chat ════════════════════════════════════════════════
export const aiChatExtractRequestSchema = z
  .object({ inputText: z.string().min(1).max(2000) })
  .openapi('AiChatExtractInput');

const taskCandidateSchema = z
  .object({
    title: z.string(),
    category_id: z.string().nullable(),
    due_date: z.string().nullable(),
    memo: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
  })
  .openapi('TaskCandidate');

export const aiChatExtractResponseSchema = z
  .object({
    sessionId: z.string().guid(),
    tasks: z.array(taskCandidateSchema),
    needsConfirmation: z.array(z.string()),
  })
  .openapi('AiChatExtractResponse');

const confirmTaskInputSchema = z.object({
  title: z.string().min(1).max(200),
  aiSuggestedTitle: z.string().max(200).nullable(),
  aiSuggestedCategoryId: z.string().nullable(),
  aiSuggestedDueDate: ymd.nullable(),
  userSelectedParentName: z.enum(PARENT_NAMES),
  dueDate: ymd.nullable(),
  memo: z.string().max(500),
  tagIds: z.array(z.string().guid()).max(20),
  assigneeUserIds: z.array(z.string().guid()).min(1).max(10),
});

export const aiChatConfirmRequestSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('confirm'),
      sessionId: z.string().guid(),
      selectedTasks: z.array(confirmTaskInputSchema).max(20),
      inputSnippet: z.string().max(2000),
    }),
    z.object({
      action: z.literal('discard'),
      sessionId: z.string().guid(),
      discardReason: z.enum(REASONS).optional(),
      discardReasonText: z.string().max(500).optional(),
    }),
  ])
  .openapi('AiChatConfirmInput');

export const aiChatConfirmResponseSchema = z
  .object({
    ok: z.literal(true),
    createdCount: z.number().int(),
    skippedCount: z.number().int().optional(),
    hasEdits: z.boolean().optional(),
  })
  .openapi('AiChatConfirmResponse');

export const aiChatEventRequestSchema = z
  .discriminatedUnion('event', [
    z.object({
      event: z.literal('ai_capture_input_started'),
      source: z.literal('rough_capture'),
    }),
    z.object({
      event: z.literal('feedback_unread_hint_shown'),
      version: z.string().min(1),
    }),
    z.object({
      event: z.literal('feedback_unread_hint_dismissed'),
      reason: z.enum(['close_button', 'cta_click']),
      version: z.string().min(1),
    }),
    z.object({
      event: z.literal('calendar_view_switched'),
      view: z.enum(['board', 'calendar']),
    }),
    z.object({
      event: z.literal('calendar_task_moved'),
      taskId: z.string().guid(),
      fromDate: ymd.nullable(),
      toDate: ymd,
    }),
    z.object({
      event: z.literal('calendar_task_pushed_to_next_week'),
      taskId: z.string().guid(),
      fromDate: ymd.nullable(),
      toDate: ymd,
    }),
    z.object({
      event: z.literal('calendar_task_created_from_plus'),
      date: ymd,
      taskId: z.string().guid(),
    }),
    z.object({
      event: z.literal('calendar_day_detail_opened'),
      date: ymd,
    }),
  ])
  .openapi('AiChatEventInput');

export const aiChatFeedbackRequestSchema = z
  .object({
    sessionId: z.string().guid(),
    organizeScore: z.number().int().min(1).max(5).optional(),
    inputBurdenScore: z.number().int().min(1).max(5).optional(),
    editReason: z.enum(REASONS).optional(),
    editReasonText: z.string().max(500).optional(),
  })
  .openapi('AiChatFeedbackInput');
