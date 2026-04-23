import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const updateProfileSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .min(1, 'ニックネームを入力してください')
      .max(50, '50 文字以内で入力してください')
      .nullable(),
  })
  .openapi('UpdateProfileInput');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
