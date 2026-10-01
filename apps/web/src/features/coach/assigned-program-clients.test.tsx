import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { AssignedProgramClients } from './assigned-program-clients';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function Harness() { const [busy,setBusy] = useState(false); return <AssignedProgramClients programId="p1" busy={busy} onBusy={setBusy}/>; }
it('loads current clients and confirms removal before refreshing the list', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ items: [{id:'a1',clientId:'c1',name:'Alex',email:'alex@example.test'}], hasMore:false }).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ items:[],hasMore:false });
  render(<Harness/>);
  fireEvent.click(await screen.findByRole('button', {name:'Remove program from Alex'}));
  expect(apiRequest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', {name:'Cancel'}));
  expect(apiRequest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', {name:'Remove program from Alex'}));
  fireEvent.click(screen.getByRole('button', {name:'Remove assignment'}));
  await waitFor(() => expect(screen.getByText('Program removed from Alex.')).toBeInTheDocument());
  expect(apiRequest).toHaveBeenCalledWith('/coach/programs/p1/assignments/a1', {method:'DELETE'});
  expect(await screen.findByText('No clients are assigned to this program.')).toBeInTheDocument();
});
it('retains the client and confirmation when removal fails', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ items: [{id:'a1',clientId:'c1',name:'Alex',email:'alex@example.test'}], hasMore:false }).mockRejectedValueOnce(new Error('Unable to remove'));
  render(<Harness/>);
  fireEvent.click(await screen.findByRole('button', {name:'Remove program from Alex'}));
  fireEvent.click(screen.getByRole('button', {name:'Remove assignment'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to remove');
  expect(screen.getByRole('button', {name:'Remove program from Alex'})).toBeEnabled();
  expect(screen.getByRole('button', {name:'Remove assignment'})).toBeEnabled();
});
