import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AppLayout } from './app-layout';

vi.mock('../features/auth/auth-context', () => ({
  useAuth: () => ({ user: { displayName: 'Alex', role: 'COACH' }, logout: vi.fn() }),
}));
afterEach(cleanup);

function setup() {
  render(<MemoryRouter initialEntries={['/coach/studio?tab=workouts']}><AppLayout /></MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: 'coach navigation' });
  const sidebar = nav.closest('aside')!;
  return { nav: within(nav), sidebar };
}

it('collapses to five destinations and opens every submenu when the sidebar expands', () => {
  const { nav, sidebar } = setup();
  expect(nav.getAllByRole('button')).toHaveLength(4);
  expect(nav.getAllByRole('link')).toHaveLength(1);
  expect(nav.queryByRole('link', { name: 'Workouts' })).not.toBeInTheDocument();
  fireEvent.pointerEnter(sidebar);
  for (const button of nav.getAllByRole('button')) expect(button).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Clients', 'Foods', 'Workouts', 'Settings']) expect(nav.getByRole('link', { name })).toBeInTheDocument();
  expect(nav.getByRole('link', { name: 'Workouts' })).toHaveAttribute('aria-current', 'page');
  expect(nav.getByRole('link', { name: 'Workouts' })).toHaveClass('active');
  expect(nav.getByRole('button', { name: 'Training' })).not.toHaveClass('active');
  fireEvent.pointerLeave(sidebar);
  expect(nav.queryByRole('link', { name: 'Workouts' })).not.toBeInTheDocument();
  expect(nav.getAllByRole('link')).toHaveLength(1);
  expect(sidebar).toHaveAttribute('data-expanded', 'false');
});

it('keeps all submenus open while hovering, clicking categories and navigating', () => {
  const { nav, sidebar } = setup();
  fireEvent.pointerEnter(sidebar);
  fireEvent.pointerEnter(nav.getByRole('button', { name: 'Nutrition' }));
  expect(nav.getByRole('link', { name: 'Workouts' })).toBeInTheDocument();
  expect(nav.getByRole('link', { name: 'Foods' })).toHaveAttribute('href', '/coach/studio?tab=nutrition&section=foods');
  fireEvent.pointerEnter(nav.getByRole('link', { name: 'Foods' }));
  expect(nav.getByRole('button', { name: 'Nutrition' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(nav.getByRole('link', { name: 'Foods' }));
  expect(nav.getByRole('link', { name: 'Foods' })).toHaveAttribute('aria-current', 'page');
  expect(nav.getByRole('link', { name: 'Foods' })).toHaveClass('active');
  expect(nav.getByRole('button', { name: 'Nutrition' })).not.toHaveClass('active');
  fireEvent.pointerEnter(nav.getByRole('button', { name: 'Coaching' }));
  fireEvent.click(nav.getByRole('button', { name: 'Coaching' }));
  expect(nav.getByRole('link', { name: 'Foods' })).toBeInTheDocument();
  expect(nav.getByRole('link', { name: 'Clients' })).toBeInTheDocument();
  fireEvent.pointerLeave(sidebar);
  expect(nav.queryByRole('link', { name: 'Clients' })).not.toBeInTheDocument();
});
