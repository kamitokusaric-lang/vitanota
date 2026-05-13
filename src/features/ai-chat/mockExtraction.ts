// AppRunner (Next.js) 側で動かす AI 整理の inline mock。
// AI_CHAT_LOCAL_MOCK=true の時に Lambda invoke せず本ファイルで応答する。
// 本番では Lambda 経由 (scripts/ai-chat-extract/) で実 Bedrock を叩く。
//
// Lambda 側にも同等の mock (bedrockInvoker.ts) があるが、Lambda の deps と
// Next.js の deps が別管理なので、ローカル開発用にこちらに独立配置する。

interface MockTask {
  title: string;
  category_id: string | null;
  due_date: string | null;
  memo: string;
  confidence: 'high' | 'medium' | 'low';
}

interface MockResult {
  tasks: MockTask[];
  needsConfirmation: string[];
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 入力文から「明日」「5/25」「金曜」など最初の期限表現を 1 つ抽出。
// MOCK では全タスクに同じ期限を適用する簡易実装。複数タスク × 複数期限の
// 対応関係は実 AI (本番 Bedrock) に任せる。教員は UI で個別調整可能。
function extractDueDate(text: string, today: Date = new Date()): string | null {
  if (/今日/.test(text)) return toIsoDate(today);
  if (/明日/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toIsoDate(d);
  }
  if (/明後日|あさって/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return toIsoDate(d);
  }

  // 5/25, 05/25
  const slash = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (slash) {
    const m = Number(slash[1]);
    const d = Number(slash[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(today.getFullYear(), m - 1, d);
      if (dt < today) dt.setFullYear(today.getFullYear() + 1); // 過去日付は翌年扱い
      return toIsoDate(dt);
    }
  }

  // 5月25日
  const jp = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (jp) {
    const m = Number(jp[1]);
    const d = Number(jp[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(today.getFullYear(), m - 1, d);
      if (dt < today) dt.setFullYear(today.getFullYear() + 1);
      return toIsoDate(dt);
    }
  }

  // 曜日 (今週 / 来週)
  const dayMap: Record<string, number> = {
    日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
  };
  const dayMatch = text.match(/(今週|来週)?([日月火水木金土])曜/);
  if (dayMatch) {
    const isNextWeek = dayMatch[1] === '来週';
    const targetDay = dayMap[dayMatch[2]];
    const currentDay = today.getDay();
    let diff = targetDay - currentDay;
    if (diff <= 0) diff += 7; // 今日 = 目的曜日 でも来週扱い
    if (isNextWeek) diff += 7;
    const dt = new Date(today);
    dt.setDate(dt.getDate() + diff);
    return toIsoDate(dt);
  }

  return null;
}

export function mockExtractTasks(inputText: string): MockResult {
  const t = inputText;
  const dueDate = extractDueDate(t);
  const tasks: MockTask[] = [];

  if (/進路|受験|推薦/.test(t)) {
    tasks.push({
      title: '進路に関する確認をする',
      category_id: 'learning_career',
      due_date: dueDate,
      memo: '',
      confidence: 'medium',
    });
  }
  if (/テスト|採点|成績|プリント|授業/.test(t)) {
    tasks.push({
      title: '小テストを採点する',
      category_id: 'learning_academic_improvement',
      due_date: dueDate,
      memo: '',
      confidence: 'high',
    });
  }
  if (/保護者|連絡|返信/.test(t)) {
    tasks.push({
      title: '保護者へ返信する',
      category_id: 'nurture_student_guidance',
      due_date: dueDate,
      memo: '',
      confidence: 'medium',
    });
  }
  if (/職員会議|校務分掌|学校評価/.test(t)) {
    tasks.push({
      title: '職員会議資料を確認する',
      category_id: 'school_affairs',
      due_date: dueDate,
      memo: '',
      confidence: 'high',
    });
  }
  if (/支援級|特別支援学級|固定級/.test(t)) {
    tasks.push({
      title: '特別支援学級の連絡事項を整理する',
      category_id: 'special_support_class',
      due_date: dueDate,
      memo: '',
      confidence: 'high',
    });
  } else if (/支援|配慮|通級|個別/.test(t)) {
    tasks.push({
      title: '個別の支援内容を確認する',
      category_id: 'learning_special_support',
      due_date: dueDate,
      memo: '',
      confidence: 'medium',
    });
  }
  if (/避難|防災|施設|備品/.test(t)) {
    tasks.push({
      title: '安全点検の項目を確認する',
      category_id: 'safety_general_safety',
      due_date: dueDate,
      memo: '',
      confidence: 'medium',
    });
  }
  if (/申請|出張|会計|購入/.test(t)) {
    tasks.push({
      title: '申請書類を整理する',
      category_id: 'safety_admin_accounting',
      due_date: dueDate,
      memo: '',
      confidence: 'medium',
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      title: '内容を整理する',
      category_id: null,
      due_date: dueDate,
      memo: '入力からタスクを特定できなかったため、教員側でカテゴリを選んでください',
      confidence: 'low',
    });
  }

  return {
    tasks,
    needsConfirmation: [],
  };
}
