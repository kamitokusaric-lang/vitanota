import {
  pgTable,
  pgView,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  integer,
  boolean,
  primaryKey,
  unique,
  foreignKey,
  index,
  inet,
  jsonb,
} from 'drizzle-orm/pg-core';
import { sql, eq } from 'drizzle-orm';

// ── enums ────────────────────────────────────────────────────
// tagTypeEnum ('emotion' | 'context') は 0016 で廃止。tags は emotion 専用に整理された。
export const emotionCategoryEnum = pgEnum('emotion_category', ['positive', 'negative', 'neutral']);

// 投稿ムード (絵文字ベース、必須)
export const moodLevelEnum = pgEnum('mood_level', [
  'very_positive',
  'positive',
  'neutral',
  'negative',
  'very_negative',
]);

// 投稿種別。
//   diary/knowledge/tweet : 日々ノート / ナレッジノート / つぶやき
//   keep/concern/thanks/help : 職員室ボード (H7-B staffroom / migration 0050)。
//     続けたい / 気になる / ありがとう / たすけて。is_public は他 kind と同じく本人選択。
export const journalEntryKindEnum = pgEnum('journal_entry_kind', [
  'diary',
  'knowledge',
  'tweet',
  'keep',
  'concern',
  'thanks',
  'help',
]);

// Unit-05: タスク管理
// 5 段階 (backlog / todo / in_progress / review / done) — UI 表示は
// それぞれ「未着手 / 今週やる / 進行中 / 確認・調整中 / 完了」
export const taskStatusEnum = pgEnum('task_status', [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done',
]);

// AI 整理機能 (Phase 1 コア体験) のセッション種別
// quick_capture: 雑に書いて整理する / morning_plan: 今日をはじめる / daily_wrap: 今日をしまう
export const aiSessionTypeEnum = pgEnum('ai_session_type', [
  'quick_capture',
  'morning_plan',
  'daily_wrap',
]);

// AI セッションの状態
// draft: 候補生成済・未確定 / confirmed: 教員が採用 / discarded: 教員が破棄
export const aiSessionStatusEnum = pgEnum('ai_session_status', [
  'draft',
  'confirmed',
  'discarded',
]);

// カレンダー機能 (Unit-06) のクライアント発火イベント種別 (migration 0047)
export const calendarEventTypeEnum = pgEnum('calendar_event_type', [
  'view_switched',
  'task_moved',
  'task_pushed_to_next_week',
  'task_created_from_plus',
  'day_detail_opened',
]);

// H9 検証 (2026-05-27): 投稿カードの reaction 種別 (migration 0046)
//   knowledge    : 参考になった (旧「ナレッジリアクション」, 既存データはこれ)
//   appreciation : お疲れ様です
//   endorsement  : すてきです
export const journalReactionTypeEnum = pgEnum('journal_reaction_type', [
  'knowledge',
  'appreciation',
  'endorsement',
]);

// ── H7 朝のバトンリレー (baton-relay) の enum ────────────────────
// 生徒の在籍状態。active=在学中, archived=在籍終了。
// 猶予 1 年後の終端処理 (匿名化/purge) は後続スライス。
export const studentStatusEnum = pgEnum('student_status', ['active', 'archived']);

// 生徒への「印」リアクション。positive=ポジティブ / concern=気になる。
// 数値化・スコア化・ランキングはしない (PHILOSOPHY 踏み絵ガード 2)。
export const studentReactionTypeEnum = pgEnum('student_reaction_type', [
  'positive',
  'concern',
]);

// ── tenants ────────────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 50 }).notNull().unique(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── users ──────────────────────────────────────────────────────
// 論点 M: deletedAt によるソフトデリート（30日 grace period → バッチで物理削除）
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 100 }),
  image: text('image'),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // 論点 M: 退会済みフラグ（NULL = アクティブ・タイムスタンプ = soft deleted）
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ── user_tenant_roles ──────────────────────────────────────────
export const userTenantRoles = pgTable(
  'user_tenant_roles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userTenantRoleUnique: unique().on(table.userId, table.tenantId, table.role),
  })
);

