// SP-U02-04 Layer 3: 型ブランドによる Repository 誤用防止
// PublicJournalEntry は PublicTimelineRepository からのみ返却される型

export type Brand<T, B> = T & { readonly __brand: B };

// 公開タイムライン専用型
// PublicTimelineRepository.findTimeline() のみが返却する
// PrivateJournalRepository の戻り値（JournalEntry）とは型レベルで非互換
import type { JournalEntry } from '@/db/schema';

export type PublicJournalEntry = Brand<
  Omit<JournalEntry, 'isPublic'>,  // VIEW で is_public を露出しない
  'PublicJournalEntry'
>;
