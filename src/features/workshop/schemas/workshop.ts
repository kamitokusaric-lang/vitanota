// 研修 (workshop) の Zod schema (リクエスト側)。
// レスポンス schema は src/openapi/workshopSchemas.ts。
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { WORKSHOP_TEAM_KEYS } from '../constants';

extendZodWithOpenApi(z);

// チェックイン回答 (研修前・任意)。1人1回答・上書き可。
export const submitCheckinSchema = z
  .object({
    answer: z
      .string()
      .trim()
      .min(1, '回答を入力してください')
      .max(2000),
  })
  .openapi('SubmitWorkshopCheckinInput');

export type SubmitCheckinInput = z.infer<typeof submitCheckinSchema>;

// 振り返り投稿 (研修後)。公開 note として職員室にも流れる (S3)。
export const postReflectionSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, '振り返りを入力してください')
      .max(4000),
  })
  .openapi('PostWorkshopReflectionInput');

export type PostReflectionInput = z.infer<typeof postReflectionSchema>;

// チーム振り返り (紙の「振り返り・発表シート」の4問)。1班1枚・上書き可。
// 12分かけて埋めるので途中保存を許す = 個々の欄は空でよい。
// ただし4問すべて空の保存は意味がないので弾く。
const teamAnswer = z.string().trim().max(2000).default('');

export const upsertTeamReflectionSchema = z
  .object({
    teamKey: z.enum(WORKSHOP_TEAM_KEYS as [string, ...string[]], {
      message: '班を選んでください',
    }),
    respect: teamAnswer,
    autonomy: teamAnswer,
    next: teamAnswer,
  })
  .refine(
    (v) => Boolean(v.respect || v.autonomy || v.next),
    { message: '振り返りを入力してください' },
  )
  .openapi('UpsertWorkshopTeamReflectionInput');

export type UpsertTeamReflectionInput = z.infer<
  typeof upsertTeamReflectionSchema
>;
