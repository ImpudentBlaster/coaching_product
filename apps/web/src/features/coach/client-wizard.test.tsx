import '@testing-library/jest-dom/vitest';
import { parseDate } from '@internationalized/date';
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
import { notify } from '../../lib/notify';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
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
function mockLoad(edit = false, withPackage = false) {
  vi.mocked(apiRequest).mockImplementation(async (path, init) => {
    if (init) return { invitation: { token: 'private-test-token' } };
    if (path === '/coach/packages') return { packages: withPackage ? [{ id: 'bundle', revision: 1, archivedAt: null, data: { name: 'Starter bundle', description: 'Personal coaching', paymentType: 'ONE_TIME', amount: 100, initialAmount: null, currency: 'INR', durationDays: 30, programId: 'program', nutritionPlanId: 'nutrition', supplementPlanId: 'supplement', checkin: { formId: 'form', frequency: 'WEEKLY', occurrences: 4, weekdays: [] } } }] : [] };
    if (path === '/coach/programs')
      return {
        programs: [{ id: 'program', name: 'Strength', status: 'PUBLISHED' }],
      };
    if (path === '/coach/nutrition-library')
      return {
        entries: [
          { id: 'nutrition', data: { kind: 'plans', name: 'Balanced meals' } },
          { id: 'supplement', data: { kind: 'supplements', name: 'Daily supplements' } },
        ],
      };
    if (path === '/coach/checkins/forms')
      return { forms: [{ id: 'form', definition: { name: 'Daily review' } }] };
    if (edit) return { data, revision: 3 };
    throw new Error('Unexpected endpoint');
  });
}
it('blocks today as a birth date with specific feedback before sending setup', async () => {
  mockLoad(true);
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  vi.mocked(apiRequest).mockImplementation((path, init) => path === '/coach/client-setup/client' && !init
    ? Promise.resolve({data:{...data,birthDate:new Date().toISOString().slice(0,10)},revision:3})
    : original(path,init));
  const notification = vi.spyOn(notify,'error').mockReturnValue('birth-date-error');
  render(<ClientWizard clientId="client" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByLabelText('First name');
  fireEvent.submit(screen.getByRole('button',{name:'Next'}).closest('form')!);
  expect(notification).toHaveBeenCalledWith('Date of birth must be in the past. Enter the client’s birth date or leave it blank.');
  expect(vi.mocked(apiRequest).mock.calls.filter(([,init])=>init)).toHaveLength(0);
  expect(screen.getByText('Optional. Date of birth must be before today.')).toBeInTheDocument();
});
it('shows submission failures through notifications and preserves the draft for retry', async () => {
  mockLoad(true);
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  vi.mocked(apiRequest).mockImplementation((path, init) => init
    ? Promise.reject(new Error('Choose an available supplement plan belonging to you.'))
    : original(path,init));
  const notification = vi.spyOn(notify,'error').mockReturnValue('save-error');
  render(<ClientWizard clientId="client" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByLabelText('First name');
  for(let index=0;index<3;index++) fireEvent.click(screen.getByRole('button',{name:'Next'}));
  fireEvent.click(screen.getByRole('button',{name:'Save changes'}));
  await waitFor(()=>expect(notification).toHaveBeenCalledWith('Choose an available supplement plan belonging to you.'));
  expect(screen.queryByRole('button',{name:'Reload setup'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Save changes'})).toBeEnabled();
  expect(screen.getByText('asha@example.test')).toBeInTheDocument();
});
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
  fireEvent.change(selectInput('Nutrition plan'), {
    target: { value: 'nutrition' },
  });
  fireEvent.change(selectInput('Workout program'), {
    target: { value: 'program' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(selectInput('Check-in form'), {
    target: { value: 'form' },
  });
  fireEvent.change(selectInput('Check-in frequency'), {
    target: { value: 'WEEKLY' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  expect(selectInput('Nutrition plan')).toHaveValue('nutrition');
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
it('copies package selections into client setup and allows individual adjustments', async () => {
  mockLoad(true, true);
  render(<ClientWizard clientId="client" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByLabelText('First name');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(selectInput(/^Plan selection/), { target: { value: 'bundle' } });
  expect(selectInput('Nutrition plan')).toHaveValue('nutrition');
  expect(selectInput('Workout program')).toHaveValue('program');
  expect(selectInput('Supplement plan')).toHaveValue('supplement');
  expect(screen.getByLabelText('Membership / package name')).toHaveValue('Starter bundle');
  fireEvent.change(selectInput('Nutrition plan'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(selectInput('Check-in form')).toHaveValue('form');
  expect(selectInput('Check-in frequency')).toHaveValue('WEEKLY');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Client updated');
  const call = vi.mocked(apiRequest).mock.calls.find(([path, init]) => path === '/coach/client-setup/client' && init)!;
  expect(JSON.parse(call[1]!.body as string)).toMatchObject({ data: { packageId: 'bundle', programId: 'program', nutritionPlanId: null, supplementPlanId: 'supplement', membership: { name: 'Starter bundle' }, checkin: { formId: 'form', occurrences: 4 } } });
});

it('keeps the chosen start date and recalculates package renewal when it changes', async () => {
  mockLoad(true, true);
  render(<ClientWizard clientId="client" onClose={vi.fn()} onSaved={vi.fn()} />);
  await screen.findByLabelText('First name');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByLabelText('Record a membership'));
  const dateInput = (label: string) => screen.getByRole('group', { name: label }).querySelector<HTMLInputElement>('input')!;
  fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'day, Start date' }), { key: 'ArrowUp' });
  const chosenStart = dateInput('Start date').value;
  fireEvent.change(selectInput(/^Plan selection/), { target: { value: 'bundle' } });
  expect(dateInput('Start date')).toHaveValue(chosenStart);
  expect(dateInput('End / renewal date')).toHaveValue(parseDate(chosenStart).add({ days: 30 }).toString());
  fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'day, Start date' }), { key: 'ArrowUp' });
  const updatedStart = dateInput('Start date').value;
  expect(updatedStart).not.toBe(chosenStart);
  const renewal = parseDate(updatedStart).add({ days: 30 }).toString();
  expect(dateInput('End / renewal date')).toHaveValue(renewal);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Client updated');
  const call = vi.mocked(apiRequest).mock.calls.find(([path, init]) => path === '/coach/client-setup/client' && init)!;
  expect(JSON.parse(call[1]!.body as string).data.membership).toMatchObject({ startsOn: updatedStart, endsOn: renewal });
});

// Exercise the library's hidden select for HTML form integration.
function selectInput(label: string | RegExp, index = 0) {
  return screen.getAllByLabelText(label)[index]!.closest('.form-control')!.querySelector('select')!;
}
