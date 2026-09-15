vi.mock('./checkin-photos',()=>({CheckinPhotos:()=>null}));
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {apiRequest} from '../../lib/api';
import {ClientCheckin} from './client-checkin';
import type {Checkin} from './checkin-types';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const checkin:Checkin={id:'checkin',clientId:'client',clientName:'Client',dueDate:'2026-09-20',notes:'Weekly review',formId:null,form:{name:'Weekly check-in',fields:[{id:'weight',label:'Weight',type:'NUMBER',required:true,min:1,max:500},{id:'notes',label:'Notes',type:'LONG_TEXT',required:false}]},status:'DRAFT',data:{weight:70,notes:'Saved draft'},revision:2,submittedAt:null,reviewedAt:null,reviewStatus:null,reviewNotes:null,flags:[]};
it('loads the saved draft and submits the latest unsaved answers atomically',async()=>{
  vi.mocked(apiRequest).mockResolvedValue({});const onSaved=vi.fn().mockResolvedValue(undefined);
  render(<ClientCheckin checkin={checkin} onSaved={onSaved}/>);
  expect(screen.getByLabelText('Weight *')).toHaveValue(70);
  expect(screen.getByLabelText('Notes')).toHaveValue('Saved draft');
  fireEvent.change(screen.getByLabelText('Weight *'),{target:{value:'72.5'}});
  fireEvent.click(screen.getByRole('button',{name:'Submit check-in'}));
  await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce());
  expect(apiRequest).toHaveBeenCalledWith('/client/checkins/checkin/submit',{method:'POST',body:JSON.stringify({revision:2,answers:{weight:72.5,notes:'Saved draft'}})});
});
it('retains answers on a failed save and allows incomplete drafts',async()=>{
  vi.mocked(apiRequest).mockRejectedValue(new Error('Draft changed. Reload.'));
  render(<ClientCheckin checkin={checkin} onSaved={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Weight *'),{target:{value:''}});
  fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Notes')).toHaveValue('Saved draft');
  expect(apiRequest).toHaveBeenCalledWith('/client/checkins/checkin',{method:'PUT',body:JSON.stringify({revision:2,answers:{notes:'Saved draft'}})});
});
it('locks submitted answers and shows coach review feedback',()=>{
  render(<ClientCheckin checkin={{...checkin,status:'REVIEWED',reviewStatus:'ON_TRACK',reviewNotes:'Good progress'}} onSaved={vi.fn()}/>);
  expect(screen.getByLabelText('Weight *')).toBeDisabled();
  expect(screen.queryByRole('button',{name:'Submit check-in'})).not.toBeInTheDocument();
  expect(screen.getByText('Good progress')).toBeInTheDocument();
});
