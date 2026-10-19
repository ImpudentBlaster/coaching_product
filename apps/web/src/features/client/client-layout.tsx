import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { apiRequest, type ProgramAssignment } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { useAuth } from '../auth/auth-context';
import type { Checkin } from '../checkins/checkin-types';
import type { Onboarding } from './onboarding-types';
import { ClientProfileNav } from './client-profile-nav';
import { NavigationSymbol } from '../../components/navigation-symbol';
import './client-profile.css';

type ProfileData = { assignment: ProgramAssignment | null; nutrition: Record<string, unknown> | null; checkins: Checkin[]; subscription: Record<string, unknown> | null; onboarding: Onboarding | null; progress: Array<{ body_weight: string | number | null }> };
export function ClientLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [result, setResult] = useState<{ userId: string; data: ProfileData } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const clientId = user?.role === 'CLIENT' && user.approvalStatus === 'APPROVED' ? user.id : null;
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    setError('');
    void Promise.all([
      apiRequest<{ assignment: ProgramAssignment | null }>('/client/program'),
      apiRequest<{ plan: Record<string, unknown> | null }>('/client/nutrition'),
      apiRequest<{ checkins: Checkin[] }>('/client/checkins'),
      apiRequest<{ subscription: ProfileData['subscription'] }>('/client/subscription'),
      apiRequest<{ onboarding: Onboarding | null }>('/client/onboarding'),
      apiRequest<{ entries: ProfileData['progress'] }>('/client/progress'),
    ]).then(([program,nutrition,checkins,subscription,onboarding,progress]) => {
      if (active) setResult({ userId: clientId, data: { assignment: program.assignment, nutrition: nutrition.plan, checkins: checkins.checkins, subscription: subscription.subscription, onboarding: onboarding.onboarding, progress: progress.entries } });
    }).catch(() => { if (active) setError('Unable to refresh your profile summary.'); });
    return () => { active = false; };
  }, [clientId, location.pathname, location.search, attempt]);
  if (!clientId || !user) return <Outlet />;
  const data = result?.userId === clientId ? result.data : null;
  const nextCheckin = [...(data?.checkins ?? [])].filter(item => !['SUBMITTED', 'REVIEWED'].includes(item.status)).sort((a,b) => a.dueDate.localeCompare(b.dueDate))[0];
  const weight = data?.progress.find(entry => entry.body_weight !== null);
  const startingWeight = data?.onboarding?.data.weight;
  const age = data?.onboarding?.data.age;
  const preparing = !!data && !data.assignment && !data.nutrition;
  return <section className="client-space"><div className="client-profile-home">
    <header className="client-page-intro"><div><p className="eyebrow">Your coaching space</p><h1>Every day, a little stronger.</h1></div><span className="client-account-label"><span /> Client dashboard</span></header>
    {!dismissed && <aside className="client-welcome-banner"><span className="client-banner-icon" aria-hidden="true"><NavigationSymbol symbol="✦" /></span><div><strong>{preparing ? 'Welcome to your next chapter' : 'Your plan. Your pace. Your progress.'}</strong><p>{preparing ? 'Your coach is preparing your plans. You’ll find your training and nutrition here once they’re assigned.' : 'Your coaching is all here. Check in, follow your plan, and keep your coach up to date.'}</p></div><button type="button" aria-label="Dismiss welcome message" onClick={() => setDismissed(true)}>×</button></aside>}
    <section className="card client-identity-card" aria-label="Your profile summary"><div className="client-identity-body"><div className="client-identity"><div className="client-profile-avatar" aria-hidden="true">{user.displayName.split(/\s+/).map(part => part.charAt(0)).slice(0,2).join('')}</div><div><div className="client-name-row"><h2>{user.displayName}</h2><span className="client-membership-badge">{data?.subscription ? String(data?.subscription.status ?? 'Membership added').replaceAll('_',' ').toLowerCase() : 'Coaching client'}</span></div><p>{user.email}</p><Link to="/client/onboarding">View my questionnaire <span aria-hidden="true">↗</span></Link></div></div><dl className="client-summary-stats"><Stat label="Next check-in" value={nextCheckin ? formatDate(nextCheckin.dueDate) : data ? 'All caught up' : '—'} /><Stat label="Membership" value={String(data?.subscription?.plan_name ?? 'Not assigned')} /><Stat label="Start weight" value={typeof startingWeight === 'number' ? `${startingWeight} kg` : '—'} /><Stat label="Current weight" value={weight ? `${weight.body_weight} kg` : '—'} /><Stat label="Age" value={typeof age === 'number' ? `${age} years` : '—'} /></dl></div><ClientProfileNav /></section>

    {error && <div className="client-profile-refresh-error"><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry profile summary</button></div>}
    </div><Outlet /></section>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
