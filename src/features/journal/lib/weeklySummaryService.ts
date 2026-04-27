// 週次レポート (今週のひとこと) 生成サービス
// 設計書: aidlc-docs/construction/weekly-summary-design.md
//
// 流れ:
//   1. その週 (月曜〜日曜) の summary が DB にあれば返却 (短絡)
//   2. なければ今週分の投稿 + タスクを集計
//   3. AI (Claude Haiku 4.5) にプロンプトを渡してねぎらいを生成
//   4. ガードレールチェック (人称・長さ)
//   5. DB 保存 + 返却
import { and, eq, gte, lt, inArray, or, sql } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/node-postgres';
import { withTenantUser } from '@/shared/lib/db';
import {
  journalEntries,
  journalEntryTags,
  emotionTags,
  tasks,
  journalWeeklySummaries,
} from '@/db/schema';
import type * as schema from '@/db/schema';
import type { MoodLevel } from '@/features/journal/schemas/journal';
import { pickDbRole } from './apiHelpers';
import { maskContent } from './mask-content';
import {
  callAnthropicMessages,
  ANTHROPIC_MODEL_HAIKU,
} from '@/shared/lib/anthropic-client';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

export interface ServiceContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

export interface WeeklySummaryResult {
  summary: string;
  weekStart: string; // YYYY-MM-DD
  generatedAt: Date;
}

// UI 表示用の集計統計 (AI 入力には使わない投稿テキストは含まない)
export interface WeeklySummaryStats {
  weekStart: string; // YYYY-MM-DD (月曜)
  weekEnd: string; // YYYY-MM-DD (日曜、含む)
  entryCount: number;
  publicCount: number;
  privateCount: number;
  moodDistribution: Record<MoodLevel, number>;
  topTags: Array<{ name: string; count: number }>;
  tasksCompleted: number;
  tasksActive: number;
  tasksDueThisWeek: number;
  tasksAssignedFromOthers: number;
  tasksDelegatedToOthers: number;
}

// ── 日付ユーティリティ ──────────────────────────────────────────
// 月曜始まりの「週の先頭日」を JST 0:00 で計算
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=日, 1=月, ..., 6=土
  const diff = day === 0 ? -6 : 1 - day; // 月曜まで戻す
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 「先週月曜 0:00」を返す。
// 「先週のひとこと」は直前に完了した 1 週間 (先週月〜日) を振り返る機能。
// 月曜朝にアクセスしても薄くならないよう、今週ではなく先週を集計する。
function getLastWeekStart(date: Date): Date {
  const d = getWeekStart(date);
  d.setDate(d.getDate() - 7);
  return d;
}

function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return end;
}

