import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest, type Program, type ClientRelationship, type WorkoutTemplate } from '../../lib/api';
import { Collection } from '../../components/collection';
import { ProgramRow } from './program-row';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../../components/exercise-gif', () => ({ ExerciseGif: ({ name }: { name: string }) => <img alt={`${name} demonstration`} /> }));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.mocked(apiRequest).mockImplementation(async path => path.includes('assignment-clients') ? {items:[{id:'client-1',name:'Alex',email:'alex@example.test'}],hasMore:false} : path.includes('/assignments?') ? {items:[],hasMore:false} : {assignments:[{id:'assignment-1'}]});
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const program: Program = { id: 'program-1', client_count: 12, name: 'Strength', description: 'Build strength', status: 'DRAFT', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-02T12:00:00Z', days: [{ templateId: 'workout-1', templateName: 'Upper body', dayLabel: 'Monday', position: 0 }] };
const templates: WorkoutTemplate[] = [{ id: 'workout-1', name: 'Upper body', description: 'Pull session', archived_at: null, exercises: [{ exerciseId: 'row', name: 'Cable row', position: 0, sets: 3, repetitions: 12, durationSeconds: null, restSeconds: 60, targetRpe: 8, tempo: '2-1-2', notes: 'Keep control' }] }];
function setup(status: Program['status'] = 'DRAFT') {
  const onSaved = vi.fn().mockResolvedValue(undefined), onMessage = vi.fn(), onEdit = vi.fn();
  render(<Collection title="Programs" columns={['Name', 'Created at', 'Updated at', 'No. of workouts', 'No. of clients', 'Actions', 'View']}><ProgramRow data-search="Strength" program={{ ...program, status }} templates={templates} clients={[{ clientId: 'client-1', client: { displayName: 'Alex' } }] as ClientRelationship[]} onSaved={onSaved} onMessage={onMessage} onEdit={onEdit}/></Collection>);
  return { onSaved, onMessage, onEdit };
}
it('shows matching table columns, supports searching, and opens numbered workout days', async () => {
  const { onSaved } = setup();
  expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  expect(screen.getByRole('columnheader', {name:'No. of clients'})).toBeInTheDocument();
  expect(screen.getByRole('cell', {name:'12'})).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'strength' } });
  expect(screen.getByRole('button', { name: 'View Strength' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View Strength' }));
  expect(screen.getByRole('dialog')).toHaveClass('editor-dialog-drawer');
  expect(screen.getByRole('heading', { name: '1. Monday' })).toBeInTheDocument();
  expect(screen.getByText('Upper body')).toBeInTheDocument();
  const workoutToggle = screen.getByRole('button', { name: 'Upper body 1 exercises' });
  expect(workoutToggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Cable row')).not.toBeInTheDocument();
  fireEvent.click(workoutToggle);
  expect(workoutToggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('heading', { name: '1. Cable row' })).toBeInTheDocument();
  expect(screen.getByText('60s')).toBeInTheDocument();
  expect(screen.getByText('Keep control')).toBeInTheDocument();
  expect(screen.getByAltText('Cable row demonstration')).toBeInTheDocument();
  fireEvent.click(workoutToggle);
  expect(screen.queryByAltText('Cable row demonstration')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Publish program' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(apiRequest).toHaveBeenCalledWith('/coach/programs/program-1/publish', { method: 'POST' });
});
it('allows editing published programs and assigning from the action menu', async () => {
  const { onEdit } = setup('PUBLISHED');
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Strength' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
  expect(onEdit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Strength' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Assign' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search clients' }), {target:{value:'Alex'}});
  fireEvent.click(await screen.findByRole('checkbox', { name: /Alex/ }));
  await waitFor(() => expect(screen.getByText('Program assigned to Alex.')).toBeInTheDocument());
  expect(apiRequest).toHaveBeenCalledWith('/coach/programs/program-1/assign', { method: 'POST', body: JSON.stringify({ clientIds: ['client-1'] }) });
});
it('requires confirmation and displays deletion errors before allowing retry', async () => {
  const { onMessage } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Strength' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(apiRequest).not.toHaveBeenCalled();
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Please try again'));
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Strength' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete program' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
  expect(onMessage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete program' }));
  await waitFor(() => expect(onMessage).toHaveBeenCalledWith('Program deleted successfully.'));
  expect(apiRequest).toHaveBeenLastCalledWith('/coach/programs/program-1', { method: 'DELETE' });
});
