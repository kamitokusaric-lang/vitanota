// カード上のカテゴリ chip の色分け。
// 業務カテゴリの色付けは踏み絵に触れない (情緒データ = mood/感情 のみ踏み絵)。
// カテゴリに color カラムは無いため、カテゴリ名から決定的に淡色を割り当てる
// (同名カテゴリは常に同色)。
// トーンはマイノートの kind pill (つぶやき=青 / 感謝=ピンク / 相談=コーラル / 続けたい=緑 /
// ナレッジ=黄 / 気になる=琥珀 / ふりかえり=ベージュ) と揃える (chimo 2026-07-02)。
const PALETTE = [
  'bg-vn-blue-bg text-vn-blue-text',
  'bg-vn-green-bg text-vn-green-text',
  'bg-vn-yellow-bg text-vn-yellow-text',
  'bg-vn-pink-bg text-vn-pink-text',
  'bg-vn-accent-bg text-vn-accent-text',
  'bg-vn-warning-bg text-vn-warning-text',
  'bg-vn-muted-bg text-slate-600',
] as const;

export function categoryColorClass(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
