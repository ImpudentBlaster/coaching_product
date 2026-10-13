import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { ClientMessageDialog } from './client-message-dialog';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('sends to the selected client and keeps an unsuccessful draft for retry', async () => {
  vi.mocked(apiRequest).mockImplementation(async (_path, init) => {
    if (init) throw new Error('Unable to send');
    return { messages: [{ id: 'one', author: 'coach@example.test', authorUserId: 'coach', message: 'Welcome!', createdAt: '2026-10-07T10:00:00Z' }] };
  });
  render(<ClientMessageDialog clientId="client" clientName="Taylor" coachId="coach" onClose={vi.fn()} />);
  await screen.findByText('Welcome!');
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Great work' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText('Unable to send');
  expect(screen.getByLabelText('Message')).toHaveValue('Great work');
  expect(apiRequest).toHaveBeenCalledWith('/feedback', { method: 'POST', body: JSON.stringify({ clientId: 'client', context: 'GENERAL', contextId: null, message: 'Great work' }) });
  vi.mocked(apiRequest).mockResolvedValue({ messages: [] });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText('Message sent.');
  await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''));
});
