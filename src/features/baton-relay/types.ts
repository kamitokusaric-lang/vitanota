// baton-relay フロント用の型。response schema (S1) から z.infer で抽出し、
// サーバコード (service) を import せずに型だけ共有する。
import type { z } from 'zod';
import type {
  classResponseSchema,
  studentResponseSchema,
  batonNoteResponseSchema,
  impressionSignSchema,
} from './schemas/batonRelay';

export type ClassDto = z.infer<typeof classResponseSchema>;
export type StudentDto = z.infer<typeof studentResponseSchema>;
export type BatonNoteDto = z.infer<typeof batonNoteResponseSchema>;
export type ImpressionSign = z.infer<typeof impressionSignSchema>;
