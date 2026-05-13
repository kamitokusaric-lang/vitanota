// Phase 1 コア体験「雑に投げる → 整う → 残る」の AI カテゴリ分類定義 (v1, 2026-05-13)
//
// chimo 設計 (2026-05-13): 8 大分類 + 9 小分類 = 17 分類体系。
// AI には小分類があるものは小分類まで選ばせる。tasks.category_id への
// 永続化時には親の大分類 (DB に存在する 8 カテゴリ) にロールアップする。
// 小分類自体は ai_sessions.ai_output_json に詳細を保持し、改善材料とする。
//
// MVP では本ファイルがカテゴリ定義の正本 (コード内 hardcode)。
// 将来は system_admin 管理画面 + DB JSONB に移管 (post-mvp-backlog 行き)。
//
// === category_id null の境界処理 (重要) ===
// AI 出力レベル (ai_sessions.ai_output_json) では category_id = null 許容。
// AI が判断できない場合に未分類で返すのが安全 (chimo 指示「未分類を許す方が安全」)。
// 一方 tasks.category_id は DB レベルで NOT NULL。
// UI で教員が必ずカテゴリを選択してから tasks INSERT する動線で整合させる。
//   AI 出力 null → UI で「カテゴリを選んでください」表示 + 作成ボタン disabled
//   教員選択完了 → resolveParentName で大分類解決 → DB の task_categories.id を解決
//   ai_sessions に AI 提案 (null 含む) と教員選択結果の両方を保持し修正ログとする。

export type AiCategoryId =
  | 'learning_education_plan'
  | 'learning_academic_improvement'
  | 'learning_special_support'
  | 'learning_career'
  | 'nurture_student_guidance'
  | 'nurture_group_activity'
  | 'nurture_health'
  | 'safety_admin_accounting'
  | 'safety_general_safety'
  | 'grade_1'
  | 'grade_2'
  | 'grade_3'
  | 'special_support_class'
  | 'school_affairs';

// DB 上に存在する大分類 (task_categories.name と完全一致で照合)
export type ParentCategoryName =
  | '学び'
  | '育み'
  | '安心'
  | '1学年'
  | '2学年'
  | '3学年'
  | '特別支援学級'
  | '校務';

export interface AiCategoryDefinition {
  id: AiCategoryId;
  label: string;            // 表示用 (例: "学び > 教育計画")
  parentName: ParentCategoryName; // tasks.category_id 解決時のロールアップ先
  description: string;      // AI への定義
  examples: string[];       // 代表的なタスク例
  keywords: string[];       // よく出る語
}

