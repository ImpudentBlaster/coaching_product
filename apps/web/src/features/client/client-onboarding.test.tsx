import { GlobalNotifications } from '../../components/global-notifications';
import { notify } from '../../lib/notify';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../auth/auth-context';
import { ClientOnboardingPage } from './client-onboarding-page';
import { ClientOnboardingGate } from './client-onboarding-gate';
import { CoachOnboarding } from '../coach/coach-onboarding';
import type { Onboarding } from './onboarding-types';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
vi.mock('../auth/auth-context',()=>({useAuth:vi.fn()}));
afterEach(()=>{notify.dismiss();cleanup();vi.resetAllMocks();});
const data = {personalDetails:'Office worker',age:30,fitnessGoal:'Build strength',height:175,weight:72,waist:80,experienceLevel:'BEGINNER',injuries:'',availableEquipment:['Dumbbells'],preferredTrainingDays:['Monday'],currentDiet:'Three meals a day',nutritionPreferences:'Vegetarian',additionalNotes:''};
const draft:Onboarding = {id:'test',status:'DRAFT',data,submittedAt:null,reviewedAt:null};
function page() {
  render(<MemoryRouter initialEntries={['/client/onboarding']}><Routes><Route path="/client/onboarding" element={<ClientOnboardingPage/>}/><Route path="/client" element={<p>Dashboard ready</p>}/></Routes></MemoryRouter>);
}
it('restores drafts and submits the latest unsaved answers in a single request',async()=>{
  vi.mocked(apiRequest).mockResolvedValueOnce({onboarding:draft}).mockResolvedValueOnce({onboarding:{...draft,status:'SUBMITTED'}});
  page();
  expect(await screen.findByLabelText('Age (years) *')).toHaveValue(30);
  expect(screen.getByLabelText('Monday')).toBeChecked();
  fireEvent.change(screen.getByLabelText('Empty stomach body weight (kg) *'),{target:{value:'73.5'}});
  fireEvent.click(screen.getByRole('button',{name:'Submit questionnaire'}));
  await screen.findByText('Dashboard ready');
  expect(apiRequest).toHaveBeenLastCalledWith('/client/onboarding/submit',{method:'POST',body:expect.any(String)});
  expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls.at(-1)?.[1]?.body))).toEqual({...data,weight:73.5});
});
it('saves an incomplete draft and retains answers after an unsuccessful save',async()=>{
  vi.mocked(apiRequest).mockResolvedValueOnce({onboarding:null}).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({onboarding:{...draft,data:{personalDetails:'Saved later'}}});
  page();await screen.findByLabelText('About you *');
  fireEvent.change(screen.getByLabelText('About you *'),{target:{value:'Saved later'}});
  fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  expect(screen.getByLabelText('About you *')).toHaveValue('Saved later');
  fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
  await screen.findByText(/Draft saved/);
  expect(apiRequest).toHaveBeenLastCalledWith('/client/onboarding',{method:'PUT',body:JSON.stringify({personalDetails:'Saved later',fitnessGoal:'',injuries:'',availableEquipment:[],preferredTrainingDays:[],currentDiet:'',nutritionPreferences:'',additionalNotes:''})});
});
it('locks submitted questionnaires including older records without new fields',async()=>{
  vi.mocked(apiRequest).mockResolvedValue({onboarding:{...draft,status:'REVIEWED',data:{personalDetails:'Legacy answers'}}});page();
  expect(await screen.findByLabelText('About you *')).toBeDisabled();
  expect(screen.queryByRole('button',{name:'Submit questionnaire'})).not.toBeInTheDocument();
  expect(screen.getByText('Your coach has reviewed your answers.')).toBeInTheDocument();
});
function gate(status:'DRAFT'|'SUBMITTED'|null,approvalStatus:'APPROVED'|'PENDING_REVIEW'='APPROVED') {
  vi.mocked(useAuth).mockReturnValue({ready:true,user:{id:'client',role:'CLIENT',approvalStatus,displayName:'Client',email:'client@example.test',businessName:null,createdAt:'2026-09-20T00:00:00Z'},login:vi.fn(),logout:vi.fn(),updateProfile:vi.fn()});
  vi.mocked(apiRequest).mockResolvedValue({onboarding:status?{...draft,status}:null});
  render(<MemoryRouter initialEntries={['/client/hub?tab=program']}><Routes><Route path="/client" element={<ClientOnboardingGate/>}><Route path="hub" element={<p>Training plan</p>}/><Route path="onboarding" element={<p>Initial questionnaire</p>}/></Route></Routes></MemoryRouter>);
}
it.each([null,'DRAFT'] as const)('redirects incomplete onboarding (%s) even from a training link',async status=>{
  gate(status);await screen.findByText('Initial questionnaire');expect(screen.queryByText('Training plan')).not.toBeInTheDocument();
});
it('allows submitted clients to continue without waiting for coach review',async()=>{gate('SUBMITTED');await screen.findByText('Training plan');});
it('preserves the approval boundary without requesting private onboarding data',async()=>{gate(null,'PENDING_REVIEW');await screen.findByText('Your coach is reviewing your account');expect(apiRequest).not.toHaveBeenCalled();});
it('shows a recoverable error instead of bypassing onboarding on request failure',async()=>{
  gate(null);vi.mocked(apiRequest).mockRejectedValue(new Error('Network unavailable'));
  // The initial request is already in flight; retry navigation mounts a fresh check.
  cleanup();
  render(<MemoryRouter initialEntries={['/client']}><Routes><Route path="/client" element={<ClientOnboardingGate/>}><Route index element={<p>Dashboard ready</p>}/></Route></Routes></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');expect(screen.queryByText('Dashboard ready')).not.toBeInTheDocument();
});
it('lets the coach review submitted answers',async()=>{
  vi.mocked(apiRequest).mockResolvedValueOnce({onboarding:{...draft,status:'SUBMITTED'}}).mockResolvedValueOnce({onboarding:{...draft,status:'REVIEWED'}});
  render(<CoachOnboarding clientId="client"/>);
  fireEvent.click(await screen.findByRole('button',{name:'Mark as reviewed'}));
  await waitFor(()=>expect(screen.getByText('Reviewed')).toBeInTheDocument());
  expect(apiRequest).toHaveBeenLastCalledWith('/coach/clients/client/onboarding/review',{method:'POST',body:'{}'});
});

beforeEach(()=>{render(<GlobalNotifications/>);});
