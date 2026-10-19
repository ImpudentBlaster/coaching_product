import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { ClientDashboard } from './client-dashboard';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ ready: true, user: { id: 'client', role: 'CLIENT', approvalStatus: 'APPROVED', displayName: 'Alex Taylor', email: 'alex@example.test' } }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function setup() {
  vi.mocked(apiRequest).mockImplementation(async path => ({
    '/client/program': { assignment: null }, '/client/nutrition': { plan: null },
    '/client/checkins': { checkins: [] }, '/feedback?context=GENERAL': { messages: [] },
    '/client/subscription': { subscription: { plan_name: 'Strength coaching', status: 'ACTIVE' } },
    '/client/onboarding': { onboarding: { data: { weight: 72, age: 30 } } },
    '/client/progress': { entries: [{ body_weight: null, measurement_date: '2026-10-18' }, { body_weight: 74, measurement_date: '2026-10-17' }] },
  })[path]);
  render(<MemoryRouter initialEntries={['/client']}><ClientDashboard /></MemoryRouter>);
}
it('shows dashboard essentials beneath the shared profile layout', async () => {
  setup();
  expect(await screen.findByRole('heading', { name: 'Daily check-in' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'You’re all caught up' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Your progress/ })).toHaveAttribute('href', '/client/hub?tab=progress');
});
it('offers retry instead of presenting missing data as an empty plan', async () => {
  setup();
  await screen.findByRole('heading', { name: 'Daily check-in' });
  cleanup();
  vi.mocked(apiRequest).mockRejectedValue(new Error('Connection lost'));
  render(<MemoryRouter><ClientDashboard /></MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByText('You’re all caught up')).not.toBeInTheDocument();
});

