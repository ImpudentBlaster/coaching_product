import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BirthDatePicker } from './birth-date-picker';
afterEach(cleanup);
it('selects historical dates directly, handles leap years and clears optional dates',()=>{
  const change=vi.fn();
  render(<BirthDatePicker value={null} onChange={change}/>);
  fireEvent.change(screen.getByLabelText('Birth year'),{target:{value:'2000'}});
  fireEvent.change(screen.getByLabelText('Birth month'),{target:{value:'02'}});
  fireEvent.change(screen.getByLabelText('Birth day'),{target:{value:'29'}});
  expect(change).toHaveBeenLastCalledWith('2000-02-29');
  fireEvent.change(screen.getByLabelText('Birth year'),{target:{value:'2001'}});
  expect(screen.getByLabelText('Birth day')).toHaveValue('');
  expect(screen.getByLabelText('Birth day')).toBeRequired();
  expect(screen.getByLabelText('Birth day').querySelector('option[value="29"]')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Clear birth date'}));
  expect(change).toHaveBeenLastCalledWith(null);
  expect(screen.getByLabelText('Birth day')).not.toBeRequired();
});
it('disables today and future days',()=>{
  const today=new Date().toISOString().slice(0,10);
  render(<BirthDatePicker value={today} onChange={vi.fn()}/>);
  expect(screen.getByLabelText('Birth day').querySelector('option[value="'+today.slice(8,10)+'"]')).toBeDisabled();
});

