'use client';

import { LoadingIndicator } from '@clycites/ui';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuth } from './auth-provider';

export function ProtectedPage({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, router, user]);
  if (loading || !user)
    return (
      <div className="mx-auto max-w-6xl px-5 py-16">
        <LoadingIndicator label="Checking your session" />
      </div>
    );
  return children;
}
