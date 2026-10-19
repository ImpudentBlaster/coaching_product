import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { ClientLayout } from './client-layout';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: { id: 'client', role: 'CLIENT', approvalStatus: 'APPROVED', displayName: 'Alex Taylor', email: 'alex@example.test' } }) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function setup(path = '/client') {
  vi.mocked(apiRequest).mockImplementation(async path => ({
    '/client/program': { assignment: null }, '/client/nutrition': { plan: null }, '/client/checkins': { checkins: [] },
    '/client/subscription': { subscription: { plan_name: 'Strength coaching', status: 'ACTIVE' } },
    '/client/onboarding': { onboarding: { data: { weight: 72, age: 30 } } },
    '/client/progress': { entries: [{ body_weight: 74 }] },
  })[path]);
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path="client" element={<ClientLayout />}><Route index element={<h2>Dashboard content</h2>} /><Route path="hub" element={<h2>Hub content</h2>} /><Route path="onboarding" element={<h2>Questionnaire content</h2>} /></Route></Routes></MemoryRouter>);
}
it('keeps the same upper section and profile values mounted across every coaching tab', async () => {
  setup();
  await screen.findByText('72 kg');
  const summary = screen.getByRole('region', { name: 'Your profile summary' });
  expect(within(summary).getByText('Alex Taylor')).toBeInTheDocument();
  expect(within(summary).getByText('74 kg')).toBeInTheDocument();
  expect(within(summary).getByText('30 years')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss welcome message' }));
  for (const name of ['Check-ins', 'Nutrition', 'Supplements', 'Training', 'Progress', 'Messages', 'Membership', 'Questionnaire', 'Dashboard']) {
    fireEvent.click(within(summary).getByRole('link', { name }));
    expect(screen.getByRole('region', { name: 'Your profile summary' })).toBe(summary);
    expect(screen.getByText('72 kg')).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Dismiss welcome message' })).not.toBeInTheDocument();
  }
});
it('shows the full upper section on a direct link to a client tab', async () => {
  setup('/client/hub?tab=checkins');
  expect(await screen.findByText('Strength coaching')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Hub content' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dismiss welcome message' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Check-ins' })).toHaveAttribute('aria-current', 'page');
});