function toDateString(date: Date): string {
  // YYYY-MM-DD
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatJa(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// ── 集計データ ──────────────────────────────────────────────────
const MOOD_KEYS: MoodLevel[] = [
  'very_positive',
  'positive',
  'neutral',
  'negative',
  'very_negative',
];

interface AggregatedData {
  weekStart: Date;
  weekEnd: Date;
  // 投稿
  entries: Array<{
    contentMasked: string;
    mood: MoodLevel | null;
    isPublic: boolean;
  }>;
  moodDistribution: Record<MoodLevel, number>;
  topTags: Array<{ name: string; count: number }>;
  publicCount: number;
  privateCount: number;
  // タスク
  tasksCompleted: number;
  tasksActive: number;
  tasksDueThisWeek: number;
  tasksAssignedFromOthers: number;
  tasksDelegatedToOthers: number;
}

async function aggregateWeekData(
  tx: DrizzleDb,
  ctx: ServiceContext,
  weekStart: Date,
  weekEnd: Date,
): Promise<AggregatedData> {
  // 投稿取得 (今週のもの、自分の)
  const entryRows = await tx
    .select({
      id: journalEntries.id,
      content: journalEntries.content,
      contentMasked: journalEntries.contentMasked,
      mood: journalEntries.mood,
      isPublic: journalEntries.isPublic,
    })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, ctx.userId),
        eq(journalEntries.tenantId, ctx.tenantId),
        gte(journalEntries.createdAt, weekStart),
        lt(journalEntries.createdAt, weekEnd),
      ),
    );

  // content_masked が NULL のものは on-the-fly mask (既存投稿の backfill 待ち分)
  const entries = entryRows.map((e) => ({
    contentMasked: e.contentMasked ?? maskContent(e.content),
    mood: e.mood,
    isPublic: e.isPublic,
  }));

  // mood 分布
  const moodDistribution: Record<MoodLevel, number> = {
    very_positive: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    very_negative: 0,
  };
  for (const e of entries) {
    if (e.mood) moodDistribution[e.mood]++;
  }

  // タグ集計 (今週の entries に紐づくタグの上位 5 件)
  const entryIds = entryRows.map((e) => e.id);
  let topTags: Array<{ name: string; count: number }> = [];
  if (entryIds.length > 0) {
    const tagRows = await tx
      .select({
        name: emotionTags.name,
        count: sql<number>`count(*)::int`,
      })
      .from(journalEntryTags)
      .innerJoin(emotionTags, eq(emotionTags.id, journalEntryTags.tagId))
      .where(inArray(journalEntryTags.entryId, entryIds))
      .groupBy(emotionTags.id, emotionTags.name)
      .orderBy(sql`count(*) DESC`)
      .limit(5);
    topTags = tagRows.map((r) => ({ name: r.name, count: Number(r.count) }));
  }

  // タスク取得 (scope='mine' = 自分が assignee or createdBy)
  const myTasks = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.tenantId, ctx.tenantId),
        or(eq(tasks.ownerUserId, ctx.userId), eq(tasks.createdBy, ctx.userId)),
      ),
    );

  // タスク集計
  const weekStartDate = toDateString(weekStart);
  const weekEndDate = toDateString(weekEnd);

  let tasksCompleted = 0;
  let tasksActive = 0;
  let tasksDueThisWeek = 0;
  let tasksAssignedFromOthers = 0;
  let tasksDelegatedToOthers = 0;

  for (const t of myTasks) {
    const completedThisWeek =
      t.completedAt && t.completedAt >= weekStart && t.completedAt < weekEnd;
    const movedThisWeek =
      (t.createdAt >= weekStart && t.createdAt < weekEnd) ||
      (t.updatedAt >= weekStart && t.updatedAt < weekEnd);
    // dueDate は DATE 型 (時刻なし) なので YYYY-MM-DD 文字列比較で TZ 問題を回避
    const dueDateStr = t.dueDate ? toDateString(t.dueDate) : null;
    const dueThisWeek =
      dueDateStr !== null &&
      dueDateStr >= weekStartDate &&
      dueDateStr < weekEndDate;
    const newReceivedThisWeek =
      t.createdAt >= weekStart &&
      t.createdAt < weekEnd &&
      t.createdBy !== ctx.userId &&
      t.ownerUserId === ctx.userId;
    const newDelegatedThisWeek =
      t.createdAt >= weekStart &&
      t.createdAt < weekEnd &&
      t.createdBy === ctx.userId &&
      t.ownerUserId !== ctx.userId;

    if (completedThisWeek) tasksCompleted++;
    if (movedThisWeek) tasksActive++;
    if (dueThisWeek) tasksDueThisWeek++;
    if (newReceivedThisWeek) tasksAssignedFromOthers++;
    if (newDelegatedThisWeek) tasksDelegatedToOthers++;
  }

  return {
    weekStart,
    weekEnd,
    entries,
    moodDistribution,
    topTags,
    publicCount: entries.filter((e) => e.isPublic).length,
    privateCount: entries.filter((e) => !e.isPublic).length,
    tasksCompleted,
    tasksActive,
    tasksDueThisWeek,
    tasksAssignedFromOthers,
    tasksDelegatedToOthers,
  };
}

// ── プロンプト構築 ──────────────────────────────────────────────
const MOOD_EMOJI: Record<MoodLevel, string> = {
  very_positive: '😊',
  positive: '🙂',
  neutral: '😐',
  negative: '😥',
  very_negative: '😣',
};

