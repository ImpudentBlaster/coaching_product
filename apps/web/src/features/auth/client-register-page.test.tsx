import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { ClientRegisterPage } from './client-register-page';

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('./auth-context', () => ({ useAuth: () => ({ login, ready: true }) }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const token = 'private-invitation-token-for-test';
const email = 'client@example.test';
const password = 'MyChosenPassword!123';
function openInvite(search = `?invite=${token}`) {
  render(
    <MemoryRouter initialEntries={[`/register/client${search}`]}>
      <Routes>
        <Route path="/register/client" element={<ClientRegisterPage />} />
        <Route path="/client" element={<h1>Client workspace</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
function mockInvitation(displayName = 'Asha Shah') {
  vi.mocked(apiRequest).mockResolvedValueOnce({
    invitation: { email, displayName },
  });
  vi.mocked(apiRequest).mockResolvedValueOnce({ user: { email } });
}
async function submitPassword() {
  fireEvent.change(await screen.findByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create account and continue' }),
  );
}

it('needs only a password for a prepared invite and continues signed in', async () => {
  mockInvitation();
  login.mockResolvedValue({ email });
  openInvite();
  await screen.findByText('Asha Shah');
  expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toHaveValue(email);
  expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
  await submitPassword();
  await screen.findByRole('heading', { name: 'Client workspace' });
  expect(apiRequest).toHaveBeenNthCalledWith(1, '/auth/client/invitation', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  expect(apiRequest).toHaveBeenNthCalledWith(2, '/auth/client/register', {
    method: 'POST',
    body: JSON.stringify({ token, displayName: 'Asha Shah', password }),
  });
  expect(login).toHaveBeenCalledWith(email, password);
});

it('asks for the missing name on an email-only invite', async () => {
  mockInvitation('');
  login.mockResolvedValue({ email });
  openInvite();
  fireEvent.change(await screen.findByLabelText('Your name'), {
    target: { value: '  Asha Shah  ' },
  });
  await submitPassword();
  await screen.findByRole('heading', { name: 'Client workspace' });
  expect(apiRequest).toHaveBeenLastCalledWith('/auth/client/register', {
    method: 'POST',
    body: JSON.stringify({ token, displayName: 'Asha Shah', password }),
  });
});

it('offers sign-in without registering again if account creation succeeds but login fails', async () => {
  mockInvitation();
  login.mockRejectedValue(new Error('Network unavailable'));
  openInvite();
  await submitPassword();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your account was created',
  );
  expect(
    screen.getByRole('link', { name: 'Continue to sign in' }),
  ).toHaveAttribute('href', '/login');
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledTimes(2);
});

it('keeps registration errors recoverable and does not attempt login', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({
    invitation: { email, displayName: 'Asha Shah' },
  });
  vi.mocked(apiRequest).mockRejectedValueOnce(
    new Error('Unable to create your account'),
  );
  openInvite();
  await submitPassword();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to create your account',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Create account and continue' }),
    ).toBeEnabled(),
  );
  expect(login).not.toHaveBeenCalled();
});

it('does not show registration fields for an invalid invite', async () => {
  vi.mocked(apiRequest).mockRejectedValue(
    new Error('This invitation has already been used.'),
  );
  openInvite();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'already been used',
  );
  expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login',
  );
});

it('explains a missing invitation without calling the API', async () => {
  openInvite('');
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'missing its invitation code',
  );
  expect(apiRequest).not.toHaveBeenCalled();
});
