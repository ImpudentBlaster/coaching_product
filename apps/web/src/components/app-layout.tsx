import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/auth-context';

type NavItem = { label: string; to: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

const coachNavigation: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/coach', icon: '⌂' }] },
  { label: 'Coaching', items: [
    { label: 'Clients', to: '/coach?tab=clients', icon: '♙' },
    { label: 'Check-ins', to: '/coach/studio?tab=checkins', icon: '✓' },
    { label: 'Activity', to: '/coach/studio?tab=activity', icon: '↗' },
    { label: 'Feedback', to: '/coach/studio?tab=clients', icon: '✦' },
  ] },
  { label: 'Build', items: [
    { label: 'Programs', to: '/coach/studio?tab=programs', icon: '▤' },
    { label: 'Workouts', to: '/coach/studio?tab=workouts', icon: '◫' },
    { label: 'Exercises', to: '/coach/studio?tab=exercises', icon: '⌁' },
  ] },
  { label: 'Workspace', items: [
    { label: 'Invitations', to: '/coach?tab=invitations', icon: '＋' },
    { label: 'Settings', to: '/coach?tab=profile', icon: '⚙' },
  ] },
];

const clientNavigation: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Today', to: '/client', icon: '⌂' }] },
  { label: 'My coaching', items: [
    { label: 'My plan', to: '/client/hub?tab=program', icon: '▤' },
    { label: 'Nutrition', to: '/client/hub?tab=nutrition', icon: '◒' },
    { label: 'Progress', to: '/client/hub?tab=progress', icon: '↗' },
    { label: 'Check-ins', to: '/client/hub?tab=checkins', icon: '✓' },
    { label: 'Coach messages', to: '/client/hub?tab=feedback', icon: '✦' },
  ] },
  { label: 'Account', items: [
    { label: 'My profile', to: '/client/hub?tab=onboarding', icon: '♙' },
    { label: 'Membership', to: '/client/hub?tab=subscription', icon: '◇' },
  ] },
];

const adminNavigation: NavGroup[] = [{ label: 'Platform', items: [
  { label: 'Dashboard', to: '/admin', icon: '⌂' },
  { label: 'Coach approvals', to: '/admin?status=PENDING_REVIEW', icon: '✓' },
  { label: 'All coaches', to: '/admin?status=ALL', icon: '♙' },
  { label: 'Security audit', to: '/admin?view=audit', icon: '◇' },
] }];

function Sidebar({ groups, name, role, onLogout }: { groups: NavGroup[]; name: string; role: string; onLogout: () => void }) {
  const location = useLocation();
  return <aside className="app-sidebar">
    <Link className="sidebar-brand" to={role === 'COACH' ? '/coach' : role === 'CLIENT' ? '/client' : '/admin'}><span className="brand-mark">F</span><span>Forme<b>.</b></span></Link>
    <nav className="sidebar-nav" aria-label={`${role.toLowerCase()} navigation`}>
      {groups.map((group) => <section className="nav-group" key={group.label}><p>{group.label}</p>{group.items.map((item) => <Link aria-current={isCurrent(location.pathname, location.search, item.to) ? 'page' : undefined} className={isCurrent(location.pathname, location.search, item.to) ? 'sidebar-link active' : 'sidebar-link'} key={item.label} to={item.to}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></Link>)}</section>)}
    </nav>
    <div className="sidebar-account"><div className="avatar">{name.charAt(0).toUpperCase()}</div><div><strong>{name}</strong><span>{role === 'PLATFORM_ADMIN' ? 'Platform admin' : role.toLowerCase()}</span></div><button onClick={onLogout} title="Sign out" aria-label="Sign out">↪</button></div>
  </aside>;
}

function MobileNav({ groups }: { groups: NavGroup[] }) {
  const location = useLocation();
  const items = groups.flatMap((group) => group.items).slice(0, 5);
  return <nav className="mobile-nav" aria-label="Mobile navigation">{items.map((item) => <Link aria-current={isCurrent(location.pathname, location.search, item.to) ? 'page' : undefined} className={isCurrent(location.pathname, location.search, item.to) ? 'active' : ''} key={item.label} to={item.to}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></Link>)}</nav>;
}

function isCurrent(pathname: string, search: string, to: string) {
  const [targetPath, targetSearch = ''] = to.split('?');
  if (pathname !== targetPath) return false;
  return targetSearch ? search === `?${targetSearch}` : search === '';
}

function PublicShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen"><header className="site-header"><div className="header-main"><Link className="brand" to="/">Forme<span>.</span></Link><nav className="public-nav"><Link to="/login">Sign in</Link><Link className="primary link-button" to="/register/coach">Become a coach</Link></nav></div></header><main className="mx-auto max-w-6xl px-6 py-10">{children}</main></div>;
}

export function AppLayout() {
  const { user, logout } = useAuth();
  if (!user) return <PublicShell><Outlet /></PublicShell>;
  const groups = user.role === 'COACH' ? coachNavigation : user.role === 'CLIENT' ? clientNavigation : adminNavigation;
  return <div className="app-shell"><Sidebar groups={groups} name={user.displayName} role={user.role} onLogout={logout} /><main className="app-content"><div className="mobile-topbar"><Link className="brand" to="/">Forme<span>.</span></Link><span>{user.displayName}</span></div><Outlet /></main><MobileNav groups={groups} /></div>;
}