// ── user_tenant_profiles ──────────────────────────────────────
// tenant 別のユーザープロフィール。nickname は tenant 内 unique。
// 将来的に自己紹介・アバター等もこのテーブルで持つ想定。
export const userTenantProfiles = pgTable(
  'user_tenant_profiles',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nickname: varchar('nickname', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userTenantUnique: unique('user_tenant_profiles_user_tenant_unique').on(
      table.userId,
      table.tenantId,
    ),
    tenantNicknameUnique: unique('user_tenant_profiles_tenant_nickname_unique').on(
      table.tenantId,
      table.nickname,
    ),
    tenantIdx: index('user_tenant_profiles_tenant_idx').on(table.tenantId),
    userIdx: index('user_tenant_profiles_user_idx').on(table.userId),
  })
);

// ── invitation_tokens ──────────────────────────────────────────
export const invitationTokens = pgTable('invitation_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  token: varchar('token', { length: 64 }).notNull().unique(),
  invitedBy: uuid('invited_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── accounts（Auth.js 標準） ────────────────────────────────────
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    refreshToken: text('refresh_token'),
    accessToken: text('access_token'),
    expiresAt: integer('expires_at'),
    tokenType: varchar('token_type', { length: 50 }),
    scope: text('scope'),
    idToken: text('id_token'),
  },
  (table) => ({
    providerUnique: unique().on(table.provider, table.providerAccountId),
  })
);

// ── sessions（Auth.js database 戦略・SP-07 論点C対応） ─────────
// JWT ではなく DB セッション管理により即時失効を実現
export const sessions = pgTable(
  'sessions',
  {
    sessionToken: varchar('session_token', { length: 255 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // tenantId は userTenantRoles から解決するため、セッションには active tenant を記録
    activeTenantId: uuid('active_tenant_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
    tenantIdIdx: index('sessions_tenant_id_idx').on(table.activeTenantId),
    expiresIdx: index('sessions_expires_idx').on(table.expires),
  })
);

// ── verification_tokens（Auth.js 標準） ─────────────────────────
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: varchar('identifier', { length: 255 }).notNull(),
    token: varchar('token', { length: 255 }).notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  })
);

// ─────────────────────────────────────────────────────────────
// Unit-02: 日誌・感情記録コア
// ─────────────────────────────────────────────────────────────

// ── journal_entries ────────────────────────────────────────────
// RLS: 2ポリシー（public_read + owner_all）
// 複合 UNIQUE: (id, tenant_id) は SP-U02-04 Layer 8 複合 FK の参照先
// 論点 M: user_id は nullable（退会・転勤時の匿名化のため SET NULL）
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // 論点 M: 退会・転勤時に SET NULL で匿名化（Q1-B / Q2-A 決定）
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    isPublic: boolean('is_public').notNull().default(true),
    // 新規投稿では必須 (API 側で要求)、既存データは NULL のまま (migration 0021)
    mood: moodLevelEnum('mood'),
    // 投稿種別 (migration 0030)。既存データは default 'diary'。
    // mood は kind='diary' のみ NOT NULL、emotion_tags は kind='tweet' のみ付与可
    // (制約は API/Zod レベルで担保、DB CHECK は付けない)。
    kind: journalEntryKindEnum('kind').notNull().default('diary'),
    // ── H7-B 職員室ボードの A→B seam 受け口 (board kind のときのみ・migration 0051) ──
    // 複合 FK ((student_id|class_id, tenant_id) → students|classes) は migration で定義。
    // drizzle 側は列宣言のみ (journal_entries は students/classes より前方に宣言されるため、
    // テーブル定義 callback から後方の const を参照すると初期化順序エラーになる)。
    studentId: uuid('student_id'),
    classId: uuid('class_id'),
    // マスキング済み本文 (AI 入力用、新規投稿は API 側で生成、既存データは backfill で埋める)
    contentMasked: text('content_masked'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // SP-U02-04 Layer 8: 複合 FK の参照先として必要な UNIQUE 制約
    idTenantUnique: unique('journal_entries_id_tenant_unique').on(
      table.id,
      table.tenantId
    ),
    tenantCreatedIdx: index('journal_entries_tenant_created_idx').on(
      table.tenantId,
      table.createdAt
    ),
    userCreatedIdx: index('journal_entries_user_created_idx').on(
      table.userId,
      table.createdAt
    ),
  })
);

