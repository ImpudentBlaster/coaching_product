import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { AssignedPackageClients } from './assigned-package-clients';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('shows linked client identities and approval status and searches the assigned list', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce({ items: [{ clientId: 'client-1', name: 'Asha Shah', email: 'asha@example.test', status: 'PENDING_REVIEW' }], hasMore: false }).mockResolvedValue({ items: [], hasMore: false });
  render(<MemoryRouter><AssignedPackageClients packageId="package-1" /></MemoryRouter>);
  expect(await screen.findByRole('link', { name: 'Asha Shah' })).toHaveAttribute('href', '/coach/clients/client-1');
  expect(screen.getByText('asha@example.test')).toBeInTheDocument();
  expect(screen.getByText('Pending approval')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'absent' } });
  await screen.findByText('No clients match your search.');
  expect(apiRequest).toHaveBeenLastCalledWith('/coach/packages/package-1/clients?offset=0&query=absent');
});
it('retries failed requests and displays an empty package', async () => {
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Network')).mockResolvedValue({ items: [], hasMore: false });
  render(<MemoryRouter><AssignedPackageClients packageId="package-1" /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry assigned clients' }));
  await screen.findByText('No clients are assigned to this package.');
});
