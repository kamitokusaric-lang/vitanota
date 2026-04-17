import { z } from 'zod';

export const emotionTrendQuerySchema = z.object({
  period: z.enum(['week', 'month', 'quarter']).default('week'),
});

export type EmotionTrendQuery = z.infer<typeof emotionTrendQuerySchema>;

export type EmotionTrendDataPoint = {
  date: string; // ISO date (YYYY-MM-DD)
  positive: number;
  negative: number;
  neutral: number;
  total: number;
};

export type EmotionTrendResponse = {
  period: 'week' | 'month' | 'quarter';
  data: EmotionTrendDataPoint[];
  totalEntries: number;
};
