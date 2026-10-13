import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest, type ClientRelationship } from '../../lib/api';
import { Collection } from '../../components/collection';
import { ActionMenu } from '../../components/action-menu';
import { formatDate } from '../../lib/dates';
import { Link } from 'react-router-dom';
import './workout-details.css';
import { EditorDialog, Notice } from '../../components/editor-dialog';
import { SelectControl } from '../../components/form-controls';
import './supplement-studio.css';

type Supplement = { name: string; timing: string; dosage: string; link: string };
export type SupplementPlan = { kind: 'supplements'; name: string; notes: string; supplements: Supplement[] };
type Entry = { id: string; version: number; createdAt?: string; updatedAt?: string; data: SupplementPlan };
type Assignment = { clientId: string; planId: string };
const blank = (): Supplement => ({ name: '', timing: '', dosage: '', link: '' });
export function SupplementDetails({ plan }: { plan: SupplementPlan }) {
  return <div className="detail-view supplement-plan-details"><h3 className="supplement-plan-title">{plan.name}</h3><section className="detail-section" aria-label="Supplement schedule"><h4 className="detail-section-title">Supplement schedule</h4><ol className="supplement-details">{plan.supplements.map((row,index) => <li className="supplement-detail-card" key={index}><div className="supplement-detail-heading"><span className="detail-day-number">{String(index+1).padStart(2, '0')}</span><h4>{row.name}</h4></div><dl className="supplement-detail-facts"><div><dt>Timings</dt><dd>{row.timing}</dd></div><div><dt>Dosage</dt><dd>{row.dosage}</dd></div><div><dt>Purchase link</dt><dd>{/^https?:\/\//i.test(row.link) ? <a href={row.link} target="_blank" rel="noopener noreferrer">View supplement ↗</a> : <span className="supplement-muted">Not provided</span>}</dd></div></dl></li>)}</ol></section><section className="detail-section"><h4 className="detail-section-title">Additional notes</h4><p className="supplement-notes">{plan.notes || 'No additional notes added.'}</p></section></div>;
}
export function SupplementStudio({ clients }: { clients: ClientRelationship[] }) {
  const [entries,setEntries] = useState<Entry[]>([]);
  const [assignments,setAssignments] = useState<Assignment[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [editing,setEditing] = useState<Entry|null|undefined>();
  const [viewing,setViewing] = useState<Entry|null>(null);
  const [deleting,setDeleting] = useState<Entry|null>(null);
  const [clientId,setClientId] = useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const result=await apiRequest<{entries:Entry[];supplementAssignments?:Assignment[]}>('/coach/nutrition-library');
      setEntries(result.entries.filter(entry=>entry.data.kind==='supplements'));
      setAssignments(result.supplementAssignments??[]);
    } catch(cause) { setError(cause instanceof Error?cause.message:'Unable to load supplement plans.'); }
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  function edit(entry:Entry|null) {
    setError('');setEditing(entry);
    setViewing(null);
  }
  async function assign(event:FormEvent) {
    event.preventDefault();if(!viewing||!clientId)return;setBusy(true);setError('');
    try {
      await apiRequest('/coach/nutrition-library/supplements/'+viewing.id+'/assign',{method:'POST',body:JSON.stringify({clientId})});
      setMessage('Supplement plan assigned.');setClientId('');await load();
    } catch(cause) {setError(cause instanceof Error?cause.message:'Unable to assign supplement plan.');}
    finally {setBusy(false);}
  }
  async function remove() {
    if(!deleting)return;setBusy(true);setError('');
    try {await apiRequest('/coach/nutrition-library/supplements/'+deleting.id,{method:'DELETE'});setDeleting(null);setMessage('Supplement plan deleted.');await load();}
    catch(cause) {setError(cause instanceof Error?cause.message:'Unable to delete supplement plan.');}
    finally {setBusy(false);}
  }
  function view(entry:Entry) {setViewing(entry);setClientId('');setError('');}
  return <div className="supplement-studio">
    <p className="lede">Create standalone supplement plans with timings, dosage, purchase links and notes.</p>
    <Notice message={message} onClear={()=>setMessage('')}/>
    <Collection title="Supplement plans" loading={loading} error={editing===undefined&&!viewing&&!deleting?error:''} onRetry={()=>void load()} columns={['Name','Supplements','Assigned clients','Created at','Updated at','Action','View']} actions={<button className="primary" disabled={busy||loading} onClick={()=>edit(null)}>Add supplement plan</button>}>
      {entries.map(entry=><tr key={entry.id} data-search={[entry.data.name,entry.data.notes,...entry.data.supplements.map(row=>row.name)].join(' ')}><td><strong>{entry.data.name}</strong><small className="supplement-list-preview">{entry.data.supplements.map(row=>row.name).join(', ')}</small></td><td>{entry.data.supplements.length}</td><td><button type="button" className="secondary small" aria-label={'View assigned clients for '+entry.data.name} onClick={()=>view(entry)} disabled={busy}>{assignments.filter(a=>a.planId===entry.id).length}</button></td><td>{entry.createdAt?formatDate(entry.createdAt):'—'}</td><td>{entry.updatedAt?formatDate(entry.updatedAt):'—'}</td><td><ActionMenu name={entry.data.name} disabled={busy} items={[{label:'Edit',onSelect:()=>edit(entry)},{label:'Delete',onSelect:()=>{setError('');setDeleting(entry);}}]}/></td><td className="workout-view-cell"><button type="button" className="secondary icon-button workout-icon-action" disabled={busy} aria-label={'View '+entry.data.name} title="View supplement plan" onClick={()=>view(entry)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></td></tr>)}
    </Collection>
    {editing!==undefined&&<EditorDialog title={editing?'Update supplement plan':'Add supplement plan'} busy={busy} onClose={()=>setEditing(undefined)}><SupplementPlanForm {...(editing?{initial:editing}:{})} onBusy={setBusy} onSaved={async()=>{setEditing(undefined);setMessage('Supplement plan saved.');await load();}}/></EditorDialog>}
    {viewing&&<EditorDialog title="Supplement plan details" variant="drawer" busy={busy} trackChanges={false} onClose={()=>setViewing(null)} headerContent={<div className="workout-details-heading"><div><h3>{viewing.data.name}</h3><p>{viewing.data.supplements.length} supplements · {assignments.filter(a=>a.planId===viewing.id).length} assigned clients</p></div><button type="button" className="primary" disabled={busy} onClick={()=>edit(viewing)}>Edit plan</button></div>}><div className="supplement-drawer-content"><SupplementDetails plan={viewing.data}/>
      <section className="detail-section supplement-assigned-clients" aria-label="Assigned clients"><h4 className="detail-section-title">Assigned clients</h4>{assignments.some(a=>a.planId===viewing.id)?<ul>{assignments.filter(a=>a.planId===viewing.id).map(a=><li key={a.clientId}><Link to={'/coach/clients/'+a.clientId}>{clients.find(c=>c.clientId===a.clientId)?.client.displayName??'View client'}</Link><small>{clients.find(c=>c.clientId===a.clientId)?.client.email}</small></li>)}</ul>:<p className="detail-empty">No clients assigned to this plan yet.</p>}</section><section className="detail-section supplement-assignment" aria-label="Assign supplement plan"><h4 className="detail-section-title">Assign to client</h4><p className="detail-empty">Choose an approved client to share this supplement plan.</p>
      <form onSubmit={assign} className="form-stack">{error&&<p role="alert">{error}</p>}<label>Assign to client<SelectControl aria-label="Assign to client" required value={clientId} disabled={busy} onChange={e=>setClientId(e.target.value)}><option value="">Choose client</option>{clients.filter(c=>c.status==='APPROVED').map(c=><option key={c.clientId} value={c.clientId}>{c.client.displayName} · {c.client.email}</option>)}</SelectControl></label>
        {assignments.some(a=>a.clientId===clientId)&&<p>This replaces the client’s current supplement plan.</p>}
        <button className="primary" disabled={busy||!clientId}>{busy?'Assigning…':'Assign supplement plan'}</button>
      </form></section></div>
    </EditorDialog>}
    {deleting&&<EditorDialog title="Delete supplement plan?" variant="confirmation" busy={busy} trackChanges={false} onClose={()=>setDeleting(null)}><p>Delete {deleting.data.name}? Existing client assignments will be preserved.</p>{error&&<p role="alert">{error}</p>}<div className="actions"><button className="secondary" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</button><button className="danger" disabled={busy} onClick={()=>void remove()}>Delete supplement plan</button></div></EditorDialog>}
  </div>;
}


export function SupplementPlanForm({initial,onSaved,onBusy}:{initial?:Entry;onSaved:(id:string)=>Promise<void>;onBusy:(busy:boolean)=>void}) {
  const editing=initial;
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [plan,setPlan]=useState<SupplementPlan>(()=>initial?{...initial.data,supplements:initial.data.supplements.map(row=>({...row}))}:{kind:'supplements',name:'',notes:'',supplements:[blank()]});
  async function save(event:FormEvent) {
    event.preventDefault();setBusy(true);onBusy(true);setError('');
    try {
      const result=await apiRequest<{entry:{id:string}}> ('/coach/nutrition-library/supplements'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',body:JSON.stringify({...plan,...(editing?{version:editing.version}:{})})});
      await onSaved(result.entry.id);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Unable to save supplement plan.');}
    finally {setBusy(false);onBusy(false);}
  }
  function rowChange(index:number,field:keyof Supplement,value:string) {
    setPlan(current=>({...current,supplements:current.supplements.map((row,i)=>i===index?{...row,[field]:value}:row)}));
  }
  return <form onSubmit={save}><fieldset disabled={busy} className="form-stack">
      {error&&<p role="alert">{error}</p>}
      <label>Title<input required minLength={2} maxLength={150} placeholder="Enter supplement plan title" value={plan.name} onChange={e=>setPlan({...plan,name:e.target.value})}/></label>
      {plan.supplements.map((row,index)=><fieldset className="supplement-row" key={index}><legend>Supplement {index+1}</legend><div className="supplement-row-fields">
        <label>Name<input required maxLength={150} value={row.name} placeholder="Supplement name" onChange={e=>rowChange(index,'name',e.target.value)}/></label>
        <label>Timings<input required maxLength={200} value={row.timing} placeholder="e.g. After breakfast" onChange={e=>rowChange(index,'timing',e.target.value)}/></label>
        <label>Dosage<input required maxLength={200} value={row.dosage} placeholder="Supplement dosage" onChange={e=>rowChange(index,'dosage',e.target.value)}/></label>
        <label>Purchase link (optional)<input type="url" pattern="https?://.*" maxLength={2000} value={row.link} placeholder="https://…" onChange={e=>rowChange(index,'link',e.target.value)}/></label>
        <button type="button" className="danger" aria-label={'Remove supplement '+(index+1)} disabled={plan.supplements.length===1} onClick={()=>setPlan({...plan,supplements:plan.supplements.filter((_,i)=>i!==index)})}>Remove</button>
      </div></fieldset>)}
      <button type="button" className="secondary" disabled={plan.supplements.length>=50} onClick={()=>setPlan({...plan,supplements:[...plan.supplements,blank()]})}>Add supplement</button>
      <label>Additional notes<textarea maxLength={2000} rows={5} value={plan.notes} onChange={e=>setPlan({...plan,notes:e.target.value})}/></label>
      <button className="primary">{busy?'Saving…':'Save supplement plan'}</button>
    </fieldset></form>;
}
