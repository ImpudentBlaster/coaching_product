import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { notify } from '../../lib/notify';
import { ClientPlanDialog, type ClientPlanKind } from './client-plan-dialog';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
afterEach(()=>{cleanup();vi.resetAllMocks();notify.dismiss();});
it('edits an assigned supplement plan and applies its updated snapshot to this client',async()=>{
  const entry={id:'current',version:3,data:{kind:'supplements',name:'Daily supplements',notes:'',supplements:[{name:'Example',timing:'Breakfast',dosage:'Original dose',link:''}]}};
  vi.mocked(apiRequest).mockImplementation(async(_path,init)=>init?.method==='PUT'?{entry}:{entries:[entry]});
  const assigned=vi.fn().mockResolvedValue(undefined);
  render(<MemoryRouter><ClientPlanDialog kind="supplements" create={false} edit currentPlan={{id:'current',name:'Daily supplements'}} clientId="client" clientName="Taylor" onClose={vi.fn()} onAssigned={assigned}/></MemoryRouter>);
  const dosage=await screen.findByLabelText('Dosage');
  expect(dosage).toHaveValue('Original dose');
  fireEvent.change(dosage,{target:{value:'Updated dose'}});
  fireEvent.click(screen.getByRole('button',{name:'Save supplement plan'}));
  const apply=await screen.findByRole('button',{name:'Apply changes'});
  await waitFor(()=>expect(apply).toBeEnabled());
  fireEvent.click(apply);
  await waitFor(()=>expect(assigned).toHaveBeenCalledOnce());
  expect(apiRequest).toHaveBeenCalledWith('/coach/nutrition-library/supplements/current',expect.objectContaining({method:'PUT',body:expect.stringContaining('"version":3')}));
  expect(apiRequest).toHaveBeenCalledWith('/coach/nutrition-library/supplements/current/assign',{method:'POST',body:JSON.stringify({clientId:'client'})});
});
it('preselects the current plan and requires a different selection before reassignment',async()=>{
  vi.mocked(apiRequest).mockResolvedValue({entries:[{id:'current',data:{kind:'plans',name:'Starter plan'}},{id:'other',data:{kind:'plans',name:'Next plan'}}]});
  render(<MemoryRouter><ClientPlanDialog kind="nutrition" create={false} currentPlan={{id:'current',name:'Starter plan'}} clientId="client" clientName="Taylor" onClose={vi.fn()} onAssigned={vi.fn()}/></MemoryRouter>);
  const control=await screen.findByLabelText('Plan to assign');
  expect(control.closest('.form-control')!.querySelector('select')).toHaveValue('current');
  expect(control).toHaveTextContent('Starter plan (currently assigned)');
  expect(screen.getByRole('button',{name:'Assign nutrition plan'})).toBeDisabled();
  fireEvent.change(control.closest('.form-control')!.querySelector('select')!,{target:{value:'other'}});
  expect(screen.getByRole('button',{name:'Assign nutrition plan'})).toBeEnabled();
});
for(const kind of ['program','nutrition','supplements'] as ClientPlanKind[]) {
  it('assigns an existing '+kind+' plan to the current client',async()=>{
    vi.mocked(apiRequest).mockImplementation(async(path,init)=>{
      if(init)return {};
      if(path==='/coach/programs')return {programs:[{id:'plan',name:'Training',status:'PUBLISHED'}]};
      if(path==='/coach/workout-templates')return {templates:[]};
      if(path.startsWith('/exercises'))return {items:[]};
      return {entries:[{id:'plan',data:{kind:kind==='nutrition'?'plans':'supplements',name:'Routine'}}]};
    });
    const assigned=vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><ClientPlanDialog kind={kind} create={false} clientId="current-client" clientName="Taylor" onClose={vi.fn()} onAssigned={assigned}/></MemoryRouter>);
    const control=await screen.findByLabelText('Plan to assign');
    fireEvent.change(control.closest('.form-control')!.querySelector('select')!,{target:{value:'plan'}});
    fireEvent.click(screen.getByRole('button',{name:'Assign '+(kind==='program'?'workout program':kind==='nutrition'?'nutrition plan':'supplement plan')}));
    await waitFor(()=>expect(assigned).toHaveBeenCalledOnce());
    const path=kind==='program'?'/coach/programs/plan/assign':'/coach/nutrition-library/'+(kind==='nutrition'?'plans':'supplements')+'/plan/assign';
    expect(apiRequest).toHaveBeenCalledWith(path,{method:'POST',body:JSON.stringify({clientId:'current-client'})});
  });
}
it('creates a supplement plan here and retries assignment without creating it twice',async()=>{
  let created=false;let fail=true;
  vi.mocked(apiRequest).mockImplementation(async(path,init)=>{
    if(init?.method==='POST'&&path.endsWith('/supplements')) {created=true;return {entry:{id:'new-plan'}};}
    if(init?.method==='POST'&&path.endsWith('/assign')) {if(fail)throw new Error('Please retry assignment');return {};}
    return {entries:created?[{id:'new-plan',data:{kind:'supplements',name:'Client routine'}}]:[]};
  });
  const assigned=vi.fn().mockResolvedValue(undefined);
  render(<MemoryRouter><ClientPlanDialog kind="supplements" create clientId="current-client" clientName="Taylor" onClose={vi.fn()} onAssigned={assigned}/></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('Title'),{target:{value:'Client routine'}});
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Example'}});
  fireEvent.change(screen.getByLabelText('Timings'),{target:{value:'Breakfast'}});
  fireEvent.change(screen.getByLabelText('Dosage'),{target:{value:'Recorded amount'}});
  fireEvent.click(screen.getByRole('button',{name:'Save supplement plan'}));
  await screen.findByLabelText('Plan to assign');
  fireEvent.click(screen.getByRole('button',{name:'Assign supplement plan'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Assign supplement plan'})).toBeEnabled());
  expect(assigned).not.toHaveBeenCalled();
  fail=false;
  fireEvent.click(screen.getByRole('button',{name:'Assign supplement plan'}));
  await waitFor(()=>expect(assigned).toHaveBeenCalledOnce());
  expect(vi.mocked(apiRequest).mock.calls.filter(([path,init])=>path.endsWith('/supplements')&&init?.method==='POST')).toHaveLength(1);
});

