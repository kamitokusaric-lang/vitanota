// 投稿内容の個人情報を正規表現でマスキング
// 設計書: aidlc-docs/construction/weekly-summary-design.md § 6
// 投稿時に呼び出され、content_masked カラムへ保存される。
// AI 入力に使用、本人表示は content (原文) を引き続き使う。
// 完璧でなくて OK の方針 (思想優先 = 個人特定回避を最優先)。

// マスキング設計:
// - 接頭辞は「漢字・カタカナのみ」(ひらがな除外) で、助詞 (の/と/が) で greedy match を stop
// - 接頭辞は {2,4} 文字必須 で「皆さん」「南先生」等の漢字 1 文字一般語の巻き込みを防止
//   (副作用: 1 文字苗字「南さん」「翼くん」は漏れる、許容範囲)
// - 役職 (校長/教頭/主任) は単独でも人を指すため {0,4} で接頭辞オプショナル
const MASK_PATTERNS: Array<{ regex: RegExp; replace: string }> = [
  // 児童・生徒系: 漢字・カタカナ {2,4} + 敬称
  { regex: /[一-龯ァ-ヶー]{2,4}(?:くん|君|ちゃん)/g, replace: '生徒' },

  // 教員系 ○○先生/○○教諭: 接頭辞必須 {2,4}
  { regex: /[一-龯ァ-ヶー]{2,4}(?:先生|教諭)/g, replace: '同僚' },

  // 役職単独 校長/教頭/主任: 接頭辞オプショナル {0,4} (山田校長 / 校長会 両対応)
  { regex: /[一-龯ァ-ヶー]{0,4}(?:校長|教頭|主任)/g, replace: '同僚' },

  // 一般敬称 ○○さん/様: 接頭辞必須 {2,4}
  { regex: /[一-龯ァ-ヶー]{2,4}(?:さん|様)/g, replace: 'ある人' },

  // クラス名
  { regex: /\d+年\d+組(?:\d+班)?/g, replace: 'クラス' },
  { regex: /[一二三四五六]年[一二三四五六]組/g, replace: 'クラス' },
  { regex: /\d+組/g, replace: 'クラス' },

  // 学校名 {2,8}
  { regex: /[一-龯ァ-ヶー]{2,8}(?:小学校|中学校|高等学校|高校|学園)/g, replace: '学校' },
];

export function maskContent(text: string): string {
  return MASK_PATTERNS.reduce(
    (acc, { regex, replace }) => acc.replace(regex, replace),
    text,
  );
}
