'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { CurrentUser, LoginRequest, LoginResponse } from '@clycites/contracts';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  confirmMfaEnrollment as apiConfirmMfaEnrollment,
  isMfaChallenge,
  login as apiLogin,
  logout as apiLogout,
  restoreSession,
  apiRequest,
  setAccessToken,
  verifyMfa as apiVerifyMfa,
  type MfaChallenge,
} from '@/lib/api-client';
import { clearAllCollectionData, lockOrganizationData } from '@/lib/collection-db';

interface AuthContextValue {
  user: CurrentUser | undefined;
  loading: boolean;
  activeOrganizationId: string | undefined;
  /** Resolves with the MFA challenge when a second step is required, otherwise signs in. */
  signIn: (input: LoginRequest) => Promise<MfaChallenge | undefined>;
  verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  confirmMfaEnrollment: (challengeToken: string, code: string) => Promise<string[]>;
  signOut: () => Promise<void>;
  signOutAll: () => Promise<void>;
  selectOrganization: (organizationId: string) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const startSession = (session: LoginResponse) => {
    setUser(session.user);
    setActiveOrganizationId(session.user.organizations[0]?.organizationId);
    router.replace('/dashboard');
  };

  const signIn = async (input: LoginRequest) => {
    const result = await apiLogin(input);
    if (isMfaChallenge(result)) return result;
    startSession(result);
    return undefined;
  };

  const verifyMfa = async (challengeToken: string, code: string) => {
    startSession(await apiVerifyMfa(challengeToken, code));
  };

  const confirmMfaEnrollment = async (challengeToken: string, code: string) =>
    (await apiConfirmMfaEnrollment(challengeToken, code)).recoveryCodes;

  const signOut = async () => {
    await apiLogout();
    await clearAllCollectionData();
    queryClient.clear();
    setUser(undefined);
    setActiveOrganizationId(undefined);
    router.replace('/login');
  };

  const signOutAll = async () => {
    await apiRequest('/auth/logout-all', { method: 'POST' });
    setAccessToken(undefined);
    await clearAllCollectionData();
    queryClient.clear();
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
      value={{
        user,
        loading,
        activeOrganizationId,
        signIn,
        verifyMfa,
        confirmMfaEnrollment,
        signOut,
        signOutAll,
        selectOrganization,
      }}
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
