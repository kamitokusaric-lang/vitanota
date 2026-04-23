// user_tenant_profiles の CRUD
// nickname 重複は tenant 内で制約、upsert 時に UNIQUE 違反を NicknameConflictError として返す
import { and, eq } from 'drizzle-orm';
import { withTenantUser } from '@/shared/lib/db';
import { pickDbRole, type AuthContext } from '@/features/journal/lib/apiHelpers';
import { userTenantProfiles } from '@/db/schema';

export interface Profile {
  nickname: string | null;
}

export class NicknameConflictError extends Error {
  readonly code = 'NICKNAME_CONFLICT';
  constructor(message = 'このニックネームは既に使われています') {
    super(message);
    this.name = 'NicknameConflictError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  // PostgreSQL の重複エラーは code 23505
  if (typeof err !== 'object' || err === null) return false;
  const maybe = err as { code?: string };
  return maybe.code === '23505';
}

export class ProfileService {
  async getMyProfile(ctx: AuthContext): Promise<Profile> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      const [row] = await tx
        .select({ nickname: userTenantProfiles.nickname })
        .from(userTenantProfiles)
        .where(
          and(
            eq(userTenantProfiles.userId, ctx.userId),
            eq(userTenantProfiles.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      return { nickname: row?.nickname ?? null };
    });
  }

  async updateNickname(
    nickname: string | null,
    ctx: AuthContext,
  ): Promise<Profile> {
    return withTenantUser(ctx.tenantId, ctx.userId, pickDbRole(ctx), async (tx) => {
      try {
        const [row] = await tx
          .insert(userTenantProfiles)
          .values({
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            nickname,
          })
          .onConflictDoUpdate({
            target: [userTenantProfiles.userId, userTenantProfiles.tenantId],
            set: { nickname, updatedAt: new Date() },
          })
          .returning({ nickname: userTenantProfiles.nickname });
        return { nickname: row.nickname };
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new NicknameConflictError();
        }
        throw err;
      }
    });
  }
}

export const profileService = new ProfileService();
