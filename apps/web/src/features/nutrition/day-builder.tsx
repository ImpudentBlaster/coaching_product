import { useState, type FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { Notice } from '../../components/editor-dialog';
import { NutritionTotals, type NutritionEntry, type NutritionNode } from './nutrition-details';
import { DayEntriesEditor } from './day-entries-editor';
import { initialDayEntries, serializeDayEntries, dayTotals } from './day-entry-state';
import { useNutritionFoods } from './use-nutrition-foods';
import { FoodLibraryStatus } from './food-library-status';

export function DayBuilder({initial,entries,onBusy,onSaved,onMessage,onNavigate}:{initial?:NutritionEntry|undefined;entries:NutritionEntry[];onBusy:(busy:boolean)=>void;onSaved:()=>Promise<void>;onMessage:(message:string)=>void;onNavigate:(kind:NutritionNode['kind'])=>void}) {
  const [dayEntries,setDayEntries]=useState(()=>initialDayEntries(initial?.data));
  const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const library=useNutritionFoods(entries,onBusy);
  const busy=saving||library.choosing;
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;const form=new FormData(event.currentTarget);
    setSaving(true);onBusy(true);setError('');
    try {
      await apiRequest('/coach/nutrition-library/days'+(initial?'/'+initial.id:''),{method:initial?'PUT':'POST',body:JSON.stringify({name:String(form.get('name')),notes:String(form.get('notes')),items:serializeDayEntries(dayEntries),version:initial?.version??1})});
      onMessage(`Nutrition day ${initial?'updated':'created'}.`);await onSaved();
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save day. Please try again.');}
    finally{setSaving(false);onBusy(false);}
  }
  return <form className="card profile-card vertical" onSubmit={save}>
    <h2>{initial?'Edit':'Create'} day</h2><Notice transient message={error} error onClear={()=>setError('')}/>
    <fieldset className="nutrition-fields" disabled={busy}>
      <label>Name<input name="name" defaultValue={initial?.data.name} minLength={2} maxLength={150} required/></label>
      <label>Notes<textarea name="notes" defaultValue={initial?.data.notes} maxLength={2000}/></label>
      <p>Add named entries, such as Breakfast or Lunch, using foods or a saved meal.</p>
      <FoodLibraryStatus library={library}/>
      {!library.foods.length&&!library.meals.length&&!library.loading&&<p>Create meals or foods first. <button type="button" className="secondary" onClick={()=>onNavigate('meals')}>Go to meals</button> <button type="button" className="secondary" onClick={()=>onNavigate('foods')}>Go to foods</button></p>}
      <DayEntriesEditor dayEntries={dayEntries} setDayEntries={setDayEntries} meals={library.meals} foods={library.foods} chooseFood={library.chooseFood}/>
      <strong>Day totals</strong><NutritionTotals nutrients={dayTotals(dayEntries,library.meals,library.foods)}/>
      <button className="primary" disabled={!library.foods.length&&!library.meals.length}>{busy?'Saving…':initial?'Save changes':'Create day'}</button>
    </fieldset>
  </form>;
}
