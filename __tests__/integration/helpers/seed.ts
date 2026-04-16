// Step 16a: 統合テスト用シードデータヘルパー
import { sql } from 'drizzle-orm';
import {
  tenants,
  users,
  userTenantRoles,
  journalEntries,
  tags,
  journalEntryTags,
} from '@/db/schema';
import type { TestDb } from './testDb';
import { rawQueryAsSuperuser } from './testDb';

export interface SeededTenant {
  id: string;
  name: string;
  slug: string;
}

export interface SeededUser {
  id: string;
  email: string;
  name: string;
}

export interface SeededEntry {
  id: string;
  tenantId: string;
  userId: string;
  content: string;
  isPublic: boolean;
}

export interface SeededTag {
  id: string;
  tenantId: string;
  name: string;
  isEmotion: boolean;
}

let counter = 0;

function nextId(prefix: string): string {
  counter++;
  return `${prefix}-${counter.toString().padStart(4, '0')}`;
}

export async function seedTenant(
  db: TestDb,
  name = `テスト学校`
): Promise<SeededTenant> {
  const slug = `test-${counter + 1}-${Date.now()}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true)`);
    const [t] = await tx
      .insert(tenants)
      .values({ name, slug, status: 'active' })
      .returning();
    return { id: t.id, name: t.name, slug: t.slug };
  });
}

export async function seedUser(
  db: TestDb,
  tenantId: string,
  role: 'teacher' | 'school_admin' | 'system_admin' = 'teacher',
  emailOverride?: string
): Promise<SeededUser> {
  counter++;
  const email = emailOverride ?? `teacher-${counter}-${Date.now()}@test.example.com`;
  const name = `教員 ${counter}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.role', 'system_admin', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '00000000-0000-0000-0000-000000000000', true)`);
    const [u] = await tx
      .insert(users)
      .values({ email, name })
      .returning();
    await tx.insert(userTenantRoles).values({
      userId: u.id,
      tenantId,
      role,
    });
    return { id: u.id, email: u.email, name: u.name ?? '' };
  });
}

export async function seedEntry(
  db: TestDb,
  params: {
    tenantId: string;
    userId: string;
    content?: string;
    isPublic: boolean;
  }
): Promise<SeededEntry> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${params.userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', 'teacher', true)`);
    const [e] = await tx
      .insert(journalEntries)
      .values({
        tenantId: params.tenantId,
        userId: params.userId,
        content: params.content ?? `エントリ本文 ${nextId('content')}`,
        isPublic: params.isPublic,
      })
      .returning();
    return {
      id: e.id,
      tenantId: e.tenantId,
      userId: e.userId ?? '',
      content: e.content,
      isPublic: e.isPublic,
    };
  });
}

export async function seedTag(
  db: TestDb,
  params: {
    tenantId: string;
    userId: string;
    name?: string;
    isEmotion?: boolean;
  }
): Promise<SeededTag> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${params.userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', 'teacher', true)`);
    const [t] = await tx
      .insert(tags)
      .values({
        tenantId: params.tenantId,
        name: params.name ?? nextId('tag'),
        isEmotion: params.isEmotion ?? false,
        isSystemDefault: false,
        sortOrder: 0,
        createdBy: params.userId,
      })
      .returning();
    return {
      id: t.id,
      tenantId: t.tenantId,
      name: t.name,
      isEmotion: t.isEmotion,
    };
  });
}

export async function attachTag(
  db: TestDb,
  params: { tenantId: string; userId: string; entryId: string; tagId: string }
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${params.tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${params.userId}, true)`);
    await tx.execute(sql`SELECT set_config('app.role', 'teacher', true)`);
    await tx.insert(journalEntryTags).values({
      tenantId: params.tenantId,
      entryId: params.entryId,
      tagId: params.tagId,
    });
  });
}
