'use client';

import type { CurrentUser, LoginRequest } from '@clycites/contracts';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { login as apiLogin, logout as apiLogout, restoreSession } from '@/lib/api-client';
import { clearAllCollectionData, lockOrganizationData } from '@/lib/collection-db';

interface AuthContextValue {
  user: CurrentUser | undefined;
  loading: boolean;
  activeOrganizationId: string | undefined;
  signIn: (input: LoginRequest) => Promise<void>;
  signOut: () => Promise<void>;
  selectOrganization: (organizationId: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser>();
  const [loading, setLoading] = useState(true);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string>();

  useEffect(() => {
    void restoreSession()
      .then((session) => {
        setUser(session?.user);
        setActiveOrganizationId(session?.user.organizations[0]?.organizationId);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = async (input: LoginRequest) => {
    const result = await apiLogin(input);
    setUser(result.user);
    setActiveOrganizationId(result.user.organizations[0]?.organizationId);
    router.replace('/dashboard');
  };

  const signOut = async () => {
    await apiLogout();
    await clearAllCollectionData();
    setUser(undefined);
    setActiveOrganizationId(undefined);
    router.replace('/login');
  };

  const selectOrganization = (organizationId: string) => {
    if (!user?.organizations.some((organization) => organization.organizationId === organizationId))
      return;
    if (activeOrganizationId && activeOrganizationId !== organizationId)
      void lockOrganizationData(activeOrganizationId);
    setActiveOrganizationId(organizationId);
    router.push(`/organizations/${organizationId}/overview`);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, activeOrganizationId, signIn, signOut, selectOrganization }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
