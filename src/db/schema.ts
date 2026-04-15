import {
  pgTable,
  pgView,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
  unique,
  foreignKey,
  index,
  inet,
} from 'drizzle-orm/pg-core';
import { sql, eq } from 'drizzle-orm';

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

// ── tags ───────────────────────────────────────────────────────
// 感情タグ・業務タグを is_emotion フラグで統合
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 50 }).notNull(),
    isEmotion: boolean('is_emotion').notNull().default(false),
    isSystemDefault: boolean('is_system_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // SP-U02-04 Layer 8: 複合 FK の参照先として必要な UNIQUE 制約
    idTenantUnique: unique('tags_id_tenant_unique').on(table.id, table.tenantId),
    // テナント内でタグ名は一意（case-insensitive は migration で対応）
    tenantNameUnique: unique('tags_tenant_name_unique').on(table.tenantId, table.name),
    tenantEmotionIdx: index('tags_tenant_emotion_idx').on(
      table.tenantId,
      table.isEmotion
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
      foreignColumns: [tags.id, tags.tenantId],
      name: 'journal_entry_tags_tag_fk',
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

// ── 型エクスポート ─────────────────────────────────────────────
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type JournalEntryTag = typeof journalEntryTags.$inferSelect;
export type Session = typeof sessions.$inferSelect;