// ── emotion_tags ───────────────────────────────────────────────
// 0016 で tags → emotion_tags にリネーム。感情タグ専用 (category NOT NULL)。
// context タグは task_categories (Unit-05) に役割移譲。
export const emotionTags = pgTable(
  'emotion_tags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    category: emotionCategoryEnum('category').notNull(),
    isSystemDefault: boolean('is_system_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // SP-U02-04 Layer 8: 複合 FK の参照先として必要な UNIQUE 制約
    idTenantUnique: unique('emotion_tags_id_tenant_unique').on(table.id, table.tenantId),
    // テナント内でタグ名は一意（case-insensitive は migration で対応）
    tenantNameUnique: unique('emotion_tags_tenant_name_unique').on(table.tenantId, table.name),
    tenantCategoryIdx: index('emotion_tags_tenant_category_idx').on(
      table.tenantId,
      table.category
    ),
  })
);

// ── journal_entry_tags（中間テーブル・SP-U02-04 Layer 8 複合 FK） ─
// tenant_id を冗長に持ち、複合 FK でクロステナント参照を物理防止
export const journalEntryTags = pgTable(
  'journal_entry_tags',
  {
    tenantId: uuid('tenant_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    tagId: uuid('tag_id').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.entryId, table.tagId] }),
    // 複合 FK: クロステナント参照の物理防止
    entryFk: foreignKey({
      columns: [table.entryId, table.tenantId],
      foreignColumns: [journalEntries.id, journalEntries.tenantId],
      name: 'journal_entry_tags_entry_fk',
    }).onDelete('cascade'),
    tagFk: foreignKey({
      columns: [table.tagId, table.tenantId],
      foreignColumns: [emotionTags.id, emotionTags.tenantId],
      name: 'journal_entry_emotion_tag_fk',
    }).onDelete('cascade'),
    tenantIdx: index('journal_entry_tags_tenant_idx').on(table.tenantId),
    tagIdx: index('journal_entry_tags_tag_idx').on(table.tagId),
  })
);

// ── public_journal_entries VIEW（SP-U02-04 Layer 4） ───────────
// is_public=true エントリのみ露出、is_public 列は意図的に含めない
// security_barrier で悪意あるサブクエリ経由の情報漏えいを防止
// migration 0027 で mood 列を追加、0032 で kind 列を追加 (種別バッジ用)
export const publicJournalEntries = pgView('public_journal_entries').as((qb) =>
  qb
    .select({
      id: journalEntries.id,
      tenantId: journalEntries.tenantId,
      userId: journalEntries.userId,
      content: journalEntries.content,
      mood: journalEntries.mood,
      kind: journalEntries.kind,
      createdAt: journalEntries.createdAt,
      updatedAt: journalEntries.updatedAt,
    })
    .from(journalEntries)
    .where(eq(journalEntries.isPublic, true))
);

// alerts テーブル (旧 Unit-04 管理者アラート) は Phase 2 で哲学的観点から全面廃止。
// migration 0018 で DROP 済み。稼働負荷の兆しは task ベースで可視化する方向に統合。

// ─────────────────────────────────────────────────────────────
// Unit-05: タスク管理 (稼働負荷の素材)
// ─────────────────────────────────────────────────────────────

// ── task_categories ────────────────────────────────────────────
// 業務分類マスタ。is_system_default で恒常 (クラス業務・教科業務・イベント業務・事務業務) を識別。
// tenant 固有の時限カテゴリ (文化祭 2026 等) も school_admin が追加可能。
export const taskCategories = pgTable(
  'task_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    isSystemDefault: boolean('is_system_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idTenantUnique: unique('task_categories_id_tenant_unique').on(table.id, table.tenantId),
    tenantNameUnique: unique('task_categories_tenant_name_unique').on(table.tenantId, table.name),
    tenantIdx: index('task_categories_tenant_idx').on(table.tenantId),
  })
);

