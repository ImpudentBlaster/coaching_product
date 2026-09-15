import { Collection } from '../../components/collection';

import { EditorDialog, Notice } from '../../components/editor-dialog';

import { Link, useSearchParams } from 'react-router-dom';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { apiRequest, type ClientRelationship } from '../../lib/api';

import { NutritionDetails, NutritionTotals, type NutritionEntry, type NutritionNode } from '../nutrition/nutrition-details';



type Kind = NutritionNode['kind'];

type Library = { entries: NutritionEntry[]; assignments: Array<{ id: string; clientId: string; planId: string }> };

const labels = { foods: 'food', meals: 'meal', days: 'day', plans: 'plan' };

const childKinds = { meals: 'foods', days: 'meals', plans: 'days' } as const;



export function NutritionStudio({ clients }: { clients: ClientRelationship[] }) {

  const [searchParams, setSearchParams] = useSearchParams();

  const section = searchParams.get('section');

  const kind: Kind = section === 'foods' || section === 'meals' || section === 'days' ? section : 'plans';

  const setKind = (next: Kind) => setSearchParams({ tab: 'nutrition', section: next });

  const [library, setLibrary] = useState<Library>({ entries: [], assignments: [] });

  const [message, setMessage] = useState('');

 const [editing,setEditing]=useState<NutritionEntry|null|undefined>(undefined);

 const [dialogBusy,setDialogBusy]=useState(false);

 const [loadError,setLoadError]=useState('');

 const [removing,setRemoving]=useState('');

  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {

    setLoading(true);setLoadError('');

 try { setLibrary(await apiRequest<Library>('/coach/nutrition-library')); }

    catch (error) { setLoadError(error instanceof Error ? error.message : 'Unable to load nutrition library'); }

    finally { setLoading(false); }

  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="nutrition-studio">

    <p className="lede">Plans → Days → Meals → Foods. Build your food library, combine foods into meals, and assemble days into a client plan.</p>

    <nav className="nutrition-mobile-categories" aria-label="Nutrition categories">{(['plans', 'days', 'meals', 'foods'] as const).map(tab => <Link key={tab} aria-current={kind === tab ? 'page' : undefined} className={kind === tab ? 'primary' : 'secondary'} to={`/coach/studio?tab=nutrition&section=${tab}`}>{tab[0]!.toUpperCase() + tab.slice(1)}</Link>)}</nav>

    <Notice message={message} onClear={()=>setMessage('')}/>

    {editing!==undefined&&<EditorDialog title={`${editing?'Edit':'Add'} ${labels[kind]}`} busy={dialogBusy} onClose={()=>setEditing(undefined)}><NutritionBuilder key={editing?.id??kind} initial={editing??undefined} kind={kind} entries={library.entries} onBusy={setDialogBusy} onSaved={async()=>{setEditing(undefined);await load();}} onMessage={setMessage} onNavigate={next=>{setEditing(undefined);setKind(next);}}/></EditorDialog>}

    <Collection key={kind} title={`Nutrition ${kind}`} loading={loading} error={loadError} onRetry={()=>void load()} actions={<button className="primary" onClick={()=>setEditing(null)}>Add {labels[kind]}</button>}>

      {library.entries.filter(entry=>entry.data.kind===kind).map(entry=><article className="nutrition-entry" key={entry.id}>

        <div className="list-item"><div><h3>{entry.data.name}</h3><small>Created {new Date(entry.createdAt).toLocaleDateString()}</small>{entry.data.nutrients&&<NutritionTotals nutrients={entry.data.nutrients}/>}</div><div className="actions"><button className="secondary" onClick={()=>setEditing(entry)}>Edit</button><button className="danger" disabled={!!removing} onClick={async()=>{if(!confirm(`Delete ${entry.data.name} from your library? Existing client plans will be preserved.`))return;setRemoving(entry.id);try{await apiRequest(`/coach/nutrition-library/${kind}/${entry.id}`,{method:'DELETE'});setMessage('Entry deleted.');await load();}catch(error){setLoadError(error instanceof Error?error.message:'Unable to delete entry');}finally{setRemoving('');}}}>{removing===entry.id?'Deleting…':'Delete'}</button></div></div>

        <details><summary>View details{kind==='plans'?' and assign':''}</summary><NutritionDetails node={entry.data}/>{kind==='plans'&&<AssignmentForm entry={entry} clients={clients} assignments={library.assignments} onSaved={load} onMessage={setMessage}/>}</details>

      </article>)}

    </Collection>

  </div>;

}



function NutritionBuilder({ kind, entries, onSaved, onMessage, onNavigate, initial, onBusy }: {

  initial?:NutritionEntry|undefined; onBusy:(busy:boolean)=>void; kind: Kind; entries: NutritionEntry[]; onSaved: () => Promise<void>; onMessage: (message: string) => void; onNavigate: (kind: Kind) => void;

}) {

  const [rows, setRows] = useState(() => initial?.data.items?.map(item=>({key:crypto.randomUUID(),id:item.id,quantity:String(item.quantity??100),label:item.label??''}))??[{ key: crypto.randomUUID(), id: '', quantity: '100', label: '' }]);

  const [busy, setBusy] = useState(false);

 const [error,setError]=useState('');

  const childKind = kind === 'foods' ? null : childKinds[kind];

  const options = entries.filter(entry => entry.data.kind === childKind);

  const maxRows = kind === 'meals' ? 30 : kind === 'days' ? 12 : 31;

  const totals = rows.reduce((total, row) => {

    const data = options.find(entry => entry.id === row.id)?.data;

    const factor = kind === 'meals' ? Number(row.quantity) / (data?.servingSize ?? 1) : 1;

    for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) total[key] += (data?.nutrients?.[key] ?? 0) * factor;

    return total;

  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  async function save(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    if (busy) return;

    const form = event.currentTarget;

    const data = new FormData(form);

    const body = { name: String(data.get('name')), notes: String(data.get('notes')), ...(kind === 'foods' ? {

      servingSize: Number(data.get('servingSize')), unit: String(data.get('unit')),

      nutrients: Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map(key => [key, Number(data.get(key))])),

    } : { items: rows.map(row => kind === 'meals' ? { id: row.id, quantity: Number(row.quantity) } : { id: row.id, label: row.label }) }) };

    setBusy(true); onBusy(true); setError('');

    try {

      await apiRequest(`/coach/nutrition-library/${kind}${initial?'/'+initial.id:''}`, { method: initial?'PUT':'POST', body: JSON.stringify({...body,version:initial?.version??1}) });

      form.reset(); setRows([{ key: crypto.randomUUID(), id: '', quantity: '100', label: '' }]);

      onMessage(`Nutrition ${labels[kind]} ${initial?'updated':'created'}.`); await onSaved();

    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save'); }

    finally { setBusy(false); onBusy(false); }

  }

  return <form className="card profile-card vertical" onSubmit={save}>

    <h2>{initial?'Edit':'Create'} {labels[kind]}</h2><Notice message={error} error onClear={()=>setError('')}/>

    <fieldset className="nutrition-fields" disabled={busy}>

      <label>Name<input name="name" defaultValue={initial?.data.name} minLength={2} maxLength={150} required/></label>

      <label>Notes<textarea name="notes" defaultValue={initial?.data.notes} maxLength={2000}/></label>

      {kind === 'foods' ? <>

        <p>Enter nutrition for the serving below. Meal quantities use this same unit.</p>

        <div className="form-row"><label>Serving size<input name="servingSize" type="number" min="0.01" max="10000" step="any" defaultValue={initial?.data.servingSize??100} required/></label><label>Unit<select name="unit" defaultValue={initial?.data.unit??'g'}><option value="g">Grams (g)</option><option value="ml">Millilitres (ml)</option><option value="piece">Pieces</option></select></label></div>

        <div className="form-row">{(['calories', 'protein', 'carbs', 'fat'] as const).map(key => <label key={key}>{key === 'calories' ? 'Calories (kcal)' : `${key[0]!.toUpperCase() + key.slice(1)} (g)`}<input name={key} defaultValue={initial?.data.nutrients?.[key]} type="number" min="0" max="100000" step="any" required/></label>)}</div>

      </> : <>

        {!options.length && <p>Create {childKind} first. <button type="button" className="secondary" onClick={() => onNavigate(childKind!)}>Go to {childKind}</button></p>}

        {rows.map((row, index) => {

          const selected = options.find(entry => entry.id === row.id);

          return <fieldset className="nutrition-fields" key={row.key}><legend>{labels[childKind!]} {index + 1}</legend>

            <label>{labels[childKind!]}<select value={row.id} required onChange={event => { const id = event.target.value; setRows(current => current.map(item => item.key === row.key ? { ...item, id, quantity: String(options.find(option => option.id === id)?.data.servingSize ?? 100) } : item)); }}><option value="">Choose {labels[childKind!]}</option>{row.id&&!selected&&<option value={row.id} disabled>Unavailable entry — choose a replacement</option>}{options.map(entry => <option value={entry.id} key={entry.id}>{entry.data.name}</option>)}</select></label>

            {kind === 'meals' ? <label>Quantity ({selected?.data.unit ?? 'food unit'})<input type="number" min="0.01" max="10000" step="any" required value={row.quantity} onChange={event => { const quantity = event.target.value; setRows(current => current.map(item => item.key === row.key ? { ...item, quantity } : item)); }}/></label> : <label>{kind === 'days' ? 'Meal label (e.g. Breakfast)' : 'Day label (e.g. Day 1 / Training day)'}<input required maxLength={100} pattern=".*\S.*" value={row.label} onChange={event => { const label = event.target.value; setRows(current => current.map(item => item.key === row.key ? { ...item, label } : item)); }}/></label>}

            {kind === 'plans' && selected?.data.nutrients && <NutritionTotals nutrients={selected.data.nutrients}/>}

            <button type="button" className="danger" aria-label={`Remove ${labels[childKind!]} ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remove</button>

          </fieldset>;

        })}

        <button type="button" className="secondary" disabled={!options.length || rows.length >= maxRows} onClick={() => setRows(current => [...current, { key: crypto.randomUUID(), id: '', quantity: '100', label: '' }])}>Add {labels[childKind!]}</button>

        {kind !== 'plans' && <><strong>{kind === 'days' ? 'Day totals' : 'Meal totals'}</strong><NutritionTotals nutrients={totals}/></>}

        {kind === 'plans' && <p>Each day has its own nutrition totals. Days appear in the order you add them.</p>}

      </>}

      <button className="primary" disabled={kind !== 'foods' && !options.length}>{busy ? 'Saving…' : initial?'Save changes':`Create ${labels[kind]}`}</button>

    </fieldset>

  </form>;

}



function AssignmentForm({ entry, clients, assignments, onSaved, onMessage }: {

  entry: NutritionEntry; clients: ClientRelationship[]; assignments: Library['assignments']; onSaved: () => Promise<void>; onMessage: (message: string) => void;

}) {

  const [clientId, setClientId] = useState('');

  const [busy, setBusy] = useState(false);

  async function assign(event: FormEvent<HTMLFormElement>) {

    event.preventDefault(); if (busy) return; setBusy(true);

    try { await apiRequest(`/coach/nutrition-library/plans/${entry.id}/assign`, { method: 'POST', body: JSON.stringify({ clientId }) }); onMessage('Nutrition plan assigned.'); await onSaved(); }

    catch (error) { onMessage(error instanceof Error ? error.message : 'Unable to assign'); }

    finally { setBusy(false); }

  }

  const assignedClients = clients.filter(client => assignments.some(assignment => assignment.planId === entry.id && assignment.clientId === client.clientId));

  return <form onSubmit={assign} className="nutrition-fields">

    {assignedClients.length > 0 && <p>Assigned to: {assignedClients.map(client => client.client.displayName).join(', ')}</p>}

    <label>Assign to client<select required disabled={busy} value={clientId} onChange={event => setClientId(event.target.value)}><option value="">Choose client</option>{clients.map(client => <option key={client.clientId} value={client.clientId}>{client.client.displayName}</option>)}</select></label>

    {!clients.length && <p>Approve a client before assigning a plan.</p>}

    {assignments.some(assignment => assignment.clientId === clientId) && <p>This replaces the client’s current meal plan.</p>}

    <button className="primary" disabled={busy || !clientId}>{busy ? 'Assigning…' : 'Assign plan'}</button>

  </form>;

}

