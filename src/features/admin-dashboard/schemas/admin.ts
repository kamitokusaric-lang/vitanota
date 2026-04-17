import { z } from 'zod';

export const teacherIdParamSchema = z.object({
  id: z.string().uuid('不正な教員IDです'),
});

export const alertIdParamSchema = z.object({
  id: z.string().uuid('不正なアラートIDです'),
});