// ── tasks ──────────────────────────────────────────────────────
// 担当者は task_assignees (M:N) に一本化、created_by = 作成者
// teacher: 自分が assignee に含まれる or createdBy=self のタスクを UPDATE / DELETE 可 (RLS)
// school_admin: テナント内全タスク無条件
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    dueDate: date('due_date', { mode: 'date' }), // PostgreSQL DATE 型
    status: taskStatusEnum('status').notNull().default('todo'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // AI チャット (ai_sessions) 経由で作成されたタスクの source 文脈 (任意)
    sourceChatSnippet: text('source_chat_snippet'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idTenantUnique: unique('tasks_id_tenant_unique').on(table.id, table.tenantId),
    // SP-U02-04 Layer 8: category への複合 FK でクロステナント参照を物理防止
    categoryFk: foreignKey({
      columns: [table.categoryId, table.tenantId],
      foreignColumns: [taskCategories.id, taskCategories.tenantId],
      name: 'tasks_category_fk',
    }).onDelete('restrict'),
    tenantIdx: index('tasks_tenant_idx').on(table.tenantId),
    tenantStatusIdx: index('tasks_tenant_status_idx').on(table.tenantId, table.status),
    categoryIdx: index('tasks_category_idx').on(table.categoryId),
  })
);

// ── task_assignees (M:N) ───────────────────────────────────────
// 1 タスクに複数担当者 (共通 status で進捗共有)。複合 FK で tenant 一致を物理保証。
export const taskAssignees = pgTable(
  'task_assignees',
  {
    taskId: uuid('task_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.userId] }),
    taskFk: foreignKey({
      columns: [table.taskId, table.tenantId],
      foreignColumns: [tasks.id, tasks.tenantId],
      name: 'task_assignees_task_fk',
    }).onDelete('cascade'),
    userTenantIdx: index('task_assignees_user_tenant_idx').on(table.userId, table.tenantId),
    taskIdx: index('task_assignees_task_idx').on(table.taskId),
  }),
);

// ── task_comments ───────────────────────────────────────────────
// タスクへの追記・アサインメモ等。スレッドなし、時系列で並ぶ単線構造。
// user_id は退会時 SET NULL で匿名化 (コメント自体は残す)
export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull(),
    taskId: uuid('task_id').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskFk: foreignKey({
      columns: [table.taskId, table.tenantId],
      foreignColumns: [tasks.id, tasks.tenantId],
      name: 'task_comments_task_fk',
    }).onDelete('cascade'),
    taskCreatedIdx: index('task_comments_task_idx').on(table.taskId, table.createdAt),
    tenantIdx: index('task_comments_tenant_idx').on(table.tenantId),
  })
);

// ── journal_weekly_summaries (Unit-06) ─────────────────────────
// 週次レポート (今週のひとこと) AI 出力。本人のみ閲覧可。
// 1 ユーザー × 1 週 = 1 件 (PK で保証)。設計書 § 9。
export const journalWeeklySummaries = pgTable(
  'journal_weekly_summaries',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date('week_start').notNull(), // 月曜日の日付
    summary: text('summary').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.weekStart] }),
    tenantUserWeekIdx: index('journal_weekly_summaries_tenant_user_week_idx').on(
      table.tenantId,
      table.userId,
      table.weekStart,
    ),
  }),
);

// ── task_tags (5/7 説明会向け機能拡張) ─────────────────────────
// イベント横断のタスク集約用タグ。テナント内で UNIQUE。
export const taskTags = pgTable(
  'task_tags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNameUnique: unique('uq_task_tags_tenant_name').on(table.tenantId, table.name),
    tenantIdx: index('task_tags_tenant_idx').on(table.tenantId),
  }),
);

// ── task_tag_assignments (M:N) ─────────────────────────────────
// task_id × tag_id の交差テーブル、tenant_id を denormalize して RLS を効かせる
export const taskTagAssignments = pgTable(
  'task_tag_assignments',
  {
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => taskTags.id, { onDelete: 'restrict' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.tagId] }),
    tenantTagIdx: index('task_tag_assignments_tenant_tag_idx').on(
      table.tenantId,
      table.tagId,
    ),
    tagIdx: index('task_tag_assignments_tag_idx').on(table.tagId),
  }),
);

