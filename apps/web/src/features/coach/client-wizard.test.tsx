import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { ClientWizard } from './client-wizard';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const data = {
  firstName: 'Asha',
  lastName: 'Shah',
  email: 'asha@example.test',
  birthDate: '1990-01-01',
  phone: '123456',
  weightUnit: 'KG',
  exerciseUnit: 'KG',
  programId: null,
  nutritionPlanId: null,
  membership: null,
  checkin: null,
};
function mockLoad(edit = false) {
  vi.mocked(apiRequest).mockImplementation(async (path, init) => {
    if (init) return { invitation: { token: 'private-test-token' } };
    if (path === '/coach/programs')
      return {
        programs: [{ id: 'program', name: 'Strength', status: 'PUBLISHED' }],
      };
    if (path === '/coach/nutrition-library')
      return {
        entries: [
          { id: 'nutrition', data: { kind: 'plans', name: 'Balanced meals' } },
        ],
      };
    if (path === '/coach/checkins/forms')
      return { forms: [{ id: 'form', definition: { name: 'Daily review' } }] };
    if (edit) return { data, revision: 3 };
    throw new Error('Unexpected endpoint');
  });
}
it('keeps selections between steps and creates the invitation only after review', async () => {
  mockLoad();
  const onSaved = vi.fn().mockResolvedValue(undefined);
  render(<ClientWizard onClose={vi.fn()} onSaved={onSaved} />);
  await screen.findByLabelText('First name');
  fireEvent.change(screen.getByLabelText('First name'), {
    target: { value: 'Asha' },
  });
  fireEvent.change(screen.getByLabelText('Last name'), {
    target: { value: 'Shah' },
  });
  fireEvent.change(screen.getByLabelText(/^Email/), {
    target: { value: 'asha@example.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByLabelText('Nutrition plan'), {
    target: { value: 'nutrition' },
  });
  fireEvent.change(screen.getByLabelText('Workout program'), {
    target: { value: 'program' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByLabelText('Check-in form'), {
    target: { value: 'form' },
  });
  fireEvent.change(screen.getByLabelText('Check-in frequency'), {
    target: { value: 'WEEKLY' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(screen.getByLabelText('Nutrition plan')).toHaveValue('nutrition');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Balanced meals')).toBeInTheDocument();
  expect(
    vi.mocked(apiRequest).mock.calls.filter(([, init]) => init),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(screen.getByLabelText(/^Registration link/)).toHaveValue(
    window.location.origin + '/register/client?invite=private-test-token',
  );
  const call = vi
    .mocked(apiRequest)
    .mock.calls.find(([path, init]) => path === '/coach/client-setup' && init)!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({
    firstName: 'Asha',
    nutritionPlanId: 'nutrition',
    programId: 'program',
    checkin: { frequency: 'WEEKLY', weekdays: [1, 5] },
  });
});
it('prefills the update flow and sends its revision without creating another invitation', async () => {
  mockLoad(true);
  render(
    <ClientWizard clientId="client" onClose={vi.fn()} onSaved={vi.fn()} />,
  );
  expect(await screen.findByLabelText('First name')).toHaveValue('Asha');
  expect(screen.getByLabelText(/^Email/)).toHaveAttribute('readonly');
  fireEvent.change(screen.getByLabelText('Phone'), {
    target: { value: '999' },
  });
  for (let step = 0; step < 3; step++)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Client updated');
  expect(apiRequest).toHaveBeenCalledWith('/coach/client-setup/client', {
    method: 'PUT',
    body: JSON.stringify({ data: { ...data, phone: '999' }, revision: 3 }),
  });
});
