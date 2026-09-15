import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { NutritionStudio } from './nutrition-studio';
import { AssignedNutritionPlan, type NutritionEntry } from '../nutrition/nutrition-details';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const food: NutritionEntry = { id: 'oats', createdAt: '2026-09-07', data: { kind: 'foods', name: 'Oats', notes: '', servingSize: 100, unit: 'g', nutrients: { calories: 400, protein: 10, carbs: 70, fat: 8 } } };

it('creates a meal with multiple food quantities and correct live totals', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ entries: [food], assignments: [] });
  render(<MemoryRouter initialEntries={['/coach/studio?tab=nutrition']}><NutritionStudio clients={[]}/></MemoryRouter>);
  await screen.findByRole('button', { name: 'Add plan' });
  fireEvent.click(screen.getByRole('link', { name: 'Meals' }));
 fireEvent.click(screen.getByRole('button', { name: 'Add meal' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Breakfast' } });
  fireEvent.change(screen.getByLabelText('food'), { target: { value: 'oats' } });
  fireEvent.change(screen.getByLabelText('Quantity (g)'), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add food' }));
  fireEvent.change(screen.getAllByLabelText('food')[1]!, { target: { value: 'oats' } });
  fireEvent.change(screen.getAllByLabelText('Quantity (g)')[1]!, { target: { value: '25' } });
  expect(screen.getByText('300 kcal')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create meal' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/coach/nutrition-library/meals', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Breakfast', notes: '', items: [{ id: 'oats', quantity: 50 }, { id: 'oats', quantity: 25 }], version: 1 }) })));
  await screen.findByText('Nutrition meal created.');
});

it('guides an empty library through the required hierarchy', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ entries: [], assignments: [] });
  render(<MemoryRouter initialEntries={['/coach/studio?tab=nutrition']}><NutritionStudio clients={[]}/></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Add plan' }));
  expect(screen.getByRole('button', { name: 'Create plan' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Go to days' }));
 fireEvent.click(screen.getByRole('button', { name: 'Add day' }));
  fireEvent.click(screen.getByRole('button', { name: 'Go to meals' }));
 fireEvent.click(screen.getByRole('button', { name: 'Add meal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Go to foods' }));
 fireEvent.click(screen.getByRole('button', { name: 'Add food' }));
  expect(screen.getByRole('heading', { name: 'Create food' })).toBeInTheDocument();
});

it('shows an assigned plan with days, meals, food quantities and daily totals', async () => {
  const meal = { kind: 'meals' as const, name: 'Breakfast', notes: '', nutrients: food.data.nutrients, items: [{ id: food.id, quantity: 100, node: food.data, nutrients: food.data.nutrients }] };
  const day = { kind: 'days' as const, name: 'Training day', notes: '', nutrients: food.data.nutrients, items: [{ id: 'meal', label: 'Morning', node: meal }] };
  vi.mocked(apiRequest).mockResolvedValue({ assignment: { snapshot: { kind: 'plans', name: 'Weekly plan', notes: '', items: [{ id: 'day', label: 'Day 1', node: day }] } } });
  render(<AssignedNutritionPlan/>);
  await screen.findByRole('heading', { name: 'Weekly plan' });
  expect(screen.getByText('Day 1 — Training day')).toBeInTheDocument();
  expect(screen.getByText('Morning — Breakfast')).toBeInTheDocument();
  expect(screen.getByText('Oats · 100 g')).toBeInTheDocument();
});
