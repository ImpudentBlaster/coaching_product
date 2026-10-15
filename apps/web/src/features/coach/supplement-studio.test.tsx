import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { NutritionStudio } from './nutrition-studio';
import { SupplementDetails } from './supplement-studio';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('creates repeatable standalone supplement rows within Nutrition',async()=>{
  vi.mocked(apiRequest).mockResolvedValue({entries:[],assignments:[],supplementAssignments:[]});
  render(<MemoryRouter initialEntries={['/coach/studio?tab=nutrition&section=supplements']}><NutritionStudio clients={[]}/></MemoryRouter>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Add supplement plan'})).toBeEnabled());
  expect(screen.queryByRole('table',{name:'Nutrition plans'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Add supplement plan'}));
  fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Travel supplements'}});
  const first=screen.getByRole('group',{name:'Supplement 1'});
  fireEvent.change(within(first).getByLabelText('Name'),{target:{value:'Example'}});
  fireEvent.change(within(first).getByLabelText('Timings'),{target:{value:'Breakfast'}});
  fireEvent.change(within(first).getByLabelText('Dosage'),{target:{value:'Recorded amount'}});
  fireEvent.click(screen.getByRole('button',{name:'Add supplement'}));
  const second=screen.getByRole('group',{name:'Supplement 2'});
  fireEvent.change(within(second).getByLabelText('Name'),{target:{value:'Another'}});
  fireEvent.change(within(second).getByLabelText('Timings'),{target:{value:'Dinner'}});
  fireEvent.change(within(second).getByLabelText('Dosage'),{target:{value:'Other amount'}});
  fireEvent.click(screen.getByRole('button',{name:'Save supplement plan'}));
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('/coach/nutrition-library/supplements',{method:'POST',body:JSON.stringify({kind:'supplements',name:'Travel supplements',notes:'',supplements:[{name:'Example',timing:'Breakfast',dosage:'Recorded amount',link:''},{name:'Another',timing:'Dinner',dosage:'Other amount',link:''}]})}));
});
it('renders assigned supplement information and permits only web purchase links',()=>{
  render(<SupplementDetails plan={{kind:'supplements',name:'Daily routine',notes:'Notes',supplements:[{name:'First',timing:'Breakfast',dosage:'Recorded dose',link:'https://example.com/item'},{name:'Second',timing:'Dinner',dosage:'Other dose',link:'javascript:alert(1)'}]}}/>);
  expect(screen.getByText('Breakfast')).toBeInTheDocument();
  expect(screen.getByText('Recorded dose')).toBeInTheDocument();
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link')).toHaveAttribute('rel','noopener noreferrer');
});