export const AI_CATEGORY_DEFINITIONS: AiCategoryDefinition[] = [
  // 1. 学び
  {
    id: 'learning_education_plan',
    label: '学び > 教育計画',
    parentName: '学び',
    description:
      '年間指導計画、単元計画、授業計画、評価計画、カリキュラム、教材準備に関する業務',
    examples: [
      '来週の授業案を作る',
      '年間指導計画を確認する',
      '単元計画を修正する',
      '授業プリントを準備する',
    ],
    keywords: ['授業', '指導案', '単元', '年間指導計画', '評価計画', 'カリキュラム', '教材', 'プリント'],
  },
  {
    id: 'learning_academic_improvement',
    label: '学び > 学力向上',
    parentName: '学び',
    description: 'テスト、採点、成績、補習、学習状況の把握、学力向上施策に関する業務',
    examples: [
      '小テストを採点する',
      '成績を入力する',
      '補習対象者を確認する',
      '提出物をチェックする',
    ],
    keywords: ['テスト', '採点', '成績', '補習', '学力', '提出物', '課題', '評価'],
  },
  {
    id: 'learning_special_support',
    label: '学び > 特別支援',
    parentName: '学び',
    description:
      '個別の教育的支援、合理的配慮、支援計画、通常学級内での配慮や支援に関する業務。特別支援学級そのものの運営は含めない',
    examples: [
      '個別支援計画を確認する',
      '合理的配慮の内容を整理する',
      '支援が必要な生徒の教材を調整する',
      '通級担当に支援方法を相談する',
    ],
    keywords: ['個別支援', '支援計画', '合理的配慮', '配慮', '通級', '支援方法'],
  },
  {
    id: 'learning_career',
    label: '学び > 進路',
    parentName: '学び',
    description: '進路指導、進路希望調査、キャリア教育、受験、推薦、面談、進学・就職に関する業務',
    examples: [
      '進路希望調査を集計する',
      '進路面談の準備をする',
      '推薦書の下書きを確認する',
      '受験書類を確認する',
    ],
    keywords: ['進路', '進路希望', '受験', '推薦', '面談', 'キャリア', '進学', '就職'],
  },
  // 2. 育み
  {
    id: 'nurture_student_guidance',
    label: '育み > 生徒指導',
    parentName: '育み',
    description:
      '生活指導、個別対応、声かけ、トラブル対応、面談、気になる様子の確認に関する業務',
    examples: [
      '気になる生徒に声をかける',
      '生徒同士のトラブルについて相談する',
      '面談メモを整理する',
      '遅刻が続く生徒の対応を確認する',
    ],
    keywords: ['生徒指導', '生活指導', '声かけ', 'トラブル', '面談', '様子', '遅刻', '相談'],
  },
  {
    id: 'nurture_group_activity',
    label: '育み > 集団活動',
    parentName: '育み',
    description: '学級活動、学校行事、委員会、クラブ、係活動、集団づくりに関する業務',
    examples: [
      '学級活動の準備をする',
      '行事の係分担を確認する',
      '委員会の資料を作る',
      '班決めを進める',
    ],
    keywords: ['学級活動', '行事', '委員会', 'クラブ', '係', '班', '集団', 'HR'],
  },
  {
    id: 'nurture_health',
    label: '育み > 保健',
    parentName: '育み',
    description: '健康観察、欠席、体調不良、保健室連携、感染症対応、安全衛生に関する業務',
    examples: [
      '体調不良の生徒について保健室に確認する',
      '欠席状況を確認する',
      '健康観察の記録を確認する',
      '感染症対応について共有する',
    ],
    keywords: ['保健', '体調', '健康', '欠席', '保健室', '感染症', '健康観察'],
  },
  // 3. 安心
  {
    id: 'safety_admin_accounting',
    label: '安心 > 事務経理',
    parentName: '安心',
    description: '予算、会計、購入、出張、申請、文書、事務手続きに関する業務',
    examples: [
      '教材費の申請をする',
      '出張申請を確認する',
      '購入物品の見積もりを取る',
      '会計書類を整理する',
    ],
    keywords: ['事務', '経理', '会計', '予算', '購入', '申請', '出張', '見積', '書類'],
  },
  {
    id: 'safety_general_safety',
    label: '安心 > 総務安全',
    parentName: '安心',
    description: '防災、防犯、安全点検、施設、備品、総務的な学校運営に関する業務',
    examples: [
      '避難訓練の資料を確認する',
      '安全点検を行う',
      '教室設備の不具合を報告する',
      '備品を確認する',
    ],
    keywords: ['総務', '安全', '防災', '防犯', '施設', '備品', '点検', '避難訓練'],
  },
  // 4-6. 学年
  {
    id: 'grade_1',
    label: '1学年',
    parentName: '1学年',
    description:
      '1学年の学年運営、学年会、学年内連絡、学年行事、学年内共有に関する業務。業務内容が授業・進路・生徒指導などに明確に該当する場合はそちらを優先する',
    examples: ['1学年会の資料を作る', '1学年の連絡事項を確認する'],
    keywords: ['1学年', '1年', '一年', '学年会'],
  },
  {
    id: 'grade_2',
    label: '2学年',
    parentName: '2学年',
    description:
      '2学年の学年運営、学年会、学年内連絡、学年行事、学年内共有に関する業務。業務内容が授業・進路・生徒指導などに明確に該当する場合はそちらを優先する',
    examples: ['2学年会の資料を作る', '2学年の連絡事項を確認する'],
    keywords: ['2学年', '2年', '二年', '学年会'],
  },
  {
    id: 'grade_3',
    label: '3学年',
    parentName: '3学年',
    description:
      '3学年の学年運営、学年会、学年内連絡、学年行事、学年内共有に関する業務。業務内容が授業・進路・生徒指導などに明確に該当する場合はそちらを優先する',
    examples: ['3学年会の資料を作る', '3学年の連絡事項を確認する'],
    keywords: ['3学年', '3年', '三年', '学年会'],
  },
  // 7. 特別支援学級
  {
    id: 'special_support_class',
    label: '特別支援学級',
    parentName: '特別支援学級',
    description:
      '特別支援学級そのものの学級運営、授業、時間割、保護者連絡、行事、学級事務に関する業務',
    examples: [
      '特別支援学級の時間割を確認する',
      '支援級の教材を準備する',
      '特別支援学級の保護者連絡を整理する',
      '支援級の学級運営について打ち合わせる',
    ],
    keywords: ['特別支援学級', '支援級', '固定級', '支援学級'],
  },
  // 8. 校務
  {
    id: 'school_affairs',
    label: '校務',
    parentName: '校務',
    description:
      '校務分掌、校内委員会、職員会議、学校全体の運営、他カテゴリに明確に当てはまらない学校運営業務',
    examples: [
      '職員会議の資料を確認する',
      '校務分掌の入力をする',
      '校内委員会の準備をする',
      '学校評価の資料を整理する',
    ],
    keywords: ['校務', '校務分掌', '職員会議', '校内委員会', '学校評価', '運営'],
  },
];

// AI 出力 category_id を DB の大分類名にロールアップ。null は未分類 (UI で教員が必須選択)。
export function resolveParentName(
  aiCategoryId: string | null | undefined,
): ParentCategoryName | null {
  if (!aiCategoryId) return null;
  const def = AI_CATEGORY_DEFINITIONS.find((c) => c.id === aiCategoryId);
  return def?.parentName ?? null;
}

// プロンプトに埋め込む分類ルール (chimo 2026-05-13 提示)
export const AI_CATEGORY_PROMPT_RULES = `分類ルール:
- category_id は必ず提供されたカテゴリ一覧から選ぶ。
- 新しいカテゴリ名を作らない。
- 判断できない場合は category_id を null にする (UI で教員が選び直す)。
- 「学び」「育み」「安心」に小分類がある場合は、できる限り小分類まで分類する。
- 業務内容が明確な場合は、学年カテゴリより業務内容カテゴリを優先する。
  例: 「3年の進路希望調査」は learning_career。
  例: 「2年の小テスト採点」は learning_academic_improvement。
  例: 「1年の生徒トラブル対応」は nurture_student_guidance。
- 学年会、学年内連絡、学年運営、学年全体の共有は grade_1 / grade_2 / grade_3 に分類する。
- 「特別支援学級」「支援級」「固定級」が明示されている場合は special_support_class に分類する。
- 個別の教育的支援、合理的配慮、支援計画、通常学級内での支援は learning_special_support に分類する。
- 個別の生徒対応、声かけ、生活面の相談、トラブル対応は nurture_student_guidance に分類する。
- category_confidence を high / medium / low で返す。`;
