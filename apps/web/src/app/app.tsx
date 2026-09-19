import { Link, Navigate, createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../components/app-layout';
import { AdminDashboard } from '../features/admin/admin-dashboard';
import { AuthProvider, useAuth } from '../features/auth/auth-context';
import { CoachRegisterPage } from '../features/auth/coach-register-page';
import { ClientRegisterPage } from '../features/auth/client-register-page';
import { LoginPage } from '../features/auth/login-page';
import { PasswordResetPage } from '../features/auth/password-reset-page';
import { ClientDashboard } from '../features/client/client-dashboard';
import { CoachDashboard } from '../features/coach/coach-dashboard';
import { CoachMvpPage } from '../features/coach/coach-mvp-page';
import { ClientMvpPage } from '../features/client/client-mvp-page';
import { CommunityFeed } from '../features/feed/community-feed';

/* eslint-disable react-refresh/only-export-components -- route elements and router belong to one shell module */

function Home() {
  const { user } = useAuth();
  if (user) return <Navigate to={user.role === 'PLATFORM_ADMIN' ? '/admin' : user.role === 'COACH' ? '/coach' : '/client'} replace />;
  return <section className="hero"><div><p className="eyebrow">Coaching, thoughtfully managed</p><h1>A focused home for coaches and clients.</h1><p className="lede">Apply as a coach, get verified by the platform, and run your business from one secure workspace.</p><div className="hero-actions"><Link className="primary link-button" to="/register/coach">Apply as a coach</Link><Link className="secondary link-button" to="/login">Sign in</Link></div></div><div className="hero-panel card"><span className="pulse" /><p>Manual verification</p><strong>Every coach is reviewed before gaining access.</strong><div className="mini-row"><span>Coach application</span><b>Pending</b></div><div className="mini-row"><span>Admin review</span><b>Secure</b></div></div></section>;
}

export const router = createBrowserRouter([{ path: '/', element: <AuthProvider><AppLayout /></AuthProvider>, children: [
  { index: true, element: <Home /> },
  { path: 'login', element: <LoginPage /> },
  { path: 'register/coach', element: <CoachRegisterPage /> },
  { path: 'register/client', element: <ClientRegisterPage /> },
  { path: 'reset-password', element: <PasswordResetPage /> },
  { path: 'admin', element: <AdminDashboard /> },
  { path: 'coach', element: <CoachDashboard /> },
  { path: 'coach/feed', element: <CommunityFeed /> },
  { path: 'coach/studio', element: <CoachMvpPage /> },
  { path: 'client', element: <ClientDashboard /> },
  { path: 'client/feed', element: <CommunityFeed /> },
  { path: 'client/hub', element: <ClientMvpPage /> },
] }]);
