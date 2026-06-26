// ふりかえり (自分だけの非公開 note) の「3行日誌テンプレ」直列化/復元ヘルパー (chimo 2026-06-26)。
// KPT を和らげた 3 区分を、DB を変えずに content 単一カラムへ見出し行付きで束ねる。
// テンプレを使わない (自由記述) 選択も残すため、parse は見出しが無ければ自由記述として返す。
//   - 踏み絵: ふりかえりは「自分だけ」= 観測されない自己向けの型。改善/評価語は避け和語に寄せる。

export type ReflectionKey = 'keep' | 'problem' | 'try';

export interface ReflectionSection {
  key: ReflectionKey;
  heading: string;
  placeholder: string;
}

// 固定順。heading は content 内の「行まるごと一致」で区切りに使う (表示も whitespace-pre-wrap でそのまま読める)。
export const REFLECTION_SECTIONS: readonly ReflectionSection[] = [
  { key: 'keep', heading: 'よかった・続けたいこと', placeholder: 'よかったこと、続けたいことは?' },
  { key: 'problem', heading: '気になった・困ったこと', placeholder: '気になったこと、困ったことは?' },
  { key: 'try', heading: '次に試したいこと', placeholder: '次に試したいことは?' },
];

export type ReflectionValues = Record<ReflectionKey, string>;

export const emptyReflectionValues = (): ReflectionValues => ({
  keep: '',
  problem: '',
  try: '',
});

const HEADINGS = REFLECTION_SECTIONS.map((s) => s.heading);

// 非空セクションのみ「見出し + 本文」で連結 (空白行区切り)。空欄の見出しは出さない。
export function composeReflection(values: ReflectionValues): string {
  return REFLECTION_SECTIONS.filter((s) => values[s.key].trim() !== '')
    .map((s) => `${s.heading}\n${values[s.key].trim()}`)
    .join('\n\n');
}

// content を見出し行で区切って各セクション本文を抽出。
// 見出しが 1 つでも見つかれば isTemplate:true (テンプレで開く)。無ければ自由記述。
export function parseReflection(content: string): {
  isTemplate: boolean;
  values: ReflectionValues;
} {
  const lines = content.split('\n');
  const values = emptyReflectionValues();
  let current: ReflectionKey | null = null;
  let buf: string[] = [];
  let found = false;

  const flush = () => {
    if (current) values[current] = buf.join('\n').trim();
    buf = [];
  };

  for (const line of lines) {
    const idx = HEADINGS.indexOf(line);
    if (idx !== -1) {
      flush();
      current = REFLECTION_SECTIONS[idx].key;
      found = true;
    } else if (current) {
      buf.push(line);
    }
  }
  flush();

  return { isTemplate: found, values };
}
