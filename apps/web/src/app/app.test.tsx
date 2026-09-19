import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from './app';

describe('application shell', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'No session' }), { status: 401, headers: { 'content-type': 'application/json' } }))); });
  it('renders the public home', async () => {
    const memoryRouter = createMemoryRouter(router.routes, { initialEntries: ['/'] });
    render(<RouterProvider router={memoryRouter} />);
    expect(await screen.findByRole('heading', { name: /focused home/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Sign in' })).toHaveLength(2));
  });
});
