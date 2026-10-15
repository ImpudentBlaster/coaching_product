import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClientTrainingDetails, ClientNutritionDetails } from './client-plan-details';
vi.mock('./workout-exercise-details', () => ({ WorkoutExerciseDetails: () => <p>Exercise details</p> }));
afterEach(cleanup);
it('shows a workout name once when the day label matches while retaining distinct labels', () => {
  render(<ClientTrainingDetails program={{ id: 'assignment', programId: 'program', assignedAt: '2026-10-07', snapshot: { name: 'Starter', description: 'Training', days: [{ dayLabel: 'Push (MON)', name: 'Push (MON)', exercises: [] }, { dayLabel: 'Tuesday', name: 'Pull', exercises: [] }] } }} />);
  expect(screen.getByText('Push (MON)')).toBeInTheDocument();
  expect(screen.queryByText('Push (MON) — Push (MON)')).not.toBeInTheDocument();
  expect(screen.getByText('Tuesday — Pull')).toBeInTheDocument();
});
it('shows nutrition days using the shared day details without repeating their names', () => {
  render(<ClientNutritionDetails node={{ kind: 'plans', name: 'Starter', notes: 'For beginners', items: [{ id: 'day', label: 'Day 1', node: { kind: 'days', name: 'Day 1', notes: 'Training fuel', nutrients: { calories: 400, protein: 20, carbs: 60, fat: 10 }, items: [] } }] }} />);
  expect(screen.getByText('Day 1')).toBeInTheDocument();
  expect(screen.queryByText('Day 1 — Day 1')).not.toBeInTheDocument();
  expect(screen.getByText('Training fuel')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Day schedule' })).toBeInTheDocument();
});
