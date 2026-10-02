import { useEffect, useId, useState, type Dispatch, type SetStateAction } from 'react';
import { FoodSelect } from './food-select';
import { NutritionTotals, type NutritionEntry, type NutritionNode } from './nutrition-details';
import { NutritionFoodList } from './nutrition-food-list';
import { dayEntryTotals, newEntry, newFood, type DayEntry, type FoodRow } from './day-entry-state';

export type MealIssue={name?:string;source?:string;foods?:string;foodIssues?:Record<string,string>};
type Selection={id:string;quantity:string};
export function CompactMealsEditor({meals,setMeals,templates,foods,chooseFood,issues,onPendingChange}:{meals:DayEntry[];setMeals:Dispatch<SetStateAction<DayEntry[]>>;templates:NutritionEntry[];foods:Array<{id:string;data:NutritionNode}>;chooseFood:(id:string)=>Selection|undefined|Promise<Selection|undefined>;issues?:Record<string,MealIssue>|undefined;onPendingChange:(value:boolean)=>void}) {
  const [active,setActive]=useState<string|null>(null);
  const [draft,setDraft]=useState<{mealKey:string;food:FoodRow;editing:boolean}|null>(null);
  const [draftError,setDraftError]=useState('');
  const sectionId=useId();
  useEffect(()=>{onPendingChange(!!draft);return()=>onPendingChange(false);},[draft,onPendingChange]);
  useEffect(()=>{const first=Object.keys(issues??{})[0];if(first)setActive(first);},[issues]);
  function updateMeal(key:string,update:Partial<DayEntry>){setMeals(current=>current.map(meal=>meal.key===key?{...meal,...update}:meal));}
  function toggle(key:string){setActive(current=>current===key?null:key);setDraft(null);setDraftError('');}
  function editFood(mealKey:string,food:FoodRow,editing:boolean){setDraft({mealKey,food:{...food},editing});setDraftError('');}
  function selectFood(id:string){
    if(!draft)return;const key=draft.food.key;const selection=chooseFood(id);
    function selected(value:Selection|undefined){if(value)setDraft(current=>current?.food.key===key?{...current,food:{...current.food,...value}}:current);}
    if(selection instanceof Promise)void selection.then(selected);else selected(selection);
  }
  function commitFood(){
    if(!draft)return;
    const quantity=Number(draft.food.quantity);
    if(!foods.some(food=>food.id===draft.food.id)){setDraftError('Choose a food from the dropdown.');return;}
    if(!Number.isFinite(quantity)||quantity<0.01||quantity>10000){setDraftError('Quantity must be between 0.01 and 10,000.');return;}
    setMeals(current=>current.map(meal=>meal.key!==draft.mealKey?meal:{...meal,foods:draft.editing?meal.foods.map(food=>food.key===draft.food.key?draft.food:food):[...meal.foods,draft.food]}));
    setDraft(null);setDraftError('');
  }
  return <section className="plan-meals-builder" aria-label="Meals">
    <h4 className="builder-section-title">Meals</h4>
    {!meals.length&&<p className="builder-empty">No meals added yet.</p>}
    <div className="builder-sections">{meals.map((meal,index)=>{
      const open=active===meal.key;const template=templates.find(entry=>entry.id===meal.mealId);
      const count=meal.type==='meals'?(template?.data.items?.length??0):meal.foods.filter(food=>food.id).length;
      const issue=issues?.[meal.key];const invalid=issue&&Object.values(issue).some(Boolean);
      const totals=dayEntryTotals(meal,templates,foods);
      return <section className={`builder-section builder-meal${invalid?' is-invalid':''}`} key={meal.key}>
        <div className="builder-summary-row"><button type="button" className="builder-toggle" aria-expanded={open} aria-controls={`${sectionId}-${meal.key}`} aria-label={`Edit meal ${meal.name||index+1}`} onClick={()=>toggle(meal.key)}>
          <span><strong>{meal.name||`Meal ${index+1}`}</strong><small>{count} {count===1?'food':'foods'} · {totals.calories.toLocaleString(undefined,{maximumFractionDigits:1})} kcal{invalid&&' · Needs attention'}</small></span><span className="builder-chevron" aria-hidden="true">{open?'⌃':'⌄'}</span>
        </button><button type="button" className="danger icon-button" title="Remove meal" aria-label={`Remove meal ${meal.name||index+1}`} disabled={meals.length===1} onClick={()=>{setMeals(current=>current.filter(item=>item.key!==meal.key));if(active===meal.key)setActive(null);}}>×</button></div>
        {open&&<div className="builder-section-content" id={`${sectionId}-${meal.key}`}>
          <div className="form-row"><label>Meal name<input aria-label="Meal name" required maxLength={100} placeholder="e.g. Breakfast" value={meal.name} aria-invalid={!!issue?.name} aria-describedby={issue?.name?`${sectionId}-${meal.key}-name-error`:undefined} onChange={event=>updateMeal(meal.key,{name:event.target.value})}/>{issue?.name&&<small className="builder-field-error" id={`${sectionId}-${meal.key}-name-error`}>{issue.name}</small>}</label>
          <label>Meal source<select value={meal.type} onChange={event=>{updateMeal(meal.key,{type:event.target.value as DayEntry['type']});setDraft(null);}}><option value="custom">Add foods</option><option value="meals">Use saved meal</option></select></label></div>
          {meal.type==='meals'?<>
            <label>Meal template<select required value={meal.mealId} aria-invalid={!!issue?.source} onChange={event=>{const mealId=event.target.value;updateMeal(meal.key,{mealId,...(!meal.name?{name:templates.find(entry=>entry.id===mealId)?.data.name??''}:{})});}}><option value="">Choose meal</option>{meal.mealId&&!template&&<option value={meal.mealId} disabled>Unavailable meal — choose a replacement</option>}{templates.map(entry=><option key={entry.id} value={entry.id}>{entry.data.name}</option>)}</select>{issue?.source&&<small className="builder-field-error">{issue.source}</small>}</label>
            {template?.data.items?.length?<NutritionFoodList items={template.data.items}/>:<p className="builder-empty">Choose a saved meal to see its foods.</p>}
          </>:<>
            <h5 className="builder-section-title">Foods</h5>
            {!meal.foods.length&&<p className="builder-empty">No foods added yet.</p>}
            {issue?.foods&&<p className="builder-field-error" role="alert">{issue.foods}</p>}
            <ul className="builder-food-list">{meal.foods.map((food,index)=>{
              const node=foods.find(option=>option.id===food.id)?.data;
              return <li key={food.key}><div><strong>{node?.name??'Unavailable food'}</strong><small>{food.quantity} {node?.unit??''}</small>{issue?.foodIssues?.[food.key]&&<small className="builder-field-error">{issue.foodIssues[food.key]}</small>}</div>
                <div className="actions"><button type="button" className="secondary icon-button" title="Edit food" aria-label={`Edit food ${node?.name??index+1}`} onClick={()=>editFood(meal.key,food,true)}>✎</button><button type="button" className="danger icon-button" title="Remove food" aria-label={`Remove food ${node?.name??index+1}`} onClick={()=>updateMeal(meal.key,{foods:meal.foods.filter(row=>row.key!==food.key)})}>×</button></div>
              </li>;
            })}</ul>
            {draft?.mealKey===meal.key?<div className="builder-food-editor">
              <h5>{draft.editing?'Edit food':'Add food'}</h5>
              <FoodSelect index={draft.editing?meal.foods.findIndex(food=>food.key===draft.food.key)+1:meal.foods.length+1} options={foods} value={draft.food.id} onSelect={selectFood}/>
              <label>Quantity ({foods.find(food=>food.id===draft.food.id)?.data.unit??'food unit'})<input type="number" min="0.01" max="10000" step="any" value={draft.food.quantity} aria-invalid={!!draftError} onChange={event=>setDraft(current=>current?{...current,food:{...current.food,quantity:event.target.value}}:current)}/></label>
              {draftError&&<p role="alert" className="builder-field-error">{draftError}</p>}
              <div className="actions"><button type="button" className="secondary" onClick={()=>{setDraft(null);setDraftError('');}}>Cancel food</button><button type="button" className="primary" onClick={commitFood}>{draft.editing?'Save food':'Add food'}</button></div>
            </div>:<button type="button" className="secondary" disabled={!foods.length||meal.foods.length>=30} onClick={()=>editFood(meal.key,newFood(),false)}>Add food</button>}
          </>}
          <div className="builder-totals"><small>Meal total</small><NutritionTotals nutrients={totals}/></div>
          <button type="button" className="secondary" onClick={()=>toggle(meal.key)}>Done with meal</button>
        </div>}
      </section>;
    })}</div>
    <button type="button" className="secondary" disabled={meals.length>=12} onClick={()=>{const meal={...newEntry(),foods:[]};setMeals(current=>[...current,meal]);setActive(meal.key);setDraft(null);}}>Add meal</button>
  </section>;
}
