import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, setAccessToken, type User } from '../../lib/api';

/* eslint-disable react-refresh/only-export-components -- provider and hook form one authentication boundary */

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  login(email: string, password: string): Promise<User>;
  updateProfile(displayName: string, businessName?: string): Promise<User>;
  logout(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { void apiRequest<{ accessToken: string; user: User }>('/auth/refresh', { method: 'POST' }).then((result) => { setAccessToken(result.accessToken); setUser(result.user); }).catch(() => { setAccessToken(null); }).finally(() => setReady(true)); }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user, ready,
    async login(email, password) {
      const result = await apiRequest<{ accessToken: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setAccessToken(result.accessToken); setUser(result.user); return result.user;
    },
    async updateProfile(displayName, businessName) {
      const result = await apiRequest<{ user: User }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ displayName, businessName }) });
      setUser(result.user); return result.user;
    },
    logout() { void apiRequest('/auth/logout', { method: 'POST' }).finally(() => { setAccessToken(null); setUser(null); }); },
  }), [ready, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
