import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../auth/auth-context';
import type { Onboarding } from './onboarding-types';

export function ClientOnboardingGate() {
  const {user,ready} = useAuth();
  const location = useLocation();
  const [attempt,setAttempt] = useState(0);
  const [result,setResult] = useState<{key:string;needsOnboarding:boolean;error?:string}>();
  const key = `${user?.id ?? ''}:${location.pathname}:${location.search}:${attempt}`;
  useEffect(() => {
    let active = true;
    if (user?.role === 'CLIENT' && user.approvalStatus === 'APPROVED') {
      void apiRequest<{onboarding:Onboarding|null}>('/client/onboarding').then(({onboarding}) => {
        if (active) setResult({key,needsOnboarding:!onboarding || onboarding.status === 'DRAFT'});
      }).catch((error:unknown) => {
        if (active) setResult({key,needsOnboarding:false,error:error instanceof Error?error.message:'Unable to check onboarding.'});
      });
    }
    return () => {active = false;};
  },[key,user]);
  if (!ready) return <p role="status">Loading your account…</p>;
  if (!user) return <Navigate to="/login" replace/>;
  if (user.role !== 'CLIENT') return <Navigate to="/" replace/>;
  if (user.approvalStatus !== 'APPROVED') return <section className="card status-page"><h1>Your coach is reviewing your account</h1><p>You can start onboarding as soon as your coach approves access.</p></section>;
  if (result?.key !== key) return <p role="status">Preparing your coaching space…</p>;
  if (result.error) return <section className="card"><p role="alert">{result.error}</p><button className="secondary" onClick={()=>setAttempt(value=>value+1)}>Try again</button></section>;
  if (result.needsOnboarding && location.pathname !== '/client/onboarding') return <Navigate to="/client/onboarding" replace/>;
  return <Outlet/>;
}