// ── knowledge_tags (migration 0031) ────────────────────────────
// ナレッジノート用タグ (kind='knowledge' の journal_entries に任意付与)。
// 構造・運用は task_tags と同じ (テナント内全員 CRUD 可)。
export const knowledgeTags = pgTable(
  'knowledge_tags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNameUnique: unique('uq_knowledge_tags_tenant_name').on(
      table.tenantId,
      table.name,
    ),
    tenantIdx: index('knowledge_tags_tenant_idx').on(table.tenantId),
  }),
);

// ── journal_entry_knowledge_tags (M:N 中間) ────────────────────
export const journalEntryKnowledgeTags = pgTable(
  'journal_entry_knowledge_tags',
  {
    journalEntryId: uuid('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    knowledgeTagId: uuid('knowledge_tag_id')
      .notNull()
      .references(() => knowledgeTags.id, { onDelete: 'restrict' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.journalEntryId, table.knowledgeTagId] }),
    tenantTagIdx: index('journal_entry_knowledge_tags_tenant_tag_idx').on(
      table.tenantId,
      table.knowledgeTagId,
    ),
    tagIdx: index('journal_entry_knowledge_tags_tag_idx').on(table.knowledgeTagId),
  }),
);

// ── journal_knowledge_reactions (migration 0033 → 0046 で 3 種化) ───────────────
// 投稿カードの reaction テーブル。1 ユーザー × 1 投稿 × 1 reaction_type で 1 行。
// 自分の投稿への reaction も許可 (2026-05-27: API self-block を撤廃、 セルフ労い動線)。
// テーブル名は歴史的経緯で knowledge_reactions のまま (rename は破壊的なため)、
//   reaction_type 列で複数種別を表現する。
export const journalKnowledgeReactions = pgTable(
  'journal_knowledge_reactions',
  {
    journalEntryId: uuid('journal_entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    reactionType: journalReactionTypeEnum('reaction_type')
      .notNull()
      .default('knowledge'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.journalEntryId, table.userId, table.reactionType],
    }),
    entryIdx: index('journal_knowledge_reactions_entry_idx').on(
      table.journalEntryId,
    ),
    tenantUserIdx: index('journal_knowledge_reactions_tenant_user_idx').on(
      table.tenantId,
      table.userId,
    ),
  }),
);

// ── feedback_topics (機能 B) ───────────────────────────────────
// 運営マスタ (テナント横断)。教員が投稿時に選択するトピック。
export const feedbackTopics = pgTable('feedback_topics', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  title: varchar('title', { length: 100 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── feedback_submissions (機能 B) ──────────────────────────────
// 教員 → 運営の一方向投稿。RLS で SELECT は system_admin のみに制限。
export const feedbackSubmissions = pgTable(
  'feedback_submissions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => feedbackTopics.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // 教員 (submitter) が FAB モーダルで replies を読んだ最終時刻。null = 未読扱い
    lastReadBySubmitterAt: timestamp('last_read_by_submitter_at', { withTimezone: true }),
  },
  (table) => ({
    tenantCreatedIdx: index('feedback_submissions_tenant_created_idx').on(
      table.tenantId,
      table.createdAt,
    ),
    topicIdx: index('feedback_submissions_topic_idx').on(table.topicId),
    idTenantUniq: unique('feedback_submissions_id_tenant_uniq').on(
      table.id,
      table.tenantId,
    ),
  }),
);

// ── feedback_replies (機能 F3) ──────────────────────────────────
// system_admin → 教員の片方向返信。教員は自分の submission に紐づく
// replies を read-only で参照する。RLS 0039 パターン (own row 可)。
// 返信者表記は UI 層で一律「運営より」固定 (replier_user_id は表示しない)。
export const feedbackReplies = pgTable(
  'feedback_replies',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    submissionId: uuid('submission_id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // 親 submission の user_id を非正規化 (RLS で EXISTS を回避するため)
    submitterUserId: uuid('submitter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 退会時 SET NULL で匿名化 (返信本体は残す)
    replierUserId: uuid('replier_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    submissionFk: foreignKey({
      columns: [table.submissionId, table.tenantId],
      foreignColumns: [feedbackSubmissions.id, feedbackSubmissions.tenantId],
      name: 'feedback_replies_submission_fk',
    }).onDelete('cascade'),
    submissionIdx: index('feedback_replies_submission_idx').on(
      table.submissionId,
      table.createdAt,
    ),
    tenantIdx: index('feedback_replies_tenant_idx').on(table.tenantId),
  }),
);

// ── announcements (migration 0035) ─────────────────────────
// 開発者からのお知らせ。system_admin が管理画面から CRUD、全テナント共通。
// body は JSONB で string[] (行ごとの箱条書き)。
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    publishDate: date('publish_date').notNull(),
    title: text('title').notNull(),
    body: jsonb('body').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    publishDateIdx: index('announcements_publish_date_idx').on(
      table.publishDate,
      table.createdAt,
    ),
  }),
);

