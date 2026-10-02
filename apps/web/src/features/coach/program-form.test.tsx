import { GlobalNotifications } from '../../components/global-notifications';
import { notify } from '../../lib/notify';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiRequest, type WorkoutTemplate } from '../../lib/api';
import { ProgramForm } from './program-form';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../../components/exercise-gif', () => ({ ExerciseGif: () => <span>GIF</span> }));
afterEach(() => { notify.dismiss(); cleanup(); vi.resetAllMocks(); });
const templates: WorkoutTemplate[] = [
  { id: 'upper', name: 'Upper body', description: '', archived_at: null, exercises: [] },
  { id: 'lower', name: 'Lower body', description: '', archived_at: null, exercises: [] },
  { id: 'old', name: 'Old workout', description: '', archived_at: '2026-09-06', exercises: [] },
];

it('saves ordered workouts with separate labels, allows repeats, and resets after success', async () => {
  vi.mocked(apiRequest).mockResolvedValue({});
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<ProgramForm templates={templates} onSaved={onSaved} onMessage={vi.fn()}/>);
  expect(screen.queryByRole('option', { name: 'Old workout' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Weekly plan' } });
  fireEvent.change(screen.getByLabelText('Workout'), { target: { value: 'upper' } });
  fireEvent.change(screen.getByLabelText('Day label'), { target: { value: 'Monday' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add day' }));
  fireEvent.change(screen.getAllByLabelText('Workout')[1]!, { target: { value: 'lower' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add day' }));
  fireEvent.change(screen.getAllByLabelText('Workout')[2]!, { target: { value: 'upper' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create program' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(vi.mocked(apiRequest).mock.calls[0]![0]).toBe('/coach/programs');
  expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[0]![1]!.body))).toEqual({
    name: 'Weekly plan', description: '', days: [
      { templateId: 'upper', dayLabel: 'Monday' },
      { templateId: 'lower', dayLabel: 'Day 2' },
      { templateId: 'upper', dayLabel: 'Day 3' },
    ],
  });
  expect(screen.getAllByLabelText('Workout')).toHaveLength(1);
  expect(screen.getByLabelText('Name')).toHaveValue('');
  expect(screen.getByLabelText('Day label')).toHaveValue('Day 1');
});

it('preserves remaining rows on removal and retains the draft after a failed save', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('Unable to save'));
  const onMessage = vi.fn();
  render(<ProgramForm templates={templates} onSaved={vi.fn()} onMessage={onMessage}/>);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Weekly plan' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add day' }));
  fireEvent.change(screen.getAllByLabelText('Workout')[1]!, { target: { value: 'lower' } });
  fireEvent.change(screen.getAllByLabelText('Day label')[1]!, { target: { value: 'Friday' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove day 1' }));
  expect(screen.getByLabelText('Workout')).toHaveValue('lower');
  expect(screen.getByLabelText('Day label')).toHaveValue('Friday');
  expect(screen.getByRole('button', { name: 'Remove day 1' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Create program' }));
  expect(await screen.findByText('Unable to save')).toBeInTheDocument();
  expect(screen.getByLabelText('Workout')).toHaveValue('lower');
  expect(screen.getByLabelText('Day label')).toHaveValue('Friday');
});

it('allows manual exercise days when no active workouts are available', () => {
  render(<ProgramForm templates={templates.filter(template => template.archived_at)} onSaved={vi.fn()} onMessage={vi.fn()}/>);
  expect(screen.getByRole('button', { name: 'Create program' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Add day' })).toBeEnabled();
  expect(screen.getByLabelText('Day exercises')).toHaveValue('manual');
  expect(screen.queryByRole('option', { name: 'Old workout' })).not.toBeInTheDocument();
});

it('saves manual exercises and an existing workout as separate program days', async () => {
  vi.mocked(apiRequest).mockResolvedValue({});
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<ProgramForm templates={templates} exercises={[{ id: 'squat', name: 'Squat', target: 'quads', bodyPart: 'legs', equipment: 'body weight', secondaryMuscles: [], instructions: ['Squat slowly.'], gifAvailable: true }]} onSaved={onSaved} onMessage={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Mixed program' } });
  fireEvent.change(screen.getByLabelText('Day exercises'), { target: { value: 'manual' } });
  fireEvent.focus(screen.getByRole('combobox', { name: 'Exercise 1' }));
  fireEvent.click(screen.getByRole('option', { name: 'Squat quads' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add day' }));
  fireEvent.change(screen.getByLabelText('Workout'), { target: { value: 'upper' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create program' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[0]![1]!.body))).toEqual({ name: 'Mixed program', description: '', days: [{ dayLabel: 'Day 1', exercises: [{ exerciseId: 'squat', sets: 3, repetitions: 10, restSeconds: 60, targetRpe: 7, notes: '', durationSeconds: null, tempo: null }] }, { dayLabel: 'Day 2', templateId: 'upper' }] });
});

it('restores manual day exercises and preserves duration and tempo when editing', async () => {
  vi.mocked(apiRequest).mockResolvedValue({});
  const manual: WorkoutTemplate = { id: 'manual-day', name: 'Day 1', description: '', archived_at: null, program_day_only: true, exercises: [{ exerciseId: 'squat', name: 'Squat', position: 0, sets: 4, repetitions: 8, durationSeconds: 30, restSeconds: 90, targetRpe: 8, tempo: '3-1-1', notes: 'Control the descent.' }] };
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<ProgramForm templates={[...templates, manual]} initial={{ id: 'program', name: 'Weekly plan', description: '', status: 'PUBLISHED', days: [{ templateId: manual.id, templateName: manual.name, manual: true, dayLabel: 'Monday', position: 0 }] }} onSaved={onSaved} onMessage={vi.fn()}/>);
  expect(screen.getByLabelText('Day exercises')).toHaveValue('manual');
  expect(screen.getByRole('combobox', { name: 'Exercise 1' })).toHaveValue('Squat');
  expect(screen.getByLabelText('Sets')).toHaveValue(4);
  expect(screen.getByLabelText('Notes')).toHaveValue('Control the descent.');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(apiRequest).toHaveBeenCalledWith('/coach/programs/program', expect.objectContaining({ method: 'PUT' }));
  expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[0]![1]!.body)).days[0].exercises[0]).toMatchObject({ exerciseId: 'squat', durationSeconds: 30, tempo: '3-1-1', sets: 4 });
});

beforeEach(()=>{render(<GlobalNotifications/>);});
