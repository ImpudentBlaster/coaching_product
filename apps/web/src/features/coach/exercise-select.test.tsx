import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest, type Exercise } from '../../lib/api';
import { ExerciseSelect } from './exercise-select';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../../components/exercise-gif', () => ({ ExerciseGif: ({ id, name }: { id: string; name: string }) => <img src={`/preview/${id}`} alt={`${name} demonstration`} /> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const exercises = [{ id: 'squat', name: 'Squat', target: 'quads' }] as Exercise[];

it('searches and selects from the same input and submits the selected ID', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [{ id: 'cable-row', name: 'Cable row', target: 'back' }] });
  const { container } = render(<form><ExerciseSelect name="exercise" index={1} exercises={exercises} initialId="squat" initialName="Squat" /></form>);
  const input = screen.getByRole('combobox');
  expect(input).toHaveValue('Squat');
  expect(screen.getByAltText('Squat demonstration')).toHaveAttribute('src', '/preview/squat');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'cable' } });
  expect(await screen.findByRole('option', { name: /Cable row/ })).toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledWith('/exercises?q=cable&limit=50');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue('Cable row');
  expect(screen.getByAltText('Cable row demonstration')).toHaveAttribute('src', '/preview/cable-row');
  expect(screen.queryByAltText('Squat demonstration')).not.toBeInTheDocument();
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(new FormData(container.querySelector('form')!).get('exercise')).toBe('cable-row');
  expect(input).toBeValid();
});

it('preserves the existing selection when an unsuccessful search is dismissed', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [] });
  render(<ExerciseSelect name="exercise" index={1} exercises={exercises} initialId="saved" initialName="Saved exercise" />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'missing' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No matching exercises.'));
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue('Saved exercise');
  expect(input).toBeValid();
});
