import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { apiRequest, type ProgramAssignment } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { useAuth } from '../auth/auth-context';
import { DailyCheckins } from '../checkins/client-checkin';
import type { Checkin } from '../checkins/checkin-types';
import { NavigationSymbol } from '../../components/navigation-symbol';
import './client-profile.css';

type HomeData = {
  assignment: ProgramAssignment | null;
  nutrition: Record<string, unknown> | null;
  checkins: Checkin[];
  feedbackCount: number;
  subscription: Record<string, unknown> | null;
  progress: Array<{ body_weight: string | number | null; measurement_date: string }>;
};

export function ClientDashboard() {
  const { user, ready } = useAuth();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const [program, nutrition, checkins, feedback, subscription, progress] = await Promise.all([
        apiRequest<{ assignment: ProgramAssignment | null }>('/client/program'),
        apiRequest<{ plan: Record<string, unknown> | null }>('/client/nutrition'),
        apiRequest<{ checkins: Checkin[] }>('/client/checkins'),
        apiRequest<{ messages: unknown[] }>('/feedback?context=GENERAL'),
        apiRequest<{ subscription: Record<string, unknown> | null }>('/client/subscription'),
        apiRequest<{ entries: HomeData['progress'] }>('/client/progress'),
      ]);
      setData({ assignment: program.assignment, nutrition: nutrition.plan, checkins: checkins.checkins, feedbackCount: feedback.messages.length, subscription: subscription.subscription, progress: progress.entries });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load your dashboard.'); }
  }, []);
  useEffect(() => { if (user?.role === 'CLIENT' && user.approvalStatus === 'APPROVED') void load(); }, [user, load]);
  if (!ready) return <DashboardSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'CLIENT') return <Navigate to="/" replace />;
  if (user.approvalStatus !== 'APPROVED') return <section className="card status-page"><h1>Your coach is reviewing your account</h1><p>You can start onboarding as soon as your coach approves access.</p></section>;
  if (!data) return error ? <section className="card client-dashboard-error"><h1>Your dashboard</h1><p role="alert">{error}</p><button className="secondary" onClick={() => void load()}>Try again</button></section> : <DashboardSkeleton />;
  const weight = data.progress.find(entry => entry.body_weight !== null);
  return <section className="client-profile-home">
    {error && <p role="alert">{error}</p>}
    <div className="client-overview-grid"><section className="card client-daily-panel"><div className="client-panel-heading"><div><p className="eyebrow">A moment for yourself</p><h2>Daily check-in</h2></div><Link to="/client/hub?tab=checkins">View all <span aria-hidden="true">↗</span></Link></div><p className="client-panel-description">Small reflections help your coach see the bigger picture.</p>{data.checkins.length ? <DailyCheckins checkins={data.checkins} onSaved={load} /> : <div className="client-checkin-empty"><span aria-hidden="true">✓</span><h3>You’re all caught up</h3><p>Your assigned check-ins will appear here. Until then, focus on your next small step.</p></div>}</section><aside className="client-today-rail"><section className="card client-next-step"><p className="eyebrow">Up next</p><span className="client-training-icon" aria-hidden="true"><NavigationSymbol symbol="◫" /></span><h2>{data.assignment?.snapshot.name ?? 'Your plan is taking shape'}</h2><p>{data.assignment ? `${data.assignment.snapshot.days.length} training days, built around you.` : 'Your coach will share your training plan here when it’s ready.'}</p><Link className="primary link-button" to={data.assignment ? '/client/hub?tab=program' : '/client/onboarding'}>{data.assignment ? 'View training plan' : 'View questionnaire'} <span aria-hidden="true">↗</span></Link></section><section className="card client-coach-note"><span className="eyebrow">Stay connected</span><h2>A little guidance goes a long way.</h2><p>{data.feedbackCount ? `${data.feedbackCount} messages in your coaching conversation.` : 'Share a win, ask a question, or let your coach know how you’re feeling.'}</p><Link to="/client/hub?tab=feedback">Open coach messages <span aria-hidden="true">→</span></Link></section></aside></div>
    <div className="client-essentials"><QuickLink symbol="◒" title="Nutrition" detail={data.nutrition ? 'Your daily targets are ready' : 'Build nourishing habits'} to="/client/hub?tab=nutrition" /><QuickLink symbol="↗" title="Your progress" detail={weight ? `Last recorded ${formatDate(weight.measurement_date)}` : 'Record your first measurements'} to="/client/hub?tab=progress" /><QuickLink symbol="◇" title="Membership" detail={String(data.subscription?.plan_name ?? 'Your coaching details')} to="/client/hub?tab=subscription" /></div>
  </section>;
}
function QuickLink({ symbol, title, detail, to }: { symbol: string; title: string; detail: string; to: string }) { return <Link className="card client-essential" to={to}><span className="client-essential-icon" aria-hidden="true"><NavigationSymbol symbol={symbol} /></span><div><h2>{title}</h2><p>{detail}</p></div><span aria-hidden="true">↗</span></Link>; }
function DashboardSkeleton() { return <section className="client-profile-home dashboard-loading" aria-label="Loading dashboard" role="status"><span className="sr-only">Preparing your coaching dashboard…</span><div className="skeleton skeleton-heading" aria-hidden="true" /><div className="skeleton wide" /><div className="skeleton wide" /></section>; }
