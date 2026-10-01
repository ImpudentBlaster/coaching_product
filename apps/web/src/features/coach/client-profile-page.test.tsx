import '@testing-library/jest-dom/vitest';
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { MemoryRouter,Routes,Route } from 'react-router-dom';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../auth/auth-context';
import { ClientProfilePage,type ClientProfile } from './client-profile-page';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
vi.mock('../auth/auth-context',()=>({useAuth:vi.fn()}));
vi.mock('./client-wizard',()=>({ClientWizard:({clientId,onClose}:{clientId:string;onClose:()=>void})=><div>Edit {clientId}<button onClick={onClose}>Close editor</button></div>}));
const profile:ClientProfile={client:{id:'client',displayName:'Taylor Client',email:'taylor@example.test',phone:null,status:'APPROVED',joinedAt:'2026-09-01'},onboarding:{status:'SUBMITTED',data:{age:30,weight:72}},program:null,nutrition:null,subscription:null,progress:[],workouts:[],checkins:[]};
beforeEach(()=>{vi.mocked(useAuth).mockReturnValue({ready:true,user:{id:'coach',role:'COACH',approvalStatus:'APPROVED',displayName:'Coach',email:'coach@example.test',businessName:null,createdAt:'2026-09-01'},login:vi.fn(),logout:vi.fn(),updateProfile:vi.fn()});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
function page(path='/coach/clients/client'){render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/coach/clients/:clientId" element={<ClientProfilePage/>}/><Route path="/coach" element={<p>Client list</p>}/></Routes></MemoryRouter>);}
it('renders a dedicated client identity and navigates tabs and back to clients',async()=>{
  vi.mocked(apiRequest).mockResolvedValue({profile});page();
  await screen.findByRole('heading',{name:'Taylor Client'});
  expect(screen.getByText('taylor@example.test')).toBeInTheDocument();
  expect(screen.getByText('72 kg')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link',{name:'Training'}));
  await screen.findByRole('heading',{name:'No program assigned'});
  fireEvent.click(screen.getByRole('link',{name:'Nutrition'}));
  await screen.findByRole('heading',{name:'No nutrition plan assigned'});
  fireEvent.click(screen.getByRole('link',{name:'← Back to clients'}));await screen.findByText('Client list');
});
it('opens questionnaire deep links and updates the header after coach review',async()=>{
  vi.mocked(apiRequest).mockImplementation(async(path,options)=>{
    if(path.endsWith('/profile'))return {profile};
    return {onboarding:{id:'onboarding',status:options?.method==='POST'?'REVIEWED':'SUBMITTED',data:{personalDetails:'Desk job',age:30,weight:72},submittedAt:'2026-09-20T10:00:00Z',reviewedAt:null}};
  });page('/coach/clients/client?tab=questionnaire');
  fireEvent.click(await screen.findByRole('button',{name:'Mark as reviewed'}));
  await screen.findByText('Reviewed');expect(screen.getByText('reviewed')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(within(screen.getByRole('navigation',{name:'Client profile sections'})).getByRole('link',{name:'Questionnaire'})).toHaveAttribute('aria-current','page');
});
it('uses the current client when editing and returns to their profile',async()=>{
  vi.mocked(apiRequest).mockResolvedValue({profile});page();
  fireEvent.click(await screen.findByRole('button',{name:'Edit client & plans'}));expect(screen.getByText('Edit client')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Close editor'}));await screen.findByRole('heading',{name:'Taylor Client'});
});
it('shows access errors without leaking a profile and supports retry',async()=>{
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Client not found')).mockResolvedValue({profile});page();
  expect(await screen.findByRole('alert')).toHaveTextContent('Client not found');expect(screen.queryByText('taylor@example.test')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Try again'}));await screen.findByRole('heading',{name:'Taylor Client'});
});
