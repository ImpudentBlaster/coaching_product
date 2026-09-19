import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, refreshSession, SessionExpiredError, setAccessToken, type User } from '../../lib/api';

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
  const [restoreError, setRestoreError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setReady(false); setRestoreError('');
    void refreshSession().then(result => { if (active) { setUser(result.user); setReady(true); } }).catch(error => {
      if (!active) return;
      if (error instanceof SessionExpiredError) { setUser(null); setReady(true); }
      else setRestoreError('We couldn’t reconnect to your session. Check your connection and try again.');
    });
    return () => { active = false; };
  }, [attempt]);
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
  return <AuthContext.Provider value={value}>{ready ? children : restoreError ? <section className="card status-page"><p role="alert">{restoreError}</p><button className="primary" onClick={() => setAttempt(value => value + 1)}>Retry connection</button></section> : <p className="helper" role="status">Restoring your session…</p>}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