function buildPrompt(data: AggregatedData): string {
  const weekEndDisplay = new Date(data.weekStart);
  weekEndDisplay.setDate(weekEndDisplay.getDate() + 6);
  const period = `${formatJa(data.weekStart)}(月) 〜 ${formatJa(weekEndDisplay)}(日)`;

  const moodLine = MOOD_KEYS.map(
    (k) => `${MOOD_EMOJI[k]}${data.moodDistribution[k]}`,
  ).join(' / ');

  const tagsLine =
    data.topTags.length > 0
      ? data.topTags.map((t) => `${t.name} (${t.count})`).join(', ')
      : '(なし)';

  const entryList =
    data.entries.length > 0
      ? data.entries.map((e) => `- ${e.contentMasked}`).join('\n')
      : '(投稿なし)';

  return `あなたは、教員の親しい友達として、その週の記録を見て客観的にねぎらうアシスタントです。

【口調・距離感】
- 友達視点。上から目線でも、べたべた寄り添うでもない
- ストレート、客観的、ドライ、ちょっと突き放し気味でも OK
- 同情過剰にならない / 解釈しない / 心理を勝手に推察しない
- 短く、簡潔

【先週の記録】
- 期間: ${period}

【投稿 (マスク済み)】
${entryList}

【集計】
- 投稿数: ${data.entries.length} 件 / 公開 ${data.publicCount} / 非公開 ${data.privateCount}
- mood 分布: ${moodLine}
- 主なタグ: ${tagsLine}
- タスク完了: ${data.tasksCompleted} / 動きあり: ${data.tasksActive} / 期限到来: ${data.tasksDueThisWeek} / 依頼を受けた: ${data.tasksAssignedFromOthers} / 他人へ依頼: ${data.tasksDelegatedToOthers}

---

【あなたの役割】
- 上記の数字 (投稿数 / mood / タスク件数) は別の場所 (UI のデータ表) で表示済み。あなたは数字を文章で繰り返さない
- 投稿の中身を読んで、友達視点で短くコメントしてから、ねぎらう

【出力構造 (厳守)】
- **第 1 段落**: 投稿から読み取った傾向を友達視点でひとこと (客観的・ドライ、寄り添いすぎず)
  例: 「依頼を断れない場面も多くて、タスクが結構溜まってたみたい。」
  例: 「対人対応に追われた感じだね。準備が後ろ倒しになってた。」
- **空行**
- **第 2 段落 (1 行で OK)**: 短くストレートな労い。突き放しや一般化は禁止
  締めはバリエーションを持つこと:
  例: 「相当抱えてた一週間。お疲れさまでした。」
  例: 「結構しんどかったみたい。お疲れ様。」
  例: 「お疲れさま。今週はぼちぼちいこう。」
  例: 「今週もやっていこう。」
  例: 「無理ない範囲で。今週もいい一週間に。」
  例: 「ひと息ついて、また今週も。」
  例: 「お疲れさまでした。」 ← 単独でも OK
  ✗「お疲れ。」 ← 短すぎ・ぶっきらぼう、温度が低い
  ✗「まあ、そういう週もあるでしょ」「~んじゃない」← 一般化して突き放す

【出力ルール (絶対)】
1. **見出し・タイトル・前置き (例:「先週のvitanotaレポート」「振り返り」「今週は」) を一切書かない。本文のみ**
2. 個人を評価しない (✗「あなたは頑張りました」)
3. 原文を引用しない、言葉を真似ない
4. マスク後の語 (「生徒」「同僚」「ある人」「クラス」「学校」) も文中に出さない
5. 数字や統計を文章に持ち込まない (✗「8 件投稿しました」)
6. 断定を避ける (✗「忙しい一週間でした」 → ○「歩いてきた一週間だったようです」)
7. **アドバイス・指示・命令をしない (✗「~してください」「~いってください」「過ごしていってください」)**
8. **諭し・人生訓・教訓を一切引かない (✗「そういう歩み方もある」「~こそが大事」「完璧さではなく~」「~でも充分です」)**
9. **対比構造で意味付けをしない (✗「~ではなく、~」「~ではなく、そのまま~」)**
10. 「~です」「~と思います」「~なのだと思います」みたいな宣言・主張・解釈を避ける。推測形 (~ようです / ~みたいですね) で留める
11. **寄り添いすぎない / 心理状態を推測しない / 内面を推察しない / 現在地を断定しない**
    - ✗「断りきれない気持ち」「誰かのことが気になる気持ち」「~を抱えていた」「~を感じていた」 ← 投稿に書いてない感情を AI が勝手に補完しない
    - ✗「~流れの中にいる」「~流れのなかにいる」「~状態にある」「~状況にある」 ← 現在地を AI が断定
    - ✗「~んですね」「~ですよね」「~わかります」 ← AI が「私はあなたを分かってる」感を出す共感確認の語尾。**気持ち悪さの最大の源泉**
    - ○「~様子が伝わります」「~があったようです」 ← 外面の観察に留める
    - AI は **解釈する人ではなく、映す鏡**
12. **二重ねぎらい禁止**: 締めの「お疲れさま」は文末 1 回のみ。重ねて讃えない
13. 問題指摘ゼロ、見守る姿勢
14. 一日や瞬間ではなく、先週 1 週間全体にそっと声をかける
15. 励ましじゃなく、認める / 受け止める / そばにいる
16. 投稿が少ない週でも、書かなかったことを問題視しない

【トーン】
- **客観的な事実描写 + 友達視点のドライなねぎらい、それだけ。説教・諭し・教訓・価値判断・寄り添いすぎ・心理推察は禁止**
- 友達感、ストレート、ちょっと突き放し気味でも OK (= 鏡として映すだけ、解釈する人にはならない)
- 推奨語尾: 「~ね」「~だね」「~みたい」「~ようだ」「~よね」
- 推奨締め (バリエーション持って): 「お疲れさま」「お疲れ様」「お疲れさまでした」「今週もやっていこう」「ぼちぼちいこう」「無理ない範囲で」「ひと息ついて、また今週も」「いい一週間に」
- 推奨語彙: 「ひと息」「結構抱えてた」「断れなかった」「片付けてる」「~みたい」「~ようだね」
- 避ける語彙: 「素晴らしい」「凄い」「頑張って」「~するべき」「分析」「成長」「~でいい」「~充分」「~こそが」「~ではなく」「~してください」「~いってください」「過ごしていって」「~気持ち」「~感じていた」「~を抱えていた」(= 内面推察)、「~流れの中にいる」「~なかにいる」「~状態にある」(= 現在地断定)、「~んですね」「~ですよね」「~わかります」(= 共感確認 = 寄り添いすぎ)、「先生に」「歩んできた」「重ねてきた」「されてきた」(= 過剰な丁寧さ・文学的)、「まあ、~でしょ」「そういう週もある」「~もあるでしょ」「~んじゃない」(= 一般化して突き放す = 冷たい)、「お疲れ。」「お疲れ」(単独・短縮形は使わず、必ず「お疲れさま」or「お疲れさまでした」を使う)

【長さ・形式】
- 全体 100〜180 文字
- 2 段落 (コメント / ねぎらい)、段落間は空行
- 見出し / タイトル / 結びの呼びかけ・指示は無し`;
}

