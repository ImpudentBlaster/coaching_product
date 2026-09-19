import '@testing-library/jest-dom/vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth-context';
import { apiBlob, apiRequest, refreshSession, setAccessToken } from '../../lib/api';

const user = { id: 'coach', displayName: 'Aman', role: 'COACH', approvalStatus: 'APPROVED' };
const sessionResponse = () => new Response(JSON.stringify({ accessToken: 'in-memory-test-token', user }), { status: 200, headers: { 'content-type': 'application/json' } });
function SessionView() { const { user } = useAuth(); return <p>{user ? `Signed in as ${user.displayName}` : 'Signed out'}</p>; }
afterEach(() => { cleanup(); setAccessToken(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('restores a reopened tab and sends only one refresh under StrictMode', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(sessionResponse())); vi.stubGlobal('fetch', fetch);
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  const first = render(<StrictMode><AuthProvider><SessionView /></AuthProvider></StrictMode>);
  await screen.findByText('Signed in as Aman');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), { method: 'POST', credentials: 'include' });
  first.unmount(); setAccessToken(null); // A reopened tab has no in-memory token.
  render(<StrictMode><AuthProvider><SessionView /></AuthProvider></StrictMode>);
  await screen.findByText('Signed in as Aman');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(storage).not.toHaveBeenCalled();
});
it('offers a retry on temporary connection failure instead of showing sign-in', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockImplementation(() => Promise.resolve(sessionResponse())); vi.stubGlobal('fetch', fetch);
  render(<AuthProvider><SessionView /></AuthProvider>);
  await screen.findByRole('alert');
  expect(screen.queryByText('Signed out')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  await screen.findByText('Signed in as Aman');
});
it('shows signed out only when the refresh cookie is absent or invalid', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  render(<AuthProvider><SessionView /></AuthProvider>);
  await screen.findByText('Signed out');
});
it('deduplicates simultaneous expired API and private image requests', async () => {
  let finishRefresh: ((response: Response) => void) | undefined;
  const fetch = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path.endsWith('/auth/refresh')) return new Promise<Response>(resolve => { finishRefresh = resolve; });
    if (new Headers(init?.headers).get('authorization') !== 'Bearer in-memory-test-token') return Promise.resolve(new Response('{}', { status: 401 }));
    return Promise.resolve(path.endsWith('/photo') ? new Response(new Blob(['photo'])) : new Response('{"ok":true}'));
  });
  vi.stubGlobal('fetch', fetch);
  const startup = refreshSession();
  const json = apiRequest<{ ok: boolean }>('/private');
  const image = apiBlob('/photo');
  // Flush fetch handlers while the refresh response remains pending.
  await Promise.resolve(); await Promise.resolve();
  finishRefresh!(sessionResponse());
  await expect(json).resolves.toEqual({ ok: true });
  await expect(image).resolves.toMatchObject({ size: expect.any(Number) });
  await startup;
  expect(fetch.mock.calls.filter(call => String(call[0]).endsWith('/auth/refresh'))).toHaveLength(1);
});
