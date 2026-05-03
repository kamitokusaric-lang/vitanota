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
export const publicJournalEntries = pgView('public_journal_entries').as((qb) =>
  qb
    .select({
      id: journalEntries.id,
      tenantId: journalEntries.tenantId,
      userId: journalEntries.userId,
      content: journalEntries.content,
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
  },
  (table) => ({
    tenantCreatedIdx: index('feedback_submissions_tenant_created_idx').on(
      table.tenantId,
      table.createdAt,
    ),
    topicIdx: index('feedback_submissions_topic_idx').on(table.topicId),
  }),
);

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
export type TaskTag = typeof taskTags.$inferSelect;
export type NewTaskTag = typeof taskTags.$inferInsert;
export type TaskTagAssignment = typeof taskTagAssignments.$inferSelect;
export type NewTaskTagAssignment = typeof taskTagAssignments.$inferInsert;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type NewTaskAssignee = typeof taskAssignees.$inferInsert;
