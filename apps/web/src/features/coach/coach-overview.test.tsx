import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../auth/auth-context';
import { CoachDashboard } from './coach-dashboard';
import type { CoachOverviewData } from './coach-overview';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
vi.mock('../auth/auth-context',()=>({useAuth:vi.fn()}));
vi.mock('./client-wizard',()=>({ClientWizard:({onClose}:{onClose:()=>void})=><div>Client setup<button onClick={onClose}>Back to dashboard</button></div>}));
const empty:CoachOverviewData={activeClients:0,pendingClients:0,onboardingReviews:0,checkinReviews:0,dueToday:0,overdue:0,completedWorkouts7d:0,onboarding:[],dueCheckins:[],activity:[]};
beforeEach(()=>{
  vi.mocked(useAuth).mockReturnValue({ready:true,user:{id:'coach',role:'COACH',approvalStatus:'APPROVED',displayName:'Alex',email:'coach@example.test',businessName:'Coaching',createdAt:'2026-09-20'},login:vi.fn(),logout:vi.fn(),updateProfile:vi.fn()});
});
afterEach(()=>{cleanup();vi.resetAllMocks();});
function renderPage(path='/coach'){render(<MemoryRouter initialEntries={[path]}><CoachDashboard/></MemoryRouter>);}
it('separates the dashboard from client management and links to the client list',async()=>{
  vi.mocked(apiRequest).mockImplementation(async path=>path.startsWith('/coach/dashboard')?{overview:empty}:path==='/coach/clients'?{relationships:[]}:{invitations:[]});
  renderPage();
  await screen.findByText('You’re all caught up');
  expect(screen.queryByRole('heading',{name:'Client access'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link',{name:'Manage clients →'}));
  await screen.findByRole('heading',{name:'Clients'});
  await screen.findByText('No client access yet');
  expect(screen.queryByRole('heading',{name:'Your coaching overview'})).not.toBeInTheDocument();
});
it('renders real counts, review actions, due check-ins and recent activity',async()=>{
  vi.mocked(apiRequest).mockResolvedValue({overview:{...empty,activeClients:12,pendingClients:2,onboardingReviews:1,checkinReviews:3,dueToday:1,overdue:1,completedWorkouts7d:17,onboarding:[{clientId:'one',clientName:'Taylor',submittedAt:'2026-09-19T10:00:00Z'}],dueCheckins:[{id:'due',clientId:'two',clientName:'Sam',dueDate:'2020-01-01'}],activity:[{id:'workout:1',clientId:'three',clientName:'Morgan',kind:'WORKOUT',title:'Upper body',happenedAt:'2026-09-20T10:00:00Z'}]}});
  renderPage();await screen.findByRole('link',{name:'Review onboarding for Taylor'});
  expect(within(screen.getByRole('link',{name:/Active clients/})).getByText('12')).toBeInTheDocument();
  expect(within(screen.getByRole('link',{name:/Workouts completed/})).getByText('17')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:/2 clients need approval/})).toHaveAttribute('href','/coach?tab=clients');
  expect(screen.getByRole('link',{name:/3 check-ins ready/})).toHaveAttribute('href','/coach/studio?tab=checkins');
  expect(screen.getByText('Sam')).toBeInTheDocument();
  expect(screen.getByText('Completed · Upper body')).toBeInTheDocument();
});
it('shows loading and recoverable errors without misleading zero metrics',async()=>{
  let rejectRequest:(reason:Error)=>void=()=>{};
  vi.mocked(apiRequest).mockReturnValueOnce(new Promise((_resolve,reject)=>{rejectRequest=reject;})).mockResolvedValue({overview:empty});
  renderPage();expect(screen.getByRole('status')).toHaveTextContent('Loading your coaching overview');
  expect(screen.queryByText('Active clients')).not.toBeInTheDocument();
  rejectRequest(new Error('Connection unavailable'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection unavailable');
  fireEvent.click(screen.getByRole('button',{name:'Try again'}));
  await screen.findByText('No check-ins outstanding');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('refreshes data and opens client setup from the dashboard',async()=>{
  vi.mocked(apiRequest).mockResolvedValueOnce({overview:empty}).mockResolvedValue({overview:{...empty,activeClients:3}});
  renderPage();await screen.findByText('You’re all caught up');
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
  await waitFor(()=>expect(within(screen.getByRole('link',{name:/Active clients/})).getByText('3')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Add client'}));expect(screen.getByText('Client setup')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Back to dashboard'}));expect(screen.getByRole('heading',{name:'Your coaching overview'})).toBeInTheDocument();
});
it('does not fetch dashboard data for an unapproved coach',()=>{
  const current=vi.mocked(useAuth)();
  vi.mocked(useAuth).mockReturnValue({...current,user:{...current.user!,approvalStatus:'PENDING_REVIEW'}});
  renderPage();expect(screen.getByText('Your application is under review')).toBeInTheDocument();expect(apiRequest).not.toHaveBeenCalled();
});