// ── ガードレール ────────────────────────────────────────────────
const FALLBACK_TEMPLATE = `今週も、一週間お疲れさまでした。

書いたこと、手を動かしたこと、その全部がここにあります。

少し、ひと息ついてくださいね。`;

function applyGuardrails(output: string): string {
  let result = output.trim();

  // 冒頭にタイトル行 (「先週のvitanotaレポート」「ひとこと」「振り返り」等) が
  // 入り込んだ場合は剥がす。AI が指示を完全に守れない時の保険
  const lines = result.split('\n');
  if (
    lines.length > 0 &&
    /vitanotaレポート|ひとこと|振り返り/.test(lines[0]) &&
    lines[0].length < 30
  ) {
    lines.shift();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
    result = lines.join('\n').trim();
  }

  // 50 文字未満 → fallback (生成失敗とみなす)
  if (result.length < 50) return FALLBACK_TEMPLATE;

  // 「あなた」「君」を「先生」に置換 (人称ガード)
  result = result.replace(/(あなた|君)/g, '先生');

  // 700 文字超 → 自動切り詰め (改行で切る)
  if (result.length > 700) {
    result = result.slice(0, 700);
    const lastNewline = result.lastIndexOf('\n');
    if (lastNewline > 400) result = result.slice(0, lastNewline);
  }

  return result.trim();
}

