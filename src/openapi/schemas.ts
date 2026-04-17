// Step 18: API レスポンス・エラー型の OpenAPI スキーマ
// リクエスト型は src/features/*/schemas/ に既存
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

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
    id: z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' }),
    tenantId: z.string().uuid(),
    userId: z.string().uuid(),
    content: z.string().openapi({ example: '今日の授業の振り返り' }),
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
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    name: z.string().openapi({ example: 'うれしい' }),
    type: z.enum(['emotion', 'context']).openapi({ example: 'emotion' }),
    category: z.enum(['positive', 'negative', 'neutral']).nullable().openapi({ example: 'positive' }),
    isSystemDefault: z.boolean(),
    sortOrder: z.number().int(),
    createdBy: z.string().uuid().nullable(),
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
