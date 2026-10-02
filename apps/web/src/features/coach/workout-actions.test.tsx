import { GlobalNotifications } from '../../components/global-notifications';
import { notify } from '../../lib/notify';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest, type WorkoutTemplate } from '../../lib/api';
import { WorkoutActions } from './workout-actions';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../../components/exercise-gif', () => ({ ExerciseGif: ({ name }: { name: string }) => <img alt={`${name} demonstration`} /> }));
beforeEach(() => { render(<GlobalNotifications/>);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { notify.dismiss(); cleanup(); vi.resetAllMocks(); });
const workout: WorkoutTemplate = { id: 'workout-1', name: 'Upper body', description: 'Strength session', archived_at: null,
  exercises: [{ exerciseId: 'row', name: 'Cable row', instructions: ['Pull the handle toward your torso.', 'Return with control.'], position: 1, sets: 3, repetitions: 10, durationSeconds: null, restSeconds: 60, targetRpe: 7, tempo: '2-1-2', notes: 'Keep your chest tall.' }] };
function setup() {
  const onEdit = vi.fn(), onMessage = vi.fn(), onDeleted = vi.fn().mockResolvedValue(undefined);
  render(<WorkoutActions workout={workout} onEdit={onEdit} onDeleted={onDeleted} onMessage={onMessage}/>);
  return { onEdit, onMessage, onDeleted };
}

it('opens workout details in a drawer and allows editing', () => {
  const { onEdit } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'View Upper body' }));
  const dialog = screen.getByRole('dialog', { name: 'Workout details' });
  expect(dialog).toHaveClass('editor-dialog-drawer');
  expect(within(dialog).getByText('Strength session')).toBeInTheDocument();
  expect(within(dialog).getByRole('heading', { name: 'Cable row' })).toBeInTheDocument();
  expect(within(dialog).getByText('60s')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Instructions'));
  expect(screen.getByText('Pull the handle toward your torso.')).toBeVisible();
  expect(screen.getByText('Return with control.')).toBeVisible();
  expect(within(dialog).getByText('Keep your chest tall.')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Edit workout' }));
  expect(onEdit).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('requires confirmation, blocks repeat requests and announces success only after deletion', async () => {
  let complete!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const { onMessage, onDeleted } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Upper body' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(apiRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(apiRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Upper body' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete workout' }));
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
  expect(onMessage).not.toHaveBeenCalled();
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith('/coach/workout-templates/workout-1', { method: 'DELETE' });
  complete(undefined);
  await waitFor(() => expect(onMessage).toHaveBeenCalledWith('Workout deleted successfully.'));
  expect(onDeleted).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('keeps a failed deletion in the confirmation popup for retry', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('Unable to delete workout'));
  const { onMessage, onDeleted } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Upper body' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete workout' }));
  expect(await screen.findByText('Unable to delete workout')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete workout' })).toBeEnabled();
  expect(onMessage).not.toHaveBeenCalled();
  expect(onDeleted).not.toHaveBeenCalled();
});

it('loads library instructions when an older workout response omitted them', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [{ id: 'row', instructions: ['Pull with control.'] }] });
  render(<WorkoutActions workout={{ ...workout, exercises: workout.exercises.map(exercise => { const copy = { ...exercise }; delete copy.instructions; return copy; }) }} onEdit={vi.fn()} onDeleted={vi.fn()} onMessage={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'View Upper body' }));
  const summary = screen.getByText('Instructions');
  const details = summary.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect(await screen.findByText('Pull with control.')).toBeVisible();
  expect(apiRequest).toHaveBeenCalledWith('/exercises?q=Cable%20row&limit=50');
});