// ── AI 呼出し (AnthropicProxy Lambda 経由) ─────────────────────
async function callAnthropic(prompt: string): Promise<string> {
  const response = await callAnthropicMessages({
    model: ANTHROPIC_MODEL_HAIKU,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text in Anthropic response');
  }
  return (textBlock as { type: 'text'; text: string }).text;
}

// ── サービス本体 ────────────────────────────────────────────────
export class WeeklySummaryService {
  /**
   * 先週の集計統計を返す (UI 表示用、AI 入力には含めない投稿テキストは除外)
   */
  async getCurrentWeekStats(ctx: ServiceContext): Promise<WeeklySummaryStats> {
    const now = new Date();
    const weekStart = getLastWeekStart(now);
    const weekEnd = getWeekEnd(weekStart);
    const weekStartStr = toDateString(weekStart);
    // 「日曜 (含む)」を表示するため weekEnd の前日
    const weekEndDisplay = new Date(weekEnd);
    weekEndDisplay.setDate(weekEndDisplay.getDate() - 1);
    const weekEndStr = toDateString(weekEndDisplay);

    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        const data = await aggregateWeekData(tx, ctx, weekStart, weekEnd);
        return {
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          entryCount: data.entries.length,
          publicCount: data.publicCount,
          privateCount: data.privateCount,
          moodDistribution: data.moodDistribution,
          topTags: data.topTags,
          tasksCompleted: data.tasksCompleted,
          tasksActive: data.tasksActive,
          tasksDueThisWeek: data.tasksDueThisWeek,
          tasksAssignedFromOthers: data.tasksAssignedFromOthers,
          tasksDelegatedToOthers: data.tasksDelegatedToOthers,
        };
      },
    );
  }

  /**
   * 先週分の summary を取得 or 生成して返す
   * - DB に既存があればそのまま返す (1 ユーザー × 1 週 = 1 件 を PK で保証)
   * - なければ集計 + AI 呼出し + DB 保存して返す
   */
  async getOrGenerate(ctx: ServiceContext): Promise<WeeklySummaryResult> {
    const now = new Date();
    const weekStart = getLastWeekStart(now); // 「先週」を集計対象とする
    const weekStartStr = toDateString(weekStart);

    return withTenantUser(
      ctx.tenantId,
      ctx.userId,
      pickDbRole(ctx),
      async (tx) => {
        // 既存があれば短絡
        const [existing] = await tx
          .select()
          .from(journalWeeklySummaries)
          .where(
            and(
              eq(journalWeeklySummaries.userId, ctx.userId),
              eq(journalWeeklySummaries.weekStart, weekStartStr),
            ),
          )
          .limit(1);

        if (existing) {
          return {
            summary: existing.summary,
            weekStart: existing.weekStart,
            generatedAt: existing.generatedAt,
          };
        }

        return generateAndSave(tx, ctx, weekStart, weekStartStr);
      },
    );
  }

}

// 集計 → AI → ガードレール → 保存 の共通処理
// race 対策: 並行リクエストで PK (user_id, week_start) 衝突した時は
// onConflictDoNothing で skip、その後 SELECT で先勝ちレコードを取得して返す
async function generateAndSave(
  tx: DrizzleDb,
  ctx: ServiceContext,
  weekStart: Date,
  weekStartStr: string,
): Promise<WeeklySummaryResult> {
  const weekEnd = getWeekEnd(weekStart);
  const data = await aggregateWeekData(tx, ctx, weekStart, weekEnd);

  let summary: string;
  try {
    const aiOutput = await callAnthropic(buildPrompt(data));
    summary = applyGuardrails(aiOutput);
  } catch (err) {
    // AI 呼出し失敗時は fallback で出す (UX を優先)
    // eslint-disable-next-line no-console
    console.error('weekly-summary: anthropic call failed', err);
    summary = FALLBACK_TEMPLATE;
  }

  const [inserted] = await tx
    .insert(journalWeeklySummaries)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      weekStart: weekStartStr,
      summary,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return {
      summary: inserted.summary,
      weekStart: inserted.weekStart,
      generatedAt: inserted.generatedAt,
    };
  }

  // 並行リクエストが先に INSERT 済み → 既存を取得して返す
  const [existing] = await tx
    .select()
    .from(journalWeeklySummaries)
    .where(
      and(
        eq(journalWeeklySummaries.userId, ctx.userId),
        eq(journalWeeklySummaries.weekStart, weekStartStr),
      ),
    )
    .limit(1);

  return {
    summary: existing.summary,
    weekStart: existing.weekStart,
    generatedAt: existing.generatedAt,
  };
}

export const weeklySummaryService = new WeeklySummaryService();
