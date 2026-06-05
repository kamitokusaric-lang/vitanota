// Step 18: API レスポンス・エラー型の OpenAPI スキーマ
// リクエスト型は src/features/*/schemas/ に既存
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { aiCaptureOnboardingStateSchema } from '@/schemas/userOnboardingStates';

extendZodWithOpenApi(z);

// ─────────────────────────────────────────────────────────────
// 共通エラーレスポンス
// ─────────────────────────────────────────────────────────────

export const errorResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'VALIDATION_ERROR' }),
    message: z.string().openapi({ example: '入力が不正です' }),
  })
  .openapi('ErrorResponse');

// ─────────────────────────────────────────────────────────────
// Journal Entry レスポンス型
// ─────────────────────────────────────────────────────────────

// 公開タイムライン用（is_public 列を含まない、SP-U02-04 Layer 4 VIEW 由来）
export const publicJournalEntrySchema = z
  .object({
    id: z.string().guid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    tenantId: z.string().guid(),
    userId: z.string().guid(),
    content: z.string().openapi({ example: '今日の授業の振り返り' }),
    mood: z
      .enum(['very_positive', 'positive', 'neutral', 'negative', 'very_negative'])
      .nullable()
      .openapi({ example: 'positive' }),
    createdAt: z.string().datetime().openapi({ example: '2026-04-15T10:00:00Z' }),
    updatedAt: z.string().datetime().openapi({ example: '2026-04-15T10:00:00Z' }),
    // 意図的に isPublic を含めない（型レベルで is_public 漏えい防止）
  })
  .openapi('PublicJournalEntry');

// マイ記録・編集用（isPublic を含む完全版）
export const journalEntrySchema = publicJournalEntrySchema
  .extend({
    isPublic: z.boolean().openapi({ example: true }),
  })
  .openapi('JournalEntry');

// タイムライン取得レスポンス
export const timelineResponseSchema = z
  .object({
    entries: z.array(publicJournalEntrySchema),
    page: z.number().int(),
    perPage: z.number().int(),
  })
  .openapi('TimelineResponse');

// マイ記録レスポンス
export const myJournalResponseSchema = z
  .object({
    entries: z.array(journalEntrySchema),
    page: z.number().int(),
    perPage: z.number().int(),
  })
  .openapi('MyJournalResponse');

// エントリ単体レスポンス（作成・取得・更新時）
export const entryResponseSchema = z
  .object({
    entry: journalEntrySchema,
  })
  .openapi('EntryResponse');

// ─────────────────────────────────────────────────────────────
// Tag レスポンス型
// ─────────────────────────────────────────────────────────────

export const tagSchema = z
  .object({
    id: z.string().guid(),
    tenantId: z.string().guid(),
    name: z.string().openapi({ example: 'うれしい' }),
    type: z.enum(['emotion', 'context']).openapi({ example: 'emotion' }),
    category: z.enum(['positive', 'negative', 'neutral']).nullable().openapi({ example: 'positive' }),
    isSystemDefault: z.boolean(),
    sortOrder: z.number().int(),
    createdBy: z.string().guid().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('Tag');

export const tagListResponseSchema = z
  .object({
    tags: z.array(tagSchema),
  })
  .openapi('TagListResponse');

export const tagResponseSchema = z
  .object({
    tag: tagSchema,
  })
  .openapi('TagResponse');

export const tagDeleteResponseSchema = z
  .object({
    affectedEntries: z.number().int().openapi({ example: 0 }),
  })
  .openapi('TagDeleteResponse');

// ─────────────────────────────────────────────────────────────
// Knowledge Tag レスポンス型（taskTag と同パターン: 利用件数付き）
// ─────────────────────────────────────────────────────────────
export const knowledgeTagSchema = z
  .object({
    id: z.string().guid(),
    name: z.string().openapi({ example: '校内研修' }),
    createdBy: z.string().guid().nullable(),
    createdAt: z.string().datetime(),
    assignmentCount: z.number().int().openapi({ example: 0 }),
  })
  .openapi('KnowledgeTag');

export const knowledgeTagListResponseSchema = z
  .object({ tags: z.array(knowledgeTagSchema) })
  .openapi('KnowledgeTagListResponse');

export const knowledgeTagResponseSchema = z
  .object({ tag: knowledgeTagSchema })
  .openapi('KnowledgeTagResponse');

// ─────────────────────────────────────────────────────────────
// Profile レスポンス型
// ─────────────────────────────────────────────────────────────
export const profileResponseSchema = z
  .object({
    profile: z.object({
      nickname: z.string().nullable().openapi({ example: 'たなか' }),
    }),
  })
  .openapi('ProfileResponse');

// ─────────────────────────────────────────────────────────────
// Onboarding State レスポンス型（未保存なら state=null）
// ─────────────────────────────────────────────────────────────
export const onboardingStateResponseSchema = z
  .object({
    state: aiCaptureOnboardingStateSchema.nullable(),
  })
  .openapi('OnboardingStateResponse');

// ─────────────────────────────────────────────────────────────
// Announcement レスポンス型（運営からのお知らせ）
// ─────────────────────────────────────────────────────────────
export const announcementSchema = z
  .object({
    id: z.string().guid(),
    publishDate: z.string().openapi({ example: '2026-06-01' }),
    title: z.string().openapi({ example: 'メンテナンスのお知らせ' }),
    body: z.array(z.string()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('Announcement');

export const announcementsResponseSchema = z
  .object({ announcements: z.array(announcementSchema) })
  .openapi('AnnouncementsResponse');

// ─────────────────────────────────────────────────────────────
// Invitation レスポンス型
// ─────────────────────────────────────────────────────────────
// 招待作成 (POST /api/invitations) のリクエスト body
export const createInvitationSchema = z
  .object({
    email: z.string().email().openapi({ example: 'teacher@example.com' }),
    role: z.enum(['teacher', 'school_admin']),
    tenantId: z.string().guid(),
  })
  .openapi('CreateInvitationInput');

// 招待作成レスポンス
export const invitationCreatedResponseSchema = z
  .object({
    invitation: z.object({
      id: z.string().guid(),
      expiresAt: z.string().datetime(),
      inviteUrl: z.string().openapi({ example: 'https://vitanota.io/auth/invite?token=...' }),
    }),
  })
  .openapi('InvitationCreatedResponse');

// 招待トークン検証 (GET /api/invitations/{token}) レスポンス
export const invitationInfoResponseSchema = z
  .object({
    invitation: z.object({
      email: z.string(),
      role: z.enum(['teacher', 'school_admin']),
      expiresAt: z.string().datetime(),
    }),
  })
  .openapi('InvitationInfoResponse');

// 招待受諾 (POST /api/invitations/{token}) レスポンス
export const successResponseSchema = z
  .object({ success: z.literal(true) })
  .openapi('SuccessResponse');
