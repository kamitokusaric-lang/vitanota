import NextAuth from 'next-auth';
import { getAuthOptions } from '@/features/auth/lib/auth-options';

export default async function auth(req: any, res: any) {
  const authOptions = await getAuthOptions();
  return NextAuth(req, res, authOptions);
}
