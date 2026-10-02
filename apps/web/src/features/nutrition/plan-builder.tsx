import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { Notice } from '../../components/editor-dialog';
import { useEditorDirty } from '../../components/editor-dialog-context';
import { NutritionTotals, type NutritionEntry, type NutritionNode } from './nutrition-details';
import { CompactMealsEditor, type MealIssue } from './compact-meals-editor';
import { initialDayEntries, serializeDayEntries, dayTotals, type DayEntry } from './day-entry-state';
import { useNutritionFoods } from './use-nutrition-foods';
import { FoodLibraryStatus } from './food-library-status';
import './plan-builder.css';

type PlanDay={key:string;name:string;notes:string;type:'days'|'custom';dayId:string;entries:DayEntry[]};
type DayIssue={message:string;name?:string;source?:string;meals?:Record<string,MealIssue>};
const newDay=():PlanDay=>({key:crypto.randomUUID(),name:'',notes:'',type:'days',dayId:'',entries:[]});
export function PlanBuilder({initial,entries,onBusy,onSaved,onMessage,onNavigate,formId,onReady,onSubmitting}:{initial?:NutritionEntry|undefined;entries:NutritionEntry[];onBusy:(busy:boolean)=>void;onSaved:()=>Promise<void>;onMessage:(message:string)=>void;onNavigate:(kind:NutritionNode['kind'])=>void;formId:string;onReady:(value:boolean)=>void;onSubmitting:(value:boolean)=>void}) {
  const [days,setDays]=useState<PlanDay[]>(()=>initial?.data.items?.map(item=>({key:item.node.custom?item.id:crypto.randomUUID(),name:item.label??item.node.name,notes:item.node.custom?item.node.notes:'',type:item.node.custom?'custom':'days',dayId:item.node.custom?'':item.id,entries:item.node.custom?initialDayEntries(item.node):[]}))??[newDay()]);
  const [activeDay,setActiveDay]=useState<string|null>(()=>initial?null:days[0]?.key??null);
  const [name,setName]=useState(initial?.data.name??'');const [notes,setNotes]=useState(initial?.data.notes??'');
  const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const [nameError,setNameError]=useState('');const [dayIssues,setDayIssues]=useState<Record<string,DayIssue>>({});
  const [pendingFood,setPendingFood]=useState(false);
  const formRef=useRef<HTMLFormElement>(null);const submitting=useRef(false);
  const markDirty=useEditorDirty();
  const library=useNutritionFoods(entries,onBusy);
  const templates=entries.filter(entry=>entry.data.kind==='days');
  const busy=saving||library.choosing;
  const available=!!(templates.length||library.foods.length||library.meals.length);
  useEffect(()=>{onReady(available&&!pendingFood);},[available,pendingFood,onReady]);
  function updateDay(key:string,update:Partial<PlanDay>){markDirty();setDays(current=>current.map(day=>day.key===key?{...day,...update}:day));setDayIssues(current=>{const next={...current};delete next[key];return next;});}
  function validateDay(day:PlanDay):DayIssue|undefined {
    if(!day.name.trim()||day.name.trim().length>100)return {message:'Day name is required (up to 100 characters).',name:'Enter a day name.'};
    if(day.type==='days')return templates.some(template=>template.id===day.dayId)?undefined:{message:'Choose an available day template.',source:'Choose an available day template.'};
    if(!day.entries.length)return {message:'Add at least one meal to this day.'};
    const meals:Record<string,MealIssue>={};
    for(const meal of day.entries){
      const issue:MealIssue={};
      if(!meal.name.trim()||meal.name.trim().length>100)issue.name='Enter a meal name (up to 100 characters).';
      if(meal.type==='meals'&&!library.meals.some(template=>template.id===meal.mealId))issue.source='Choose an available meal template.';
      if(meal.type==='custom'){
        if(!meal.foods.length)issue.foods='Add at least one food to this meal.';
        const foodIssues:Record<string,string>={};
        for(const food of meal.foods){
          if(!library.foods.some(option=>option.id===food.id))foodIssues[food.key]='Choose an available food.';
          else if(!Number.isFinite(Number(food.quantity))||Number(food.quantity)<0.01||Number(food.quantity)>10000)foodIssues[food.key]='Quantity must be between 0.01 and 10,000.';
        }
        if(Object.keys(foodIssues).length)issue.foodIssues=foodIssues;
      }
      if(Object.keys(issue).length)meals[meal.key]=issue;
    }
    return Object.keys(meals).length?{message:'Complete the highlighted meal details.',meals}:undefined;
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||submitting.current||pendingFood)return;
    const nameIssue=name.trim().length<2||name.trim().length>150?'Plan name must contain 2–150 characters.':'';
    const problems:Record<string,DayIssue>={};for(const day of days){const issue=validateDay(day);if(issue)problems[day.key]=issue;}
    setNameError(nameIssue);setDayIssues(problems);
    if(nameIssue||Object.keys(problems).length){
      if(!nameIssue)setActiveDay(Object.keys(problems)[0]!);
      requestAnimationFrame(()=>formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());return;
    }
    const items=days.map(day=>day.type==='days'?{id:day.dayId,label:day.name}:{id:day.key,type:'custom',label:day.name,notes:day.notes,items:serializeDayEntries(day.entries)});
    submitting.current=true;setSaving(true);onBusy(true);onSubmitting(true);setError('');
    try {
      await apiRequest('/coach/nutrition-library/plans'+(initial?'/'+initial.id:''),{method:initial?'PUT':'POST',body:JSON.stringify({name,notes,items,version:initial?.version??1})});
      onMessage('Nutrition plan '+(initial?'updated':'created')+'.');await onSaved();
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save plan. Please try again.');}
    finally{submitting.current=false;setSaving(false);onBusy(false);onSubmitting(false);}
  }
  return <form ref={formRef} id={formId} className="nutrition-plan-builder" noValidate onSubmit={save}>
    <Notice transient message={error} error onClear={()=>setError('')}/>
    <fieldset disabled={busy} className="plan-builder-fields">
      <section className="builder-plan-info" aria-label="Plan information"><h3 className="builder-section-title">Plan</h3>
        <label>Plan name<input aria-label="Plan name" name="name" value={name} minLength={2} maxLength={150} required aria-invalid={!!nameError} aria-describedby={nameError?formId+'-name-error':undefined} onChange={event=>{setName(event.target.value);setNameError('');}}/>{nameError&&<small className="builder-field-error" id={formId+'-name-error'}>{nameError}</small>}</label>
        <label>Description<textarea name="notes" value={notes} maxLength={2000} rows={2} placeholder="Optional description…" onChange={event=>setNotes(event.target.value)}/></label>
      </section>
      <section className="builder-days" aria-label="Days"><h3 className="builder-section-title">Days</h3>
        <FoodLibraryStatus library={library}/>
        {!available&&<p className="builder-empty">Create days, meals or foods first. <button type="button" className="secondary" onClick={()=>onNavigate('days')}>Go to days</button> <button type="button" className="secondary" onClick={()=>onNavigate('foods')}>Go to foods</button></p>}
        <div className="builder-sections">{days.map((day,index)=>{
          const open=activeDay===day.key;const template=templates.find(entry=>entry.id===day.dayId);
          const count=day.type==='days'?(template?.data.items?.length??0):day.entries.length;
          const issue=dayIssues[day.key];const totals=day.type==='days'?template?.data.nutrients:dayTotals(day.entries,library.meals,library.foods);
          return <section className={'builder-section builder-day'+(issue?' is-invalid':'')} key={day.key}>
            <div className="builder-summary-row"><button type="button" className="builder-toggle" aria-expanded={open} aria-controls={formId+'-'+day.key} aria-label={'Edit day '+(day.name||index+1)} onClick={()=>setActiveDay(current=>current===day.key?null:day.key)}>
              <span><small>Day {index+1}</small><strong>{day.name||'Unnamed day'}</strong><small>{count} {count===1?'meal':'meals'}{totals?' · '+totals.calories.toLocaleString(undefined,{maximumFractionDigits:1})+' kcal':''}{issue?' · '+issue.message:''}</small></span><span className="builder-chevron" aria-hidden="true">{open?'⌃':'⌄'}</span>
            </button><button type="button" className="danger icon-button" title="Remove day" aria-label={'Remove day '+(day.name||index+1)} disabled={days.length===1} onClick={()=>{markDirty();setDays(current=>current.filter(item=>item.key!==day.key));if(open)setActiveDay(null);}}>×</button></div>
            {open&&<div className="builder-section-content" id={formId+'-'+day.key}>
              <div className="form-row"><label>Day name<input aria-label="Day name" required maxLength={100} placeholder="e.g. Training day" value={day.name} aria-invalid={!!issue?.name} onChange={event=>updateDay(day.key,{name:event.target.value})}/>{issue?.name&&<small className="builder-field-error">{issue.name}</small>}</label>
              <label>Day type<select value={day.type} onChange={event=>updateDay(day.key,{type:event.target.value as PlanDay['type']})}><option value="days">Use saved day</option><option value="custom">Build day</option></select></label></div>
              {day.type==='days'?<label>Day template<select required value={day.dayId} aria-invalid={!!issue?.source} onChange={event=>{const dayId=event.target.value;updateDay(day.key,{dayId,...(!day.name?{name:templates.find(entry=>entry.id===dayId)?.data.name??''}:{})});}}><option value="">Choose day</option>{day.dayId&&!template&&<option value={day.dayId} disabled>Unavailable day — choose a replacement</option>}{templates.map(entry=><option key={entry.id} value={entry.id}>{entry.data.name}</option>)}</select>{issue?.source&&<small className="builder-field-error">{issue.source}</small>}</label>:<>
                <label>Day notes<textarea maxLength={2000} rows={2} value={day.notes} onChange={event=>updateDay(day.key,{notes:event.target.value})}/></label>
                {issue&&!issue.name&&!issue.source&&!issue.meals&&<p role="alert" className="builder-field-error">{issue.message}</p>}
                <CompactMealsEditor meals={day.entries} setMeals={update=>{markDirty();setDays(current=>current.map(item=>item.key===day.key?{...item,entries:typeof update==='function'?update(item.entries):update}:item));setDayIssues(current=>{const next={...current};delete next[day.key];return next;});}} templates={library.meals} foods={library.foods} chooseFood={library.chooseFood} issues={issue?.meals} onPendingChange={setPendingFood}/>
              </>}
              {totals&&<div className="builder-totals"><small>Day total</small><NutritionTotals nutrients={totals}/></div>}
              <button type="button" className="secondary" onClick={()=>setActiveDay(null)}>Done with day</button>
            </div>}
          </section>;
        })}</div>
        <button type="button" className="secondary" disabled={days.length>=31} onClick={()=>{const day=newDay();markDirty();setDays(current=>[...current,day]);setActiveDay(day.key);}}>Add day</button>
      </section>
      {pendingFood&&<p className="builder-empty" role="status">Add or cancel the food before creating the plan.</p>}
    </fieldset>
  </form>;
}
