import { Link, useLocation } from 'react-router-dom';
import './client-profile.css';

const tabs = [
  ['Dashboard', '/client'], ['Check-ins', '/client/hub?tab=checkins'],
  ['Questionnaire', '/client/onboarding'], ['Nutrition', '/client/hub?tab=nutrition'],
  ['Supplements', '/client/hub?tab=supplements'], ['Training', '/client/hub?tab=program'], ['Progress', '/client/hub?tab=progress'],
  ['Messages', '/client/hub?tab=feedback'], ['Membership', '/client/hub?tab=subscription'],
];
export function ClientProfileNav() {
  const location = useLocation();
  return <nav className="client-profile-tabs" aria-label="My coaching pages">{tabs.map(([label,to]) => <Link key={to} to={to!} aria-current={location.pathname + location.search === to ? 'page' : undefined}>{label}</Link>)}</nav>;
}
