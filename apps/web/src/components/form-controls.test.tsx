import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DateControl, SelectControl } from './form-controls';
import { EditorDialog } from './editor-dialog';

afterEach(cleanup);

it('renders modal dropdown options inside the owning native dialog', async () => {
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  render(<EditorDialog title="Assign plan" onClose={vi.fn()}><SelectControl aria-label="Plan"><option value="one">First plan</option><option value="two">Second plan</option></SelectControl></EditorDialog>);
  fireEvent.click(screen.getByRole('button',{name:/Plan/}));
  const list=await screen.findByRole('listbox');
  expect(list.closest('dialog')).toBe(screen.getByRole('dialog',{name:'Assign plan'}));
  fireEvent.click(screen.getByRole('option',{name:'Second plan'}));
  expect(screen.getByRole('button',{name:/Plan/})).toHaveTextContent('Second plan');
});

it('shows DD-MM-YYYY placeholders and pads single-digit dates', () => {
  const view = render(<DateControl aria-label="Date" />);
  const text = () => [...view.container.querySelectorAll('.picker-segment')].map(segment => segment.textContent).join('');
  expect(text()).toBe('DD-MM-YYYY');
  view.unmount();
  const populated = render(<DateControl aria-label="Date" defaultValue="2026-01-05" />);
  expect([...populated.container.querySelectorAll('.picker-segment')].map(segment => segment.textContent).join('')).toBe('05-01-2026');
});

it('submits selected string values and resets an uncontrolled select', () => {
  const { container } = render(<form><SelectControl aria-label="Plan" name="plan" defaultValue=""><option value="">None</option><option value="strength">Strength</option></SelectControl></form>);
  const form = container.querySelector('form')!;
  const select = container.querySelector('select')!;
  fireEvent.change(select, { target: { value: 'strength' } });
  expect(new FormData(form).get('plan')).toBe('strength');
  fireEvent.reset(form);
  expect(new FormData(form).get('plan')).toBe('');
});

it('passes controlled changes back to the screen and preserves disabled options', async () => {
  const change = vi.fn();
  render(<SelectControl aria-label="Status" value="active" onChange={change}><option value="active">Active</option><option value="draft">Draft</option><option value="paused" disabled>Paused</option></SelectControl>);
  fireEvent.click(screen.getByRole('button', { name: /Status/ }));
  expect(await screen.findByRole('option', { name: 'Paused' })).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(screen.getByRole('option', { name: 'Draft' }));
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ target: { value: 'draft' } }));
});

it('preserves date-only form values and exposes a calendar', async () => {
  const { container } = render(<form><DateControl aria-label="Start date" name="date" defaultValue="2026-10-11" min="2026-10-01" max="2026-10-31" required /></form>);
  expect(new FormData(container.querySelector('form')!).get('date')).toBe('2026-10-11');
  expect([...container.querySelectorAll('.picker-segment')].map(segment => segment.textContent).join('')).toBe('11-10-2026');
  fireEvent.click(screen.getByRole('button', { name: /Open calendar/ }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
});

it('keeps required validation and follows disabled fieldsets', async () => {
  const view = render(<form><fieldset><SelectControl aria-label="Plan" name="plan" required defaultValue=""><option value="">Choose plan</option><option value="one">One</option></SelectControl><DateControl aria-label="Date" name="date" required /></fieldset></form>);
  expect(view.container.querySelector('form')!.checkValidity()).toBe(false);
  view.rerender(<form><fieldset disabled><SelectControl aria-label="Plan" name="plan" required defaultValue=""><option value="">Choose plan</option><option value="one">One</option></SelectControl><DateControl aria-label="Date" name="date" required /></fieldset></form>);
  await waitFor(() => expect(screen.getByRole('button', { name: /Open calendar/ })).toBeDisabled());
  expect(screen.getAllByRole('spinbutton').every(element => element.getAttribute('aria-disabled') === 'true')).toBe(true);
});
