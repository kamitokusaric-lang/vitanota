// Dev-only: ワンクリックログインページ
// NODE_ENV=development でのみ表示。本番では 404。
import { useState } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import type { GetServerSideProps } from 'next';

interface DevUser {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string | null;
  role: string;
  tenantName: string | null;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ users: DevUser[] }>;
};

export default function DevLoginPage() {
  const router = useRouter();
  const { data, error } = useSWR('/api/dev/login', fetcher);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);

  const handleLogin = async (userId: string) => {
    setLoggingIn(userId);
    try {
      const res = await fetch('/api/dev/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const body = await res.json() as { redirectTo: string };
        router.push(body.redirectTo);
      }
    } finally {
      setLoggingIn(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-vn-bg">
      <div className="w-full max-w-md rounded-vn border border-vn-border bg-white p-8">
        <h1 className="mb-2 text-2xl font-bold">Dev Login</h1>
        <p className="mb-6 text-sm text-vn-muted">
          開発環境専用ログイン（本番では表示されません）
        </p>

        {error && (
          <p className="mb-4 text-sm text-red-600">
            ユーザー一覧の取得に失敗しました
          </p>
        )}

        {!data && !error && (
          <p className="text-sm text-gray-400">読み込み中...</p>
        )}

        {data && (
          <div className="space-y-3">
            {data.users.map((user) => (
              <button
                key={`${user.userId}-${user.role}`}
                onClick={() => handleLogin(user.userId)}
                disabled={loggingIn !== null}
                className={[
                  'w-full rounded-[12px] border px-[18px] py-[14px] text-left transition-all',
                  loggingIn === user.userId
                    ? 'border-vn-accent bg-vn-gold-bg'
                    : 'border-vn-border hover:border-vn-accent hover:bg-vn-gold-bg',
                  'disabled:opacity-50',
                ].join(' ')}
              >
                <div className="font-medium text-gray-900">
                  {user.name ?? user.email}
                </div>
                <div className="mt-1 flex gap-2 text-xs text-gray-500">
                  <span>{user.email}</span>
                  <span className="rounded-full bg-vn-bg px-2 py-0.5 font-mono text-vn-muted">
                    {user.role}
                  </span>
                  {user.tenantName && (
                    <span className="rounded-full bg-vn-gold-bg px-2 py-0.5 text-vn-gold-text">
                      {user.tenantName}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  if (process.env.NODE_ENV !== 'development') {
    return { notFound: true };
  }
  return { props: {} };
};
