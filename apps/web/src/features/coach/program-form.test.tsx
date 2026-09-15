import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest, type WorkoutTemplate } from '../../lib/api';
import { ProgramForm } from './program-form';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
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
  fireEvent.click(screen.getByRole('button', { name: 'Add workout' }));
  fireEvent.change(screen.getAllByLabelText('Workout')[1]!, { target: { value: 'lower' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add workout' }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Add workout' }));
  fireEvent.change(screen.getAllByLabelText('Workout')[1]!, { target: { value: 'lower' } });
  fireEvent.change(screen.getAllByLabelText('Day label')[1]!, { target: { value: 'Friday' } });
  fireEvent.click(screen.getByRole('button', { name: 'Remove workout 1' }));
  expect(screen.getByLabelText('Workout')).toHaveValue('lower');
  expect(screen.getByLabelText('Day label')).toHaveValue('Friday');
  expect(screen.getByRole('button', { name: 'Remove workout 1' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Create program' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save');
  expect(screen.getByLabelText('Workout')).toHaveValue('lower');
  expect(screen.getByLabelText('Day label')).toHaveValue('Friday');
});

it('prevents creating a program when no active workouts are available', () => {
  render(<ProgramForm templates={templates.filter(template => template.archived_at)} onSaved={vi.fn()} onMessage={vi.fn()}/>);
  expect(screen.getByRole('button', { name: 'Create program' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add workout' })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'Old workout' })).not.toBeInTheDocument();
});