// ── user_filter_preferences (migration 0034) ─────────────────
// ユーザーごとフィルタ設定保存 (TaskBoard 等のカスタムフィルタを記憶)
// context: 'tasks' / 'journal' (将来) 等で識別
// settings JSONB: context 別の構造、現状 'tasks' のみ:
//   { filterOwner, filterTagIds, filterCategoryIds, showDelegated, period }
export const userFilterPreferences = pgTable(
  'user_filter_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    context: text('context').notNull(),
    settings: jsonb('settings').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.userId, table.tenantId, table.context],
    }),
    userTenantIdx: index('user_filter_preferences_user_tenant_idx').on(
      table.userId,
      table.tenantId,
    ),
  }),
);

// ── user_onboarding_states (migration 0041) ─────────────────
// 初回コーチマーク等の表示状態を user × tenant × context 単位で保存。
// context: 'ai_capture' (将来 'morning_plan' 等で横展開可)
// state JSONB:
//   { dismissedAt: ISO?, completedStep: 1|2|3?, version: 'v1-2026-05-19' }
// RLS: 本人 + system_admin のみ可視、school_admin 不可視 (踏み絵)。
export const userOnboardingStates = pgTable(
  'user_onboarding_states',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    context: text('context').notNull(),
    state: jsonb('state').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.userId, table.tenantId, table.context],
    }),
    userTenantIdx: index('user_onboarding_states_user_tenant_idx').on(
      table.userId,
      table.tenantId,
    ),
  }),
);

// ── ai_sessions (migration 0036) ─────────────────────────────
// AI 整理機能 (Phase 1 コア体験) の中間状態。チャット入力 + AI 出力 +
// 取捨選択を一時保持。教員が確認・採用したものだけ tasks に保存される。
// RLS: 本人 + system_admin のみ可視、school_admin 不可視 (踏み絵)。
export const aiSessions = pgTable(
  'ai_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: aiSessionTypeEnum('type').notNull().default('quick_capture'),
    inputText: text('input_text').notNull(),
    aiOutputJson: jsonb('ai_output_json').notNull().default({}),
    status: aiSessionStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index('ai_sessions_user_idx').on(table.userId, table.createdAt),
    tenantIdx: index('ai_sessions_tenant_idx').on(table.tenantId),
  }),
);

// ── calendar_events (migration 0047) ─────────────────────────
// カレンダー機能 (Unit-06) の教員行動ログ。
// RLS: 本人 + system_admin (school_admin 不可視、 ai_sessions と同水準の踏み絵)。
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: calendarEventTypeEnum('event_type').notNull(),
    version: varchar('version', { length: 32 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index('calendar_events_tenant_created_idx').on(
      table.tenantId,
      table.createdAt,
    ),
    typeCreatedIdx: index('calendar_events_type_created_idx').on(
      table.eventType,
      table.createdAt,
    ),
    userIdx: index('calendar_events_user_idx').on(
      table.userId,
      table.createdAt,
    ),
  }),
);

