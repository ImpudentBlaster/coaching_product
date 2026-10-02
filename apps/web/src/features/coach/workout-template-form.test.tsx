import { GlobalNotifications } from '../../components/global-notifications';
import { notify } from '../../lib/notify';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest, type Exercise } from '../../lib/api';
import { WorkoutTemplateForm } from './workout-template-form';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../../components/exercise-gif', () => ({ ExerciseGif: ({ name }: { name: string }) => <img alt={`${name} demonstration`} /> }));
afterEach(() => { notify.dismiss(); cleanup(); vi.resetAllMocks(); });
const exercises = [
  { id: 'squat', name: 'Squat', target: 'quads' },
  { id: 'row', name: 'Row', target: 'back' },
] as Exercise[];

it('saves multiple exercises with their own settings and resets after success', async () => {
  vi.mocked(apiRequest).mockResolvedValue({});
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<WorkoutTemplateForm exercises={exercises} onSaved={onSaved} onMessage={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Full body' } });
  fireEvent.focus(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: /Squat/ }));
  expect(screen.getByAltText('Squat demonstration')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }));
  fireEvent.focus(screen.getAllByRole('combobox')[1]!);
  fireEvent.click(screen.getByRole('option', { name: /Row/ }));
  fireEvent.change(screen.getAllByLabelText('Sets')[1]!, { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create template' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  const options = vi.mocked(apiRequest).mock.calls[0]![1]!;
  expect(JSON.parse(String(options.body))).toMatchObject({ name: 'Full body', exercises: [
    { exerciseId: 'squat', sets: 3, repetitions: 10, restSeconds: 60, targetRpe: 7 },
    { exerciseId: 'row', sets: 4, repetitions: 10, restSeconds: 60, targetRpe: 7 },
  ] });
  expect(screen.getAllByRole('combobox')).toHaveLength(1);
  expect(screen.getByLabelText('Name')).toHaveValue('');
});

it('keeps remaining exercise settings when removing a row and preserves a failed draft', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('Unable to save'));
  const onMessage = vi.fn();
  render(<WorkoutTemplateForm exercises={exercises} onSaved={vi.fn()} onMessage={onMessage}/>);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Back workout' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add exercise' }));
  fireEvent.focus(screen.getAllByRole('combobox')[1]!);
  fireEvent.click(screen.getByRole('option', { name: /Row/ }));
  fireEvent.change(screen.getAllByLabelText('Sets')[1]!, { target: { value: '5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove exercise 1' }));
  expect(screen.getByRole('combobox')).toHaveValue('Row');
  expect(screen.getByLabelText('Sets')).toHaveValue(5);
  expect(screen.getByRole('button', { name: 'Remove exercise 1' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Create template' }));
  expect(await screen.findByText('Unable to save')).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveValue('Row');
  expect(screen.getByLabelText('Sets')).toHaveValue(5);
});

beforeEach(()=>{render(<GlobalNotifications/>);});
