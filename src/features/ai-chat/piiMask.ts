// 教員入力文の PII 抽象化ヘルパー。Lambda (handler.ts) と API (LOCAL_MOCK) 両方で使う共通ロジック。
//
// 構造化ログや改善分析用テキスト (input_text_redacted) に流す際の最低限のマスク。
// 完全な PII 除去ではなく「regex で潰せる代表的なパターン」のみ。
// 生徒名・保護者名は AI 側の system prompt 制約で抽象化させる (regex で潰し切れない)。

export function maskPii(input: string): string {
  return input
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/0\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}/g, '[phone]');
}
