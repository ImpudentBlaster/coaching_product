import { useEffect, useId, useState, type FormEvent } from 'react';
import { apiRequest, type Exercise, type Program, type WorkoutTemplate } from '../../lib/api';
import { notify } from '../../lib/notify';
import { EditorDialog } from '../../components/editor-dialog';
import { SelectControl } from '../../components/form-controls';
import { ProgramForm } from './program-form';
import { PlanBuilder } from '../nutrition/plan-builder';
import type { NutritionEntry } from '../nutrition/nutrition-details';
import { SupplementPlanForm, type SupplementEntry } from './supplement-studio';

export type ClientPlanKind='program'|'nutrition'|'supplements';
const names={program:'workout program',nutrition:'nutrition plan',supplements:'supplement plan'};
type Option={id:string;name:string;draft?:boolean};
export function ClientPlanDialog({kind,clientId,clientName,create,edit=false,currentPlan,onClose,onAssigned}:{kind:ClientPlanKind;clientId:string;clientName:string;create:boolean;edit?:boolean;currentPlan?:{id:string;name:string}|undefined;onClose:()=>void;onAssigned:()=>Promise<void>}) {
  const [creating,setCreating]=useState(create||edit);
  const [editingPlan,setEditingPlan]=useState(edit);
  const [applyingEdit,setApplyingEdit]=useState(false);
  const [programs,setPrograms]=useState<Program[]>([]);
  const [supplementEntries,setSupplementEntries]=useState<SupplementEntry[]>([]);
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
          if(active){setPrograms(programs.programs);setOptions(programs.programs.filter(p=>p.status==='PUBLISHED'||p.id===newId).map(p=>({id:p.id,name:p.name,draft:p.status==='DRAFT'})));setTemplates(workouts.templates);setExercises(exerciseList.items);}
        } else {
          const library=await apiRequest<{entries:Array<NutritionEntry|SupplementEntry>}>('/coach/nutrition-library');
          if(active){setEntries(library.entries.filter((e):e is NutritionEntry=>e.data.kind!=='supplements'));setSupplementEntries(library.entries.filter((e):e is SupplementEntry=>e.data.kind==='supplements'));setOptions(library.entries.filter(e=>e.data.kind===(kind==='nutrition'?'plans':'supplements')).map(e=>({id:e.id,name:e.data.name})));}
        }
      }catch(cause){if(active)setError(cause instanceof Error?cause.message:'Unable to load plans.');}
      finally{if(active)setLoading(false);}
    }
    void load();return()=>{active=false;};
  },[kind,newId,attempt]);
  async function created(id?:string) {
    if(!id)throw new Error('The saved plan could not be loaded. Please retry.');
    setApplyingEdit(editingPlan);setNewId(id);setSelected(id);setCreating(false);
    notify.success((editingPlan?'Plan updated.':'Plan created.')+' Review the selection below and assign it to '+clientName+'.');
  }
  async function assign(event:FormEvent) {
    event.preventDefault();if(busy||!selected||(selected===currentPlan?.id&&!applyingEdit))return;setBusy(true);
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
  return <EditorDialog key={creating?'create':'assign'} title={(creating?(editingPlan?'Edit ':'Create '):applyingEdit?'Apply changes to ':'Assign ')+names[kind]} busy={busy} onClose={onClose} trackChanges={creating}
    headerContent={<p>For {clientName}. {creating?(editingPlan?'Edit the reusable plan, then apply its updated version to this client.':'Save a reusable plan, then assign it to this client.'):'This replaces the client’s current '+names[kind]+'.'}</p>}
    {...(creating&&kind==='nutrition'?{footerContent:()=> <button type="submit" form={formId} className="primary" disabled={busy||loading||!ready}>{submitting?'Saving…':'Save nutrition plan'}</button>}: {})}>
    {loading?<p role="status">Loading plan library…</p>:error?<div role="alert"><p>{error}</p><button className="secondary" onClick={()=>setAttempt(value=>value+1)}>Retry plan library</button></div>:creating&&editingPlan&&!(kind==='program'?programs.some(p=>p.id===currentPlan?.id):kind==='nutrition'?entries.some(e=>e.id===currentPlan?.id):supplementEntries.some(e=>e.id===currentPlan?.id))?<p role="alert">This library plan is unavailable for editing. Close this editor and create or assign another plan.</p>:creating?
      kind==='program'?<ProgramForm {...(editingPlan?{initial:programs.find(p=>p.id===currentPlan?.id)}:{})} templates={templates} exercises={exercises} onBusy={setBusy} onMessage={()=>{}} onSaved={created}/>:
      kind==='nutrition'?<PlanBuilder {...(editingPlan?{initial:entries.find(e=>e.id===currentPlan?.id)}:{})} entries={entries} onBusy={setBusy} onSaved={created} onMessage={()=>{}} onNavigate={()=>notify.info('Add foods, meals or day templates in the Nutrition library, then retry this editor.')} formId={formId} onReady={setReady} onSubmitting={setSubmitting}/>:
      <SupplementPlanForm {...(editingPlan?{initial:supplementEntries.find(e=>e.id===currentPlan?.id)!}:{})} onBusy={setBusy} onSaved={created}/>:
      <form onSubmit={assign} className="form-stack"><label>{names[kind][0]!.toUpperCase()+names[kind].slice(1)}<SelectControl aria-label="Plan to assign" required disabled={busy} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a plan</option>{currentPlan&&!options.some(option=>option.id===currentPlan.id)&&<option value={currentPlan.id} disabled>{currentPlan.name} (currently assigned · unavailable in library)</option>}{options.map(option=><option key={option.id} value={option.id}>{option.name}{option.id===currentPlan?.id?' (currently assigned)':''}{option.draft?' (draft)':''}</option>)}</SelectControl></label>
        {selected&&selected===currentPlan?.id&&!applyingEdit&&<p role="status">This is the client’s currently assigned plan. Choose another plan to replace it.</p>}
        {!options.length&&<p>No available plans yet. Create one for this client.</p>}
        <div className="actions">{!currentPlan&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setEditingPlan(false);setCreating(true);}}>Create new {names[kind]}</button>}<button className="primary" disabled={busy||!selected||(selected===currentPlan?.id&&!applyingEdit)}>{busy?'Assigning…':applyingEdit?'Apply changes':options.find(option=>option.id===selected)?.draft?'Publish & assign':'Assign '+names[kind]}</button></div>
      </form>}
  </EditorDialog>;
}

