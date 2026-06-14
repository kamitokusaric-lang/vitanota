// staffroom (職員室ボード) フロント用の型。response schema から z.infer で抽出し、
// サーバコード (service) を import せずに型だけ共有する (baton-relay と同方式)。
import type { z } from 'zod';
import type {
  boardResponseSchema,
  boardReactionsSchema,
  staffroomBoardKindSchema,
  staffroomBoxKindSchema,
} from './schemas/staffroom';

export type BoardDto = z.infer<typeof boardResponseSchema>;
export type BoardReactions = z.infer<typeof boardReactionsSchema>;
// 投稿できる board ネイティブ kind (4)
export type StaffroomBoardKind = z.infer<typeof staffroomBoardKindSchema>;
// 表示する全 6 kind (board ネイティブ + 日々ノート系)
export type StaffroomBoxKind = z.infer<typeof staffroomBoxKindSchema>;