// ── today_plan_items (migration 0040) ────────────────────────
// H3「朝の見通し作り」(morning_plan) の task 単位レコード。
// 1 ai_sessions (type='morning_plan') × N task_id でリンク、教員の編集 /
// Done 行動を保存する。RLS は本人 + system_admin (school_admin 不可視、踏み絵)。
export const todayPlanItems = pgTable(
  'today_plan_items',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => aiSessions.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    aiBucket: text('ai_bucket'), // 'today' | 'optional' | null (null = 教員の手動追加)
    finalBucket: text('final_bucket'), // null = AI 案維持、 'today' | 'optional' | 'excluded'
    doneAt: timestamp('done_at', { withTimezone: true }),
    movedCount: integer('moved_count').notNull().default(0),
    lastMovedTo: text('last_moved_to'), // 'today' | 'optional' | null
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.taskId] }),
    userSessionIdx: index('today_plan_items_user_session_idx').on(
      table.userId,
      table.sessionId,
    ),
    sessionIdx: index('today_plan_items_session_idx').on(table.sessionId),
  }),
);

// ── api_rate_limits (migration 0038) ─────────────────────────
// 1 日あたりの API 呼び出し回数を user × endpoint × date 単位で UPSERT。
// 主用途: /api/ai-chat/extract の日次上限制御 (Bedrock コスト保護)。
export const apiRateLimits = pgTable(
  'api_rate_limits',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: varchar('endpoint', { length: 80 }).notNull(),
    date: date('date').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.endpoint, table.date] }),
    dateIdx: index('api_rate_limits_date_idx').on(table.date),
  }),
);

// ─────────────────────────────────────────────────────────────
// H7 朝のバトンリレー (baton-relay) — 学校知の循環の入口 (migration 0049)
// 循環の正本: docs/proposal/h7-circulation.md / build spec: docs/baton-relay/design.md
// ─────────────────────────────────────────────────────────────

// ── classes (クラス・クラス目標の最小単位) ─────────────────────
export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    goalText: text('goal_text'),
    schoolYear: text('school_year'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // SP-U02-04 Layer 8: 複合 FK の参照先として必要な UNIQUE 制約
    idTenantUnique: unique('classes_id_tenant_unique').on(table.id, table.tenantId),
    tenantIdx: index('classes_tenant_idx').on(table.tenantId),
  }),
);

// ── students (生徒・最小 PII) ──────────────────────────────────
// users (教員) とは別系統の未成年。最小 PII に留め、恒久 dossier 化しない。
// 保持期間 = 在学期間 + 卒業後 1 年の猶予 (baton-relay §7)。終端バッチは後続スライス。
export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull(),
    displayName: text('display_name').notNull(),
    status: studentStatusEnum('status').notNull().default('active'),
    enrolledAt: date('enrolled_at'),
    leftAt: date('left_at'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idTenantUnique: unique('students_id_tenant_unique').on(table.id, table.tenantId),
    // 複合 FK: クロステナント参照の物理防止
    classFk: foreignKey({
      columns: [table.classId, table.tenantId],
      foreignColumns: [classes.id, classes.tenantId],
      name: 'students_class_fk',
    }).onDelete('cascade'),
    tenantIdx: index('students_tenant_idx').on(table.tenantId),
    classIdx: index('students_class_idx').on(table.classId),
  }),
);

// ── baton_notes (生徒欄の一言・append-only ログ) ───────────────
// 同じ著者が同じ生徒・同じ日に何度でも行追加できる (一意制約を張らない)。
// 「誰が書いた変更か」は author_user_id + 行追加で表現 (引き継ぎ用・採点ではない)。
export const batonNotes = pgTable(
  'baton_notes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull(),
    authorUserId: uuid('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    noteDate: date('note_date').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idTenantUnique: unique('baton_notes_id_tenant_unique').on(table.id, table.tenantId),
    studentFk: foreignKey({
      columns: [table.studentId, table.tenantId],
      foreignColumns: [students.id, students.tenantId],
      name: 'baton_notes_student_fk',
    }).onDelete('cascade'),
    tenantStudentDateIdx: index('baton_notes_tenant_student_date_idx').on(
      table.tenantId,
      table.studentId,
      table.noteDate,
    ),
    studentCreatedIdx: index('baton_notes_student_created_idx').on(
      table.studentId,
      table.createdAt,
    ),
  }),
);

