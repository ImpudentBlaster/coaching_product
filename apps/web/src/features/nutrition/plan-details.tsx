import { useState, type FormEvent } from 'react';
import { apiRequest, type ClientRelationship } from '../../lib/api';
import { notify } from '../../lib/notify';
import { EditorDialog } from '../../components/editor-dialog';
import { DayContent } from './day-details';
import type { NutritionEntry } from './nutrition-details';

export type NutritionAssignment={id:string;clientId:string;planId:string};
export function PlanDetails({plan,clients,assignments,onClose,onEdit,onAssigned}:{plan:NutritionEntry;clients:ClientRelationship[];assignments:NutritionAssignment[];onClose:()=>void;onEdit:()=>void;onAssigned:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false);
  const days=plan.data.items??[];
  return <EditorDialog title="Plan details" variant="drawer" trackChanges={false} busy={busy} onClose={onClose}
    headerContent={<div className="workout-details-heading"><div><h3>{plan.data.name}</h3><p>{days.length} {days.length===1?'day':'days'}</p></div><button type="button" className="primary" disabled={busy} onClick={onEdit}>Edit plan</button></div>}>
    <div className="detail-view meal-details plan-details">
      {plan.data.notes&&<section className="detail-section" aria-label="Plan information"><h4 className="detail-section-title">Plan information</h4><p className="meal-notes">{plan.data.notes}</p></section>}
      <section className="detail-section" aria-label="Day schedule"><h4 className="detail-section-title">Day schedule</h4>
        {days.length?<ul className="day-entry-list">{days.map((day,index)=><li key={`${day.id}-${index}`}><details className="day-meal-details plan-day-details">
          <summary><span className="day-entry-heading"><strong>{day.label||day.node.name}</strong><span className="day-entry-meta">{day.node.items?.length??0} {day.node.items?.length===1?'meal':'meals'}</span></span></summary>
          <DayContent node={day.node}/>
        </details></li>)}</ul>:<p className="detail-empty">No days added to this plan yet.</p>}
      </section>
      <section className="detail-section detail-assignment" aria-label="Assign to clients"><h4 className="detail-section-title">Assign to clients</h4>
        <PlanAssignment planId={plan.id} clients={clients} assignments={assignments} busy={busy} onBusy={setBusy} onAssigned={onAssigned}/>
      </section>
    </div>
  </EditorDialog>;
}
function PlanAssignment({planId,clients,assignments,busy,onBusy,onAssigned}:{planId:string;clients:ClientRelationship[];assignments:NutritionAssignment[];busy:boolean;onBusy:(value:boolean)=>void;onAssigned:()=>Promise<void>}) {
  const [query,setQuery]=useState('');const [clientId,setClientId]=useState('');
  const selected=clients.find(client=>client.clientId===clientId);
  const matches=clients.filter(client=>(client.client.displayName+' '+client.client.email).toLowerCase().includes(query.trim().toLowerCase()));
  const assigned=clients.filter(client=>assignments.some(assignment=>assignment.planId===planId&&assignment.clientId===client.clientId));
  async function assign(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||!clientId)return;onBusy(true);
    try{await apiRequest('/coach/nutrition-library/plans/'+planId+'/assign',{method:'POST',body:JSON.stringify({clientId})});notify.success('Nutrition plan assigned.');setClientId('');setQuery('');await onAssigned();}
    catch(cause){notify.error(cause instanceof Error?cause.message:'Unable to assign plan. Please try again.');}
    finally{onBusy(false);}
  }
  return <form className="nutrition-fields program-assign-controls" onSubmit={assign}>
    {assigned.length>0&&<><h5>Assigned clients</h5><div className="actions">{assigned.map(client=><span className="status" key={client.clientId}>{client.client.displayName}</span>)}</div></>}
    <label>Search clients<input type="search" placeholder="Search by name or email…" maxLength={180} value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/></label>
    {query.trim()&&<div className="assignment-client-list"><h5 className="assignment-results-heading">Search results</h5>{matches.length?matches.map(client=><label className="assignment-client-option" key={client.clientId}><input type="radio" name="nutrition-plan-client" checked={clientId===client.clientId} disabled={busy} onChange={()=>setClientId(client.clientId)}/><span><strong>{client.client.displayName}</strong><small>{client.client.email}</small></span></label>):<p role="status">No clients match your search.</p>}</div>}
    {!query.trim()&&<p className="detail-empty">{clients.length?'Search by name or email to find clients.':'Approve a client before assigning a plan.'}</p>}
    {selected&&<><h5>Selected client</h5><div className="actions"><span className="status">{selected.client.displayName}</span><button type="button" className="secondary" disabled={busy} onClick={()=>setClientId('')}>Clear selection</button></div></>}
    {assignments.some(assignment=>assignment.clientId===clientId)&&<p>This replaces the client’s current meal plan.</p>}
    <button className="primary" disabled={busy||!clientId}>{busy?'Assigning…':'Assign plan'}</button>
  </form>;
}
