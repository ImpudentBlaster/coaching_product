import { PlanBuilder } from '../nutrition/plan-builder';
import { PlanDetails } from '../nutrition/plan-details';
import { DayBuilder } from '../nutrition/day-builder';
import { DayDetails } from '../nutrition/day-details';
import { MealDetails } from '../nutrition/meal-details';
import { FoodCatalog } from './food-catalog';
import { ActionMenu } from '../../components/action-menu';
import { FoodSelect } from '../nutrition/food-select';
import { FoodTableCells } from '../nutrition/food-table-cells';
import { foodTableColumns } from '../nutrition/food-table-columns';
import { notify } from '../../lib/notify';
import { Collection } from '../../components/collection';

import { EditorDialog, Notice } from '../../components/editor-dialog';

import { Link, useSearchParams } from 'react-router-dom';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';

import { apiRequest, type ClientRelationship } from '../../lib/api';

import { NutritionTotals, type NutritionEntry, type NutritionNode } from '../nutrition/nutrition-details';



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

  const [catalogIds,setCatalogIds]=useState<string[]>([]);
  const [browsingStarters,setBrowsingStarters]=useState(false);
  const [message, setMessage] = useState('');

 const [editing,setEditing]=useState<NutritionEntry|null|undefined>(undefined);

 const [dialogBusy,setDialogBusy]=useState(false);
 const planFormId=useId();const [planReady,setPlanReady]=useState(false);const [planSubmitting,setPlanSubmitting]=useState(false);

 const [loadError,setLoadError]=useState('');

 const [removing,setRemoving]=useState('');
 const [viewingMeal,setViewingMeal]=useState<NutritionEntry|null>(null);
 const [viewingPlan,setViewingPlan]=useState<NutritionEntry|null>(null);
 const [viewingDay,setViewingDay]=useState<NutritionEntry|null>(null);
 const [deletingEntry,setDeletingEntry]=useState<NutritionEntry|null>(null);

  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {

    setLoading(true);setLoadError('');

 try { setLibrary(await apiRequest<Library>('/coach/nutrition-library')); }

    catch (error) { setLoadError(error instanceof Error ? error.message : 'Unable to load nutrition library'); }

    finally { setLoading(false); }

  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(()=>{if(kind!=='foods')return;let active=true;void apiRequest<{foods:Array<{libraryEntryId:string}>}>('/coach/nutrition-library/catalog').then(result=>{if(active)setCatalogIds(result.foods.map(food=>food.libraryEntryId));}).catch(()=>{});return()=>{active=false;};},[kind]);
  async function remove(entry: NutritionEntry) {
    if (removing) return;
    setRemoving(entry.id);
    try {
      await apiRequest(`/coach/nutrition-library/${entry.data.kind}/${entry.id}`, { method: 'DELETE' });
      setDeletingEntry(null); setMessage('Entry deleted.'); await load();
    } catch (error) { notify.error(error instanceof Error ? error.message : 'Unable to delete entry'); }
    finally { setRemoving(''); }
  }
  return <div className="nutrition-studio">

    <p className="lede">Plans → Days → Meals → Foods. Build your food library, combine foods into meals, and assemble days into a client plan.</p>

    <nav className="nutrition-mobile-categories" aria-label="Nutrition categories">{(['plans', 'days', 'meals', 'foods'] as const).map(tab => <Link key={tab} aria-current={kind === tab ? 'page' : undefined} className={kind === tab ? 'primary' : 'secondary'} to={`/coach/studio?tab=nutrition&section=${tab}`}>{tab[0]!.toUpperCase() + tab.slice(1)}</Link>)}</nav>

    {deletingEntry&&<EditorDialog title={'Delete '+labels[deletingEntry.data.kind]+'?'} variant="confirmation" busy={!!removing} trackChanges={false} onClose={()=>setDeletingEntry(null)}>
      <p>Delete <strong>{deletingEntry.data.name}</strong> from your nutrition library? Existing client plans will be preserved.</p>
      <div className="workout-confirm-actions"><button type="button" className="secondary" disabled={!!removing} onClick={()=>setDeletingEntry(null)}>Cancel</button><button type="button" className="danger" disabled={!!removing} onClick={()=>void remove(deletingEntry)}>{removing?'Deleting…':'Delete '+labels[deletingEntry.data.kind]}</button></div>
    </EditorDialog>}
    {viewingMeal&&<MealDetails meal={viewingMeal} onClose={()=>setViewingMeal(null)} onEdit={()=>{setEditing(viewingMeal);setViewingMeal(null);}}/>}
    {viewingDay&&<DayDetails day={viewingDay} onClose={()=>setViewingDay(null)} onEdit={()=>{setEditing(viewingDay);setViewingDay(null);}}/>}
    {viewingPlan&&<PlanDetails plan={viewingPlan} clients={clients} assignments={library.assignments} onClose={()=>setViewingPlan(null)} onEdit={()=>{setEditing(viewingPlan);setViewingPlan(null);}} onAssigned={load}/>}
    <Notice message={message} onClear={()=>setMessage('')}/>

    {editing!==undefined&&<EditorDialog title={kind==='foods'&&!editing?'Create Food':`${editing?'Edit':'Add'} ${labels[kind]}`} busy={dialogBusy} onClose={()=>setEditing(undefined)} {...(kind==='plans'?{footerContent:(close:()=>void)=><><button type="button" className="secondary" disabled={dialogBusy} onClick={close}>Cancel</button><button type="submit" form={planFormId} className="primary" disabled={dialogBusy||!planReady}>{planSubmitting?(editing?'Saving…':'Creating plan…'):editing?'Save changes':'Create plan'}</button></>}: {})}>{kind==='days'?<DayBuilder key={editing?.id??kind} initial={editing??undefined} entries={library.entries} onBusy={setDialogBusy} onSaved={async()=>{setEditing(undefined);await load();}} onMessage={setMessage} onNavigate={next=>{setEditing(undefined);setKind(next);}}/>:kind==='plans'?<PlanBuilder formId={planFormId} onReady={setPlanReady} onSubmitting={setPlanSubmitting} key={editing?.id??kind} initial={editing??undefined} entries={library.entries} onBusy={setDialogBusy} onSaved={async()=>{setEditing(undefined);await load();}} onMessage={setMessage} onNavigate={next=>{setEditing(undefined);setKind(next);}}/>:<NutritionBuilder key={editing?.id??kind} initial={editing??undefined} kind={kind} entries={library.entries} onBusy={setDialogBusy} onSaved={async()=>{setEditing(undefined);await load();}} onMessage={setMessage} onNavigate={next=>{setEditing(undefined);setKind(next);}}/>}</EditorDialog>}

    {kind==='foods'&&browsingStarters&&<EditorDialog title="Add From Library" trackChanges={false} headerContent={<p className="food-library-description">Choose from the predefined food library to add foods to your collection.</p>} onClose={()=>setBrowsingStarters(false)}><FoodCatalog entries={library.entries} onAdded={load} onCatalogLoaded={setCatalogIds}/></EditorDialog>}
    <Collection key={kind} {...(kind === 'foods' ? {columns:foodTableColumns} : kind==='plans'?{columns:['Name','Days','Assigned clients','Created at','Updated at','Action','View']}:(kind==='meals'||kind==='days')?{columns:['Name',kind==='days'?'Entries':'Foods','Macronutrients','Calories','Created at','Updated at','Action','View']}: {})} title={`Nutrition ${kind}`} loading={loading} error={loadError} onRetry={()=>void load()} actions={<div className="actions">{kind==='foods'&&<button className="secondary" onClick={()=>setBrowsingStarters(true)}>Add From Library</button>}<button className="primary" onClick={()=>setEditing(null)}>{kind==='foods'?'Create Food':`Add ${labels[kind]}`}</button></div>}>

      {library.entries.filter(entry=>entry.data.kind===kind).sort((a,b)=>kind==='foods'?Number(catalogIds.includes(a.id))-Number(catalogIds.includes(b.id)):0).map(entry => kind === 'foods' || kind === 'meals' || kind === 'days'
        ? <tr key={entry.id} data-search={`${entry.data.name} ${entry.data.notes} ${new Date(entry.createdAt).toLocaleDateString()}`}><FoodTableCells food={entry.data} {...((kind==='meals'||kind==='days')?{weight:entry.data.items?.length??0,metadataCells:<>{[entry.createdAt,entry.updatedAt].map((value,index)=><td className="nutrition-timestamp" key={index}>{value?<time dateTime={value}>{new Date(value).toLocaleString()}</time>:'—'}</td>)}</>}:{})} actions={<ActionMenu name={entry.data.name} disabled={!!removing} items={[{label:'Edit',onSelect:()=>setEditing(entry)},{label:'Delete',danger:true,onSelect:()=>setDeletingEntry(entry)}]}/>}></FoodTableCells>{(kind==='meals'||kind==='days')&&<td className="workout-view-cell"><button type="button" className="secondary icon-button workout-icon-action" title={'View '+labels[kind]} aria-label={'View '+entry.data.name} disabled={!!removing} onClick={()=>kind==='days'?setViewingDay(entry):setViewingMeal(entry)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></td>}</tr>
        : <tr key={entry.id} data-search={entry.data.name+' '+entry.data.notes}>
            <td className="food-name"><strong>{entry.data.name}</strong></td><td>{entry.data.items?.length??0}</td><td>{library.assignments.filter(assignment=>assignment.planId===entry.id).length}</td>
            {[entry.createdAt,entry.updatedAt].map((value,index)=><td className="nutrition-timestamp" key={index}>{value?<time dateTime={value}>{new Date(value).toLocaleString()}</time>:'—'}</td>)}
            <td className="food-actions"><ActionMenu name={entry.data.name} disabled={!!removing} items={[{label:'Edit',onSelect:()=>setEditing(entry)},{label:'Delete',danger:true,onSelect:()=>setDeletingEntry(entry)}]}/></td>
            <td className="workout-view-cell"><button type="button" className="secondary icon-button workout-icon-action" title="View plan" aria-label={'View '+entry.data.name} onClick={()=>setViewingPlan(entry)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></td>
          </tr>)}
    </Collection>

  </div>;

}



function NutritionBuilder({ kind, entries, onSaved, onMessage, onNavigate, initial, onBusy }: {

  initial?:NutritionEntry|undefined; onBusy:(busy:boolean)=>void; kind: Kind; entries: NutritionEntry[]; onSaved: () => Promise<void>; onMessage: (message: string) => void; onNavigate: (kind: Kind) => void;

}) {

  const [rows, setRows] = useState(() => initial?.data.items?.map(item=>({key:crypto.randomUUID(),id:item.id,quantity:String(item.quantity??100),label:item.label??'',type:item.node.kind==='foods'?'foods':'meals'}))??[{ key: crypto.randomUUID(), id: '', quantity: '100', label: '', type:'meals' }]);

  const [busy, setBusy] = useState(false);

 const [error,setError]=useState('');

  const childKind = kind === 'foods' ? null : childKinds[kind];

  const [catalog,setCatalog]=useState<Array<{id:string;libraryEntryId:string;data:NutritionNode}>>([]);
  const [addedFoods,setAddedFoods]=useState<NutritionEntry[]>([]);
  const [choosing,setChoosing]=useState(false);
  const [catalogLoading,setCatalogLoading]=useState(kind==='meals'||kind==='days');
  const [catalogError,setCatalogError]=useState('');
  const [catalogRetry,setCatalogRetry]=useState(0);
  useEffect(()=>{if(kind!=='meals'&&kind!=='days')return;let active=true;setCatalogLoading(true);setCatalogError('');void apiRequest<{foods:typeof catalog}>('/coach/nutrition-library/catalog').then(result=>{if(active)setCatalog(result.foods);}).catch(()=>{if(active)setCatalogError('Starter foods could not load. Your own foods are still available.');}).finally(()=>{if(active)setCatalogLoading(false);});return()=>{active=false;};},[kind,catalogRetry]);
  const ownOptions=[...entries,...addedFoods].filter(entry=>(entry.data.kind===childKind||(kind==='days'&&entry.data.kind==='foods')));
  const options=[...ownOptions,...((kind==='meals'||kind==='days')?catalog.filter(food=>!ownOptions.some(entry=>entry.id===food.libraryEntryId)).map(food=>({id:food.libraryEntryId,data:food.data,createdAt:''})):[])];
  function updateSelection(key: string, id: string, servingSize: number) {
    setRows(current => current.map(item => item.key === key ? { ...item, id, quantity: String(servingSize) } : item));
  }
  async function chooseFood(key:string,id:string){
    const option=options.find(entry=>entry.id===id);const starter=catalog.find(food=>food.libraryEntryId===id);
    if(!starter||ownOptions.some(entry=>entry.id===id)){updateSelection(key,id,option?.data.servingSize??100);return;}
    setChoosing(true);onBusy(true);setError('');
    try{const result=await apiRequest<{entry:NutritionEntry}>('/coach/nutrition-library/catalog/'+encodeURIComponent(starter.id)+'/add',{method:'POST',body:'{}'});setAddedFoods(current=>[...current.filter(entry=>entry.id!==result.entry.id),result.entry]);updateSelection(key,result.entry.id,result.entry.data.servingSize??100);}
    catch(cause){setError(cause instanceof Error?cause.message:'Unable to select food. Try again.');}finally{setChoosing(false);onBusy(false);}
  }
  const maxRows = kind === 'meals' ? 30 : kind === 'days' ? 12 : 31;

  const totals = rows.reduce((total, row) => {

    const data = options.find(entry => entry.id === row.id)?.data;

    const factor = (kind === 'meals'||(kind==='days'&&row.type==='foods')) ? Number(row.quantity) / (data?.servingSize ?? 1) : 1;

    for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) total[key] += (data?.nutrients?.[key] ?? 0) * factor;

    return total;

  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  async function save(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();

    if (busy || choosing) return;

    const form = event.currentTarget;

    const data = new FormData(form);

    const body = { name: String(data.get('name')), notes: String(data.get('notes')), ...(kind === 'foods' ? {

      servingSize: Number(data.get('servingSize')), unit: String(data.get('unit')),

      nutrients: Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map(key => [key, Number(data.get(key))])),

    } : { items: rows.map(row => kind === 'meals' ? { id: row.id, quantity: Number(row.quantity) } : kind==='days'&&row.type==='foods'?{id:row.id,type:'foods',label:row.label,quantity:Number(row.quantity)}:{ id: row.id, label: row.label }) }) };

    setBusy(true); onBusy(true); setError('');

    try {

      await apiRequest(`/coach/nutrition-library/${kind}${initial?'/'+initial.id:''}`, { method: initial?'PUT':'POST', body: JSON.stringify({...body,version:initial?.version??1}) });

      form.reset(); setRows([{ key: crypto.randomUUID(), id: '', quantity: '100', label: '', type:'meals' }]);

      onMessage(`Nutrition ${labels[kind]} ${initial?'updated':'created'}.`); await onSaved();

    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save'); }

    finally { setBusy(false); onBusy(false); }

  }

  return <form className="card profile-card vertical" onSubmit={save}>

    <h2>{initial?'Edit':'Create'} {labels[kind]}</h2><Notice transient message={error} error onClear={()=>setError('')}/>

    <fieldset className="nutrition-fields" disabled={busy || choosing}>

      <label>Name<input name="name" defaultValue={initial?.data.name} minLength={2} maxLength={150} required/></label>

      <label>Notes<textarea name="notes" defaultValue={initial?.data.notes} maxLength={2000}/></label>

      {kind === 'foods' ? <>

        <p>Enter nutrition for the serving below. Meal quantities use this same unit.</p>

        <div className="form-row"><label>Serving size<input name="servingSize" type="number" min="0.01" max="10000" step="any" defaultValue={initial?.data.servingSize??100} required/></label><label>Unit<select name="unit" defaultValue={initial?.data.unit??'g'}><option value="g">Grams (g)</option><option value="ml">Millilitres (ml)</option><option value="piece">Pieces</option></select></label></div>

        <div className="form-row">{(['calories', 'protein', 'carbs', 'fat'] as const).map(key => <label key={key}>{key === 'calories' ? 'Calories (kcal)' : `${key[0]!.toUpperCase() + key.slice(1)} (g)`}<input name={key} defaultValue={initial?.data.nutrients?.[key]} type="number" min="0" max="100000" step="any" required/></label>)}</div>

      </> : <>

        {(kind==='meals'||kind==='days')&&catalogLoading&&<p role="status">Loading starter foods…</p>}
        {(kind==='meals'||kind==='days')&&catalogError&&<p role="alert">{catalogError} <button type="button" className="secondary" onClick={()=>setCatalogRetry(value=>value+1)}>Retry starter foods</button></p>}
        {!options.length && <p>Create {childKind} first. <button type="button" className="secondary" onClick={() => onNavigate(childKind!)}>Go to {childKind}</button></p>}

        {rows.map((row, index) => {

          const rowOptions=kind==='days'?options.filter(entry=>entry.data.kind===row.type):options;
          const selected = rowOptions.find(entry => entry.id === row.id);

          return <fieldset className="nutrition-fields" key={row.key}><legend>{kind==='days'?'Entry':labels[childKind!]} {index + 1}</legend>
            {kind==='days'&&<label>Entry type<select value={row.type} onChange={event=>{const type=event.target.value;setRows(current=>current.map(item=>item.key===row.key?{...item,type,id:'',quantity:'100'}:item));}}><option value="meals">Meal</option><option value="foods">Food</option></select></label>}

            {(kind === 'meals'||(kind==='days'&&row.type==='foods')) ? <FoodSelect index={index+1} options={rowOptions} value={row.id} onSelect={id=>void chooseFood(row.key,id)}/> : <label>{labels[childKind!]}<select value={row.id} required onChange={event=>updateSelection(row.key,event.target.value,100)}><option value="">Choose {labels[childKind!]}</option>{row.id&&!selected&&<option value={row.id} disabled>Unavailable entry — choose a replacement</option>}{rowOptions.map(entry=><option value={entry.id} key={entry.id}>{entry.data.name}</option>)}</select></label>}

            {(kind === 'meals'||(kind==='days'&&row.type==='foods')) ? <label>Quantity ({selected?.data.unit ?? 'food unit'})<input type="number" min="0.01" max="10000" step="any" required value={row.quantity} onChange={event => { const quantity = event.target.value; setRows(current => current.map(item => item.key === row.key ? { ...item, quantity } : item)); }}/></label> : <label>{kind === 'days' ? 'Meal label (e.g. Breakfast)' : 'Day label (e.g. Day 1 / Training day)'}<input required maxLength={100} pattern=".*\S.*" value={row.label} onChange={event => { const label = event.target.value; setRows(current => current.map(item => item.key === row.key ? { ...item, label } : item)); }}/></label>}

            {kind==='days'&&row.type==='foods'&&<label>Entry label (e.g. Snack)<input required maxLength={100} pattern=".*\S.*" value={row.label} onChange={event=>{const label=event.target.value;setRows(current=>current.map(item=>item.key===row.key?{...item,label}:item));}}/></label>}
            {kind === 'plans' && selected?.data.nutrients && <NutritionTotals nutrients={selected.data.nutrients}/>}

            <button type="button" className="danger" aria-label={`Remove ${kind==='days'?'entry':labels[childKind!]} ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remove</button>

          </fieldset>;

        })}

        {kind==='days'?<div className="actions">{(['meals','foods'] as const).map(type=><button type="button" className="secondary" key={type} disabled={!options.some(entry=>entry.data.kind===type)||rows.length>=maxRows} onClick={()=>setRows(current=>current.length===1&&!current[0]!.id&&!current[0]!.label?[{...current[0]!,type}]:[...current,{key:crypto.randomUUID(),id:'',quantity:'100',label:'',type}])}>Add {type==='meals'?'meal':'food'}</button>)}</div>:<button type="button" className="secondary" disabled={!options.length || rows.length >= maxRows} onClick={() => setRows(current => [...current, { key: crypto.randomUUID(), id: '', quantity: '100', label: '',type:'meals' }])}>Add {labels[childKind!]}</button>}

        {kind !== 'plans' && <><strong>{kind === 'days' ? 'Day totals' : 'Meal totals'}</strong><NutritionTotals nutrients={totals}/></>}

        {kind === 'plans' && <p>Each day has its own nutrition totals. Days appear in the order you add them.</p>}

      </>}

      <button className="primary" disabled={kind !== 'foods' && !options.length}>{busy ? 'Saving…' : initial?'Save changes':`Create ${labels[kind]}`}</button>

    </fieldset>

  </form>;

}


