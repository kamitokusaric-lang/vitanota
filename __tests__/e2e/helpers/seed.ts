// Step 16b: E2E テスト用シードヘルパー
// /api/test/_seed を呼んでテストデータを準備する
import type { APIRequestContext } from '@playwright/test';

export interface SeedTenant {
  id: string;
  name: string;
  slug: string;
}

export interface SeedUser {
  id: string;
  email: string;
  name: string;
}

export interface SeedEntry {
  id: string;
  tenantId: string;
  userId: string;
  content: string;
  isPublic: boolean;
}

export interface SeedTag {
  id: string;
  tenantId: string;
  name: string;
  isEmotion: boolean;
}

export class SeedClient {
  constructor(private request: APIRequestContext) {}

  async reset(): Promise<void> {
    const res = await this.request.post('/api/test/_seed', {
      data: { action: 'reset' },
    });
    if (!res.ok()) throw new Error(`reset failed: ${res.status()}`);
  }

  async createTenant(name = 'テスト学校'): Promise<SeedTenant> {
    const slug = `test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const res = await this.request.post('/api/test/_seed', {
      data: { action: 'tenant', name, slug },
    });
    if (!res.ok()) throw new Error(`createTenant failed: ${res.status()}`);
    const body = (await res.json()) as { tenant: SeedTenant };
    return body.tenant;
  }

  async createUser(
    tenantId: string,
    role: 'teacher' | 'school_admin' | 'system_admin' = 'teacher',
    overrides: { email?: string; name?: string } = {}
  ): Promise<SeedUser> {
    const email = overrides.email ?? `user-${Date.now()}-${Math.floor(Math.random() * 1000)}@test.example.com`;
    const name = overrides.name ?? 'テスト 教員';
    const res = await this.request.post('/api/test/_seed', {
      data: { action: 'user', tenantId, role, email, name },
    });
    if (!res.ok()) throw new Error(`createUser failed: ${res.status()}`);
    const body = (await res.json()) as { user: SeedUser };
    return body.user;
  }

  async createEntry(params: {
    tenantId: string;
    userId: string;
    content: string;
    isPublic: boolean;
  }): Promise<SeedEntry> {
    const res = await this.request.post('/api/test/_seed', {
      data: { action: 'entry', ...params },
    });
    if (!res.ok()) throw new Error(`createEntry failed: ${res.status()}`);
    const body = (await res.json()) as { entry: SeedEntry };
    return body.entry;
  }

  async createTag(params: {
    tenantId: string;
    userId: string;
    name: string;
    isEmotion?: boolean;
  }): Promise<SeedTag> {
    const res = await this.request.post('/api/test/_seed', {
      data: {
        action: 'tag',
        ...params,
        isEmotion: params.isEmotion ?? false,
      },
    });
    if (!res.ok()) throw new Error(`createTag failed: ${res.status()}`);
    const body = (await res.json()) as { tag: SeedTag };
    return body.tag;
  }

  async createSession(
    userId: string,
    tenantId?: string | null,
    expiresInSec = 28800
  ): Promise<{ sessionToken: string; expires: string }> {
    const res = await this.request.post('/api/test/_seed', {
      data: {
        action: 'createSession',
        userId,
        tenantId: tenantId ?? null,
        expiresInSec,
      },
    });
    if (!res.ok()) throw new Error(`createSession failed: ${res.status()}`);
    return (await res.json()) as { sessionToken: string; expires: string };
  }
}