// ── student_reactions (印 = ポジティブ/気になる・journal リアクション同型) ─
// 1 教員 × 1 生徒 × 1 reaction_type で 1 行 (トグル)。複数教員が各自 1 行。
// 数値化・ランキングしない (踏み絵ガード 2/3)。
export const studentReactions = pgTable(
  'student_reactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reactionType: studentReactionTypeEnum('reaction_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    studentFk: foreignKey({
      columns: [table.studentId, table.tenantId],
      foreignColumns: [students.id, students.tenantId],
      name: 'student_reactions_student_fk',
    }).onDelete('cascade'),
    // 1 教員 1 生徒 1 種で 1 行 (トグル整合)
    uniq: unique('student_reactions_uniq').on(
      table.tenantId,
      table.studentId,
      table.userId,
      table.reactionType,
    ),
    tenantStudentIdx: index('student_reactions_tenant_student_idx').on(
      table.tenantId,
      table.studentId,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────
// H7-B 職員室ボード (staffroom) — 学校知の循環の出口 (migration 0051)
// 循環の正本: docs/proposal/h7-circulation.md / build spec: docs/staffroom/design.md
// 板の投稿は journal_entries(kind='board') として持つ (専用テーブルにしない)。
// ─────────────────────────────────────────────────────────────

// ── 型エクスポート ─────────────────────────────────────────────
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type EmotionTag = typeof emotionTags.$inferSelect;
export type NewEmotionTag = typeof emotionTags.$inferInsert;
export type JournalEntryTag = typeof journalEntryTags.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type TaskCategory = typeof taskCategories.$inferSelect;
export type NewTaskCategory = typeof taskCategories.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
export type UserTenantProfile = typeof userTenantProfiles.$inferSelect;
export type NewUserTenantProfile = typeof userTenantProfiles.$inferInsert;
export type JournalWeeklySummary = typeof journalWeeklySummaries.$inferSelect;
export type NewJournalWeeklySummary = typeof journalWeeklySummaries.$inferInsert;
export type FeedbackTopic = typeof feedbackTopics.$inferSelect;
export type NewFeedbackTopic = typeof feedbackTopics.$inferInsert;
export type FeedbackSubmission = typeof feedbackSubmissions.$inferSelect;
export type NewFeedbackSubmission = typeof feedbackSubmissions.$inferInsert;
export type FeedbackReply = typeof feedbackReplies.$inferSelect;
export type NewFeedbackReply = typeof feedbackReplies.$inferInsert;
export type TaskTag = typeof taskTags.$inferSelect;
export type NewTaskTag = typeof taskTags.$inferInsert;
export type TaskTagAssignment = typeof taskTagAssignments.$inferSelect;
export type NewTaskTagAssignment = typeof taskTagAssignments.$inferInsert;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type NewTaskAssignee = typeof taskAssignees.$inferInsert;
export type UserFilterPreference = typeof userFilterPreferences.$inferSelect;
export type NewUserFilterPreference = typeof userFilterPreferences.$inferInsert;
export type UserOnboardingState = typeof userOnboardingStates.$inferSelect;
export type NewUserOnboardingState = typeof userOnboardingStates.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type AiSession = typeof aiSessions.$inferSelect;
export type NewAiSession = typeof aiSessions.$inferInsert;
export type TodayPlanItem = typeof todayPlanItems.$inferSelect;
export type NewTodayPlanItem = typeof todayPlanItems.$inferInsert;
export type ApiRateLimit = typeof apiRateLimits.$inferSelect;
export type NewApiRateLimit = typeof apiRateLimits.$inferInsert;
export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type BatonNote = typeof batonNotes.$inferSelect;
export type NewBatonNote = typeof batonNotes.$inferInsert;
export type StudentReaction = typeof studentReactions.$inferSelect;
export type NewStudentReaction = typeof studentReactions.$inferInsert;
