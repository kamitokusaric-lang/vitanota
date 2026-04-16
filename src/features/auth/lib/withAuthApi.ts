import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { requireAuth, type AuthContext } from '@/features/journal/lib/apiHelpers';
import type { Role } from '@/shared/types/auth';

interface WithAuthApiOptions {
  requireRole?: Role;
}

export function withAuthApi(
  handler: (req: NextApiRequest, res: NextApiResponse, ctx: AuthContext) => Promise<void>,
  options?: WithAuthApiOptions
): NextApiHandler {
  return async (req, res) => {
    const ctx = await requireAuth(req, res);
    if (!ctx) return;

    if (options?.requireRole && !ctx.roles.includes(options.requireRole)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: '権限がありません' });
    }

    return handler(req, res, ctx);
  };
}
