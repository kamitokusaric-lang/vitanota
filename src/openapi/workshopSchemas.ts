// 研修 (workshop) の OpenAPI レスポンススキーマ。
// 入力 (body) は src/features/workshop/schemas/workshop.ts に定義。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// 箱メタ (コード定数由来)。
export const workshopBoxSchema = z
  .object({
    id: z.string().guid(),
    schedule: z
      .string()
      .optional()
      .openapi({ example: '2026/8/18 10:00-12:00 開催' }),
    title: z.string().openapi({ example: '正解がない課題にチームで向き合う' }),
    checkinQuestion: z
      .string()
      .openapi({ example: '子どもの頃、動物園でいちばん好きだった場所はどこですか？' }),
  })
  .openapi('WorkshopBox');

// 箱の中に並ぶ参加者のチェックイン (著者名付き・匿名化考慮で userId/userName は null 可)。
export const workshopCheckinViewSchema = z
  .object({
    id: z.string().guid(),
    userId: z.string().guid().nullable(),
    userName: z.string().nullable(),
    answer: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('WorkshopCheckinView');

// 箱の中に並ぶ振り返り (紐付いた公開 note の本文 + 著者名)。
export const workshopReflectionViewSchema = z
  .object({
    journalEntryId: z.string().guid(),
    userId: z.string().guid().nullable(),
    userName: z.string().nullable(),
    content: z.string(),
    createdAt: z.string().datetime(),
  })
  .openapi('WorkshopReflectionView');

// 箱の中に並ぶチーム振り返り (1班1枚)。紙の「振り返り・発表シート」の4問。
// 「最後に書いた人」は返さない (入力係を UI に可視化しないため)。
export const workshopTeamReflectionViewSchema = z
  .object({
    teamKey: z.string().openapi({ example: '1' }),
    change: z
      .string()
      .openapi({ description: '① 1周目と3周目を比べて何が変わったか' }),
    moment: z.string().openapi({ description: '② チームだから起きた瞬間' }),
    motto: z
      .string()
      .openapi({ description: '③ 合言葉', example: 'まず全員で事実を言う' }),
    next: z.string().openapi({ description: '④ 仕事で活かせること' }),
    updatedAt: z.string().datetime(),
  })
  .openapi('WorkshopTeamReflectionView');

// GET /api/workshop のレスポンス (箱 + 自分の回答 + みんなの回答 + 振り返り)。
export const workshopBoardResponseSchema = z
  .object({
    workshop: workshopBoxSchema,
    myCheckin: z
      .object({
        answer: z.string(),
        updatedAt: z.string().datetime(),
      })
      .nullable(),
    checkins: z.array(workshopCheckinViewSchema),
    reflections: z.array(workshopReflectionViewSchema),
    teamReflections: z.array(workshopTeamReflectionViewSchema),
  })
  .openapi('WorkshopBoardResponse');

// チェックイン投稿の生行 (POST /api/workshop/checkin のレスポンス)。
export const workshopCheckinSchema = z
  .object({
    id: z.string().guid(),
    tenantId: z.string().guid(),
    workshopId: z.string().guid(),
    userId: z.string().guid().nullable(),
    answer: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('WorkshopCheckin');

export const workshopCheckinResponseSchema = z
  .object({ checkin: workshopCheckinSchema })
  .openapi('WorkshopCheckinResponse');

// チーム振り返り upsert の生行 (POST /api/workshop/team-reflection のレスポンス)。
export const workshopTeamReflectionSchema = z
  .object({
    id: z.string().guid(),
    tenantId: z.string().guid(),
    workshopId: z.string().guid(),
    teamKey: z.string(),
    teamChange: z.string(),
    teamMoment: z.string(),
    teamMotto: z.string(),
    teamNext: z.string(),
    updatedBy: z.string().guid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('WorkshopTeamReflection');

export const workshopTeamReflectionResponseSchema = z
  .object({ teamReflection: workshopTeamReflectionSchema })
  .openapi('WorkshopTeamReflectionResponse');
