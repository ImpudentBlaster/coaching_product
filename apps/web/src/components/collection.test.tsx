import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Collection } from './collection';
import { EditorDialog } from './editor-dialog';

afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('paginates, searches across pages, clears search and clamps after deletion',()=>{
  const rows=Array.from({length:21},(_,index)=><article key={index}>Workout {index+1}</article>);
  const {rerender}=render(<Collection title="Workouts">{rows}</Collection>);
  expect(screen.queryByText('Workout 11')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Next page of Workouts'}));
  expect(screen.getByText('Workout 11')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'),{target:{value:'Workout 21'}});
  expect(screen.getByText('Workout 21')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Clear search'}));
  fireEvent.click(screen.getByRole('button',{name:'Next page of Workouts'}));
  fireEvent.click(screen.getByRole('button',{name:'Next page of Workouts'}));
  rerender(<Collection title="Workouts">{rows.slice(0,10)}</Collection>);
  expect(screen.getByText('Workout 1')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Next page of Workouts'})).toBeDisabled();
});
it('shows errors distinctly from empty results and supports retry',()=>{
  const retry=vi.fn();render(<Collection title="Meals" error="Connection unavailable" onRetry={retry}>{[]}</Collection>);
  expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable');
  expect(screen.queryByText('No meals yet')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Try again'}));expect(retry).toHaveBeenCalledOnce();
});
it('protects unsaved input when closing an editor',()=>{
  HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const close=vi.fn();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  render(<EditorDialog title="Edit meal" onClose={close}><label>Name<input/></label></EditorDialog>);
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Lunch'}});
  fireEvent.click(screen.getByRole('button',{name:'Close form'}));expect(close).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Close form'}));expect(close).toHaveBeenCalledOnce();
});
