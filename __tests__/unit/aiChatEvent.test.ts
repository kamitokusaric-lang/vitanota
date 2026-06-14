// Slice 2b: ai-chat Lambda の event union ルーティング + kind_suggestion mock の回帰防止。
import { describe, it, expect } from 'vitest';
import {
  AiChatEventSchema,
  KindSuggestEventSchema,
  ExtractEventSchema,
} from '../../scripts/ai-chat-extract/schemas';
import { mockKindSuggest } from '@/features/ai-chat/kindSuggest';

describe('AiChatEventSchema (task_extraction / kind_suggestion union)', () => {
  it('kind_suggestion イベントを受理する', () => {
    const parsed = AiChatEventSchema.safeParse({
      type: 'kind_suggestion',
      inputText: 'プリントのやり方を共有します',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.type).toBe('kind_suggestion');
  });

  it('task_extraction イベント (type 省略) を受理する', () => {
    const parsed = AiChatEventSchema.safeParse({ inputText: '明日までに保護者へ返信' });
    expect(parsed.success).toBe(true);
  });

  it('kind_suggestion は strict: 余分なキーを弾く', () => {
    expect(
      KindSuggestEventSchema.safeParse({
        type: 'kind_suggestion',
        inputText: 'x',
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it('不正な type は union のどちらでも受からない', () => {
    expect(
      AiChatEventSchema.safeParse({ type: 'unknown', inputText: 'x' }).success,
    ).toBe(false);
    // 念のため extract 側 strict も確認
    expect(
      ExtractEventSchema.safeParse({ type: 'kind_suggestion', inputText: 'x' }).success,
    ).toBe(false);
  });
});

describe('mockKindSuggest (MOCK_BEDROCK 時の Lambda 応答)', () => {
  it('相談ワード → help', () => {
    expect(mockKindSuggest('ちょっと相談したいことがあります').suggestedKind).toBe('help');
  });
  it('感謝ワード → thanks', () => {
    expect(mockKindSuggest('助かりました、ありがとうございます').suggestedKind).toBe('thanks');
  });
  it('やり方共有 → knowledge', () => {
    expect(mockKindSuggest('掲示物作成のコツをまとめました').suggestedKind).toBe('knowledge');
  });
  it('特定できない → null (tweet 据え置き)', () => {
    expect(mockKindSuggest('今日はいい天気だった').suggestedKind).toBeNull();
  });
});
