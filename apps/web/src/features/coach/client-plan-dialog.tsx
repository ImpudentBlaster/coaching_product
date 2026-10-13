import { useEffect, useId, useState, type FormEvent } from 'react';
import { apiRequest, type Exercise, type Program, type WorkoutTemplate } from '../../lib/api';
import { notify } from '../../lib/notify';
import { EditorDialog } from '../../components/editor-dialog';
import { SelectControl } from '../../components/form-controls';
import { ProgramForm } from './program-form';
import { PlanBuilder } from '../nutrition/plan-builder';
import type { NutritionEntry } from '../nutrition/nutrition-details';
import { SupplementPlanForm } from './supplement-studio';

export type ClientPlanKind='program'|'nutrition'|'supplements';
const names={program:'workout program',nutrition:'nutrition plan',supplements:'supplement plan'};
type Option={id:string;name:string;draft?:boolean};
export function ClientPlanDialog({kind,clientId,clientName,create,currentPlan,onClose,onAssigned}:{kind:ClientPlanKind;clientId:string;clientName:string;create:boolean;currentPlan?:{id:string;name:string}|undefined;onClose:()=>void;onAssigned:()=>Promise<void>}) {
  const [creating,setCreating]=useState(create);
  const [options,setOptions]=useState<Option[]>([]);
  const [entries,setEntries]=useState<NutritionEntry[]>([]);
  const [templates,setTemplates]=useState<WorkoutTemplate[]>([]);
  const [exercises,setExercises]=useState<Exercise[]>([]);
  const [selected,setSelected]=useState(currentPlan?.id??'');
  const [newId,setNewId]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [ready,setReady]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const formId=useId();
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    async function load() {
      try {
        if(kind==='program') {
          const [programs,workouts,exerciseList]=await Promise.all([apiRequest<{programs:Program[]}>('/coach/programs'),apiRequest<{templates:WorkoutTemplate[]}>('/coach/workout-templates'),apiRequest<{items:Exercise[]}>('/exercises?limit=50')]);
          if(active){setOptions(programs.programs.filter(p=>p.status==='PUBLISHED'||p.id===newId).map(p=>({id:p.id,name:p.name,draft:p.status==='DRAFT'})));setTemplates(workouts.templates);setExercises(exerciseList.items);}
        } else {
          const library=await apiRequest<{entries:NutritionEntry[]}>('/coach/nutrition-library');
          if(active){setEntries(library.entries);setOptions(library.entries.filter(e=>e.data.kind===(kind==='nutrition'?'plans':'supplements')).map(e=>({id:e.id,name:e.data.name})));}
        }
      }catch(cause){if(active)setError(cause instanceof Error?cause.message:'Unable to load plans.');}
      finally{if(active)setLoading(false);}
    }
    void load();return()=>{active=false;};
  },[kind,newId,attempt]);
  async function created(id?:string) {
    if(!id)throw new Error('The saved plan could not be loaded. Please retry.');
    setNewId(id);setSelected(id);setCreating(false);
    notify.success('Plan created. Review the selection below and assign it to '+clientName+'.');
  }
  async function assign(event:FormEvent) {
    event.preventDefault();if(busy||!selected||selected===currentPlan?.id)return;setBusy(true);
    try {
      if(kind==='program'&&options.find(option=>option.id===selected)?.draft){
        await apiRequest('/coach/programs/'+selected+'/publish',{method:'POST'});
        setOptions(current=>current.map(option=>option.id===selected?{...option,draft:false}:option));
      }
      const path=kind==='program'?'/coach/programs/'+selected+'/assign':'/coach/nutrition-library/'+(kind==='nutrition'?'plans':'supplements')+'/'+selected+'/assign';
      await apiRequest(path,{method:'POST',body:JSON.stringify({clientId})});
      notify.success(names[kind][0]!.toUpperCase()+names[kind].slice(1)+' assigned to '+clientName+'.');
      onClose();await onAssigned();
    }catch(cause){notify.error(cause instanceof Error?cause.message:'Unable to assign plan.');}
    finally{setBusy(false);}
  }
  return <EditorDialog key={creating?'create':'assign'} title={(creating?'Create ':'Assign ')+names[kind]} busy={busy} onClose={onClose} trackChanges={creating}
    headerContent={<p>For {clientName}. {creating?'Save a reusable plan, then assign it to this client.':'This replaces the client’s current '+names[kind]+'.'}</p>}
    {...(creating&&kind==='nutrition'?{footerContent:()=> <button type="submit" form={formId} className="primary" disabled={busy||loading||!ready}>{submitting?'Saving…':'Save nutrition plan'}</button>}: {})}>
    {loading?<p role="status">Loading plan library…</p>:error?<div role="alert"><p>{error}</p><button className="secondary" onClick={()=>setAttempt(value=>value+1)}>Retry plan library</button></div>:creating?
      kind==='program'?<ProgramForm templates={templates} exercises={exercises} onBusy={setBusy} onMessage={()=>{}} onSaved={created}/>:
      kind==='nutrition'?<PlanBuilder entries={entries} onBusy={setBusy} onSaved={created} onMessage={()=>{}} onNavigate={()=>notify.info('Add foods, meals or day templates in the Nutrition library, then retry this editor.')} formId={formId} onReady={setReady} onSubmitting={setSubmitting}/>:
      <SupplementPlanForm onBusy={setBusy} onSaved={created}/>:
      <form onSubmit={assign} className="form-stack"><label>{names[kind][0]!.toUpperCase()+names[kind].slice(1)}<SelectControl aria-label="Plan to assign" required disabled={busy} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a plan</option>{currentPlan&&!options.some(option=>option.id===currentPlan.id)&&<option value={currentPlan.id} disabled>{currentPlan.name} (currently assigned · unavailable in library)</option>}{options.map(option=><option key={option.id} value={option.id}>{option.name}{option.id===currentPlan?.id?' (currently assigned)':''}{option.draft?' (draft)':''}</option>)}</SelectControl></label>
        {selected&&selected===currentPlan?.id&&<p role="status">This is the client’s currently assigned plan. Choose another plan to replace it.</p>}
        {!options.length&&<p>No available plans yet. Create one for this client.</p>}
        <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setCreating(true)}>Create new {names[kind]}</button><button className="primary" disabled={busy||!selected||selected===currentPlan?.id}>{busy?'Assigning…':options.find(option=>option.id===selected)?.draft?'Publish & assign':'Assign '+names[kind]}</button></div>
      </form>}
  </EditorDialog>;
}

