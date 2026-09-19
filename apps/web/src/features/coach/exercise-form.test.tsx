import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { ExerciseForm } from './exercise-form';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function fill() {
  for (const [label, value] of [['Exercise name', 'Shoulder press'], ['Body part', 'shoulders'], ['Equipment', 'dumbbell'], ['Target muscle', 'delts'], ['Step 1', 'Sit upright.']]) fireEvent.change(screen.getByLabelText(label!), { target: { value } });
}
it('saves the import-compatible shape with ordered instruction steps', async () => {
  const onSaved = vi.fn();
  vi.mocked(apiRequest).mockImplementation(async (_path, init) => init?.method === 'POST' ? { exercise: { id: 'new', name: 'Shoulder press' } } : { bodyParts: [], equipment: [], targets: [] });
  render(<ExerciseForm onSaved={onSaved} onBusy={vi.fn()} />);
  fill();
  fireEvent.change(screen.getByLabelText(/^Secondary muscles/), { target: { value: 'triceps, upper chest' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add instruction step' }));
  fireEvent.change(screen.getByLabelText('Step 2'), { target: { value: 'Press up.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save exercise' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  const init = vi.mocked(apiRequest).mock.calls.find(call => call[1]?.method === 'POST')![1]!;
  expect(JSON.parse(String(init.body))).toEqual({ name: 'Shoulder press', bodyPart: 'shoulders', equipment: 'dumbbell', target: 'delts', secondaryMuscles: ['triceps', 'upper chest'], instructions: ['Sit upright.', 'Press up.'] });
});
it('retains the draft and re-enables submission after a failed save', async () => {
  vi.mocked(apiRequest).mockImplementation(async (_path, init) => { if (init?.method === 'POST') throw new Error('Connection failed'); return { bodyParts: [], equipment: [], targets: [] }; });
  render(<ExerciseForm onSaved={vi.fn()} onBusy={vi.fn()} />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Save exercise' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed');
  expect(screen.getByLabelText('Exercise name')).toHaveValue('Shoulder press');
  expect(screen.getByRole('button', { name: 'Save exercise' })).toBeEnabled();
});
