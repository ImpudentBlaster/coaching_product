import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GlobalNotifications } from './global-notifications';
import { notify } from '../lib/notify';
afterEach(()=>{notify.dismiss();cleanup();document.querySelectorAll('dialog').forEach(dialog=>dialog.remove());});
it('shows all feedback types globally without stealing focus and allows dismissal',async()=>{
  render(<><input aria-label="Search"/><GlobalNotifications/></>);
  screen.getByLabelText('Search').focus();
  notify.success('Program updated successfully.');
  await screen.findByText('Program updated successfully.');
  expect(screen.getByLabelText('Search')).toHaveFocus();
  fireEvent.click(screen.getByRole('button',{name:'Dismiss notification'}));
  await waitFor(()=>expect(screen.queryByText('Program updated successfully.')).not.toBeInTheDocument());
  notify.error('AxiosError: Request failed with status code 500');
  await screen.findByText('Unable to complete this action. Please try again.');
  notify.warning('Some clients could not be assigned.');notify.info('Changes are being processed.');
  await screen.findByText('Some clients could not be assigned.');await screen.findByText('Changes are being processed.');
});
it('keeps a single live toaster when opening and closing a native drawer',async()=>{
  render(<GlobalNotifications/>);
  notify.success('Changes saved.');await screen.findByText('Changes saved.');
  const drawer=document.createElement('dialog');drawer.setAttribute('open','');document.body.appendChild(drawer);
  await waitFor(()=>expect(drawer.querySelector('[data-sonner-toaster]')).toBeInTheDocument());
  expect(screen.getByText('Changes saved.')).toBeInTheDocument();
  drawer.remove();
  await waitFor(()=>expect(document.querySelectorAll('[data-sonner-toaster]')).toHaveLength(1));
  expect(screen.getByText('Changes saved.')).toBeInTheDocument();
});
