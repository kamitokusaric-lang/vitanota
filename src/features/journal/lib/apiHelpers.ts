// Unit-02 API Route 共通ヘルパー
// 認証・テナント検証・エラーマッピングをまとめる
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';
import { logger } from '@/shared/lib/logger';
import {
  JournalNotFoundError,
  TagNotFoundError,
  InvalidTagReferenceError,
  ForbiddenError,
  SystemTagDeleteError,
} from './errors';

export interface AuthContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

// RLS の app.role に設定するロールを ctx.roles から選択する
// school_admin > teacher の優先順（より広い権限を持つロールを優先）
export function pickDbRole(ctx: AuthContext): string {
  if (ctx.roles.includes('school_admin')) return 'school_admin';
  if (ctx.roles.includes('teacher')) return 'teacher';
  return ctx.roles[0] ?? 'teacher';
}

/**
 * セッションから認証コンテキストを取得する
 * - セッションなし → 401
 * - tenantId なし（system_admin 等） → 403
 * - tenantStatus が suspended → 423 Locked
 */
export async function requireAuth(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthContext | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'ログインが必要です' });
    return null;
  }

  if (!session.user.tenantId) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'テナントコンテキストがありません' });
    return null;
  }

  if (session.user.tenantStatus === 'suspended') {
    res.status(423).json({ error: 'TENANT_LOCKED', message: 'このテナントは停止されています' });
    return null;
  }

  return {
    userId: session.user.userId,
    tenantId: session.user.tenantId,
    roles: session.user.roles ?? [],
  };
}

/**
 * ドメインエラーを HTTP ステータスコードにマッピングする
 * - JournalNotFoundError / TagNotFoundError → 404
 * - InvalidTagReferenceError → 400
 * - ForbiddenError / SystemTagDeleteError → 403
 * - その他 → 500（詳細は露出しない）
 */
export function mapErrorToResponse(
  err: unknown,
  res: NextApiResponse,
  context: string
): void {
  if (err instanceof JournalNotFoundError || err instanceof TagNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof InvalidTagReferenceError) {
    res.status(400).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof ForbiddenError || err instanceof SystemTagDeleteError) {
    res.status(403).json({ error: err.code, message: err.message });
    return;
  }
  logger.error({ event: `${context}.error`, err }, 'Unhandled error in API route');
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: '処理中にエラーが発生しました',
  });
}
