import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/auth-context';

export function AppLayout() {
  const { user, logout } = useAuth();
  const coachNav:Array<[string,string]>=[['Dashboard','/coach'],['Clients','/coach?tab=clients'],['Workouts','/coach/studio?tab=workouts'],['Exercises','/coach/studio?tab=exercises'],['Nutrition','/coach/studio?tab=clients'],['Check-ins','/coach/studio?tab=checkins'],['Progress','/coach/studio?tab=clients'],['Feedback','/coach/studio?tab=clients'],['Settings','/coach?tab=profile']];
  const clientNav:Array<[string,string]>=[['Home','/client'],['My Plan','/client/hub?tab=program'],['Workouts','/client/hub?tab=program'],['Nutrition','/client/hub?tab=nutrition'],['Progress','/client/hub?tab=progress'],['Check-ins','/client/hub?tab=checkins'],['Feedback','/client/hub?tab=feedback'],['Account','/client']];
  const adminNav:Array<[string,string]>=[['Dashboard','/admin'],['Coach Approvals','/admin'],['Coaches','/admin'],['Settings','/admin']];
  const links=user?.role==='COACH'?coachNav:user?.role==='CLIENT'?clientNav:adminNav;
  return <div className="min-h-screen"><header className="site-header"><div className="header-main"><Link className="brand" to={user?(user.role==='COACH'?'/coach':user.role==='CLIENT'?'/client':'/admin'):'/'}>Forme<span>.</span></Link>{!user?<nav className="public-nav"><Link to="/login">Sign in</Link><Link className="primary link-button" to="/register/coach">Become a coach</Link></nav>:<div className="account-actions"><span>{user.displayName}</span><button onClick={logout}>Sign out</button></div>}</div>{user&&<nav className="role-nav" aria-label={`${user.role.toLowerCase()} navigation`}>{links.map(([label,to])=><Link key={label} to={to}>{label}</Link>)}</nav>}</header><main className="mx-auto max-w-6xl px-6 py-10"><Outlet /></main></div>;
}
