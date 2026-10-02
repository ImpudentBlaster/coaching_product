import { NutritionTotals, type NutritionEntry, type NutritionNode } from './nutrition-details';
import { FoodSelect } from './food-select';
import type { Dispatch, SetStateAction } from 'react';
import { newFood, newEntry, dayEntryTotals, type DayEntry, type FoodRow } from './day-entry-state';
export function DayEntriesEditor({dayEntries,setDayEntries,meals,foods,chooseFood}:{dayEntries:DayEntry[];setDayEntries:Dispatch<SetStateAction<DayEntry[]>>;meals:NutritionEntry[];foods:Array<{id:string;data:NutritionNode}>;chooseFood:(id:string)=>{id:string;quantity:string}|undefined|Promise<{id:string;quantity:string}|undefined>}) {
  function updateEntry(key:string,update:Partial<DayEntry>){setDayEntries(current=>current.map(entry=>entry.key===key?{...entry,...update}:entry));}
  function updateFood(entryKey:string,foodKey:string,update:Partial<FoodRow>){setDayEntries(current=>current.map(entry=>entry.key===entryKey?{...entry,foods:entry.foods.map(food=>food.key===foodKey?{...food,...update}:food)}:entry));}
  function selectFood(entryKey:string,foodKey:string,id:string){const value=chooseFood(id);if(value instanceof Promise)void value.then(selection=>{if(selection)updateFood(entryKey,foodKey,selection);});else if(value)updateFood(entryKey,foodKey,value);}
  return <>
      {dayEntries.map((entry,index)=><fieldset className="nutrition-fields" key={entry.key}><legend>Entry {index+1}</legend>
        <label>Entry name<input required maxLength={100} pattern=".*\S.*" placeholder="e.g. Breakfast" value={entry.name} onChange={event=>updateEntry(entry.key,{name:event.target.value})}/></label>
        <label>Entry type<select value={entry.type} onChange={event=>updateEntry(entry.key,{type:event.target.value as DayEntry['type']})}><option value="custom">Add foods</option><option value="meals">Use saved meal</option></select></label>
        {entry.type==='meals'?<label>Meal<select required value={entry.mealId} onChange={event=>{const mealId=event.target.value;updateEntry(entry.key,{mealId,...(!entry.name?{name:meals.find(meal=>meal.id===mealId)?.data.name??''}:{})});}}><option value="">Choose meal</option>{entry.mealId&&!meals.some(meal=>meal.id===entry.mealId)&&<option value={entry.mealId} disabled>Unavailable meal — choose a replacement</option>}{meals.map(meal=><option key={meal.id} value={meal.id}>{meal.data.name}</option>)}</select></label>:<>
          {entry.foods.map((food,index)=><fieldset className="nutrition-fields" key={food.key}><legend>Food {index+1}</legend>
            <FoodSelect index={index+1} options={foods} value={food.id} onSelect={id=>void selectFood(entry.key,food.key,id)}/>
            <label>Quantity ({foods.find(option=>option.id===food.id)?.data.unit??'food unit'})<input type="number" min="0.01" max="10000" step="any" required value={food.quantity} onChange={event=>updateFood(entry.key,food.key,{quantity:event.target.value})}/></label>
            <button type="button" className="danger" aria-label={`Remove food ${index+1} from entry ${entry.name||' '+(index+1)}`} disabled={entry.foods.length===1} onClick={()=>updateEntry(entry.key,{foods:entry.foods.filter(row=>row.key!==food.key)})}>Remove food</button>
          </fieldset>)}
          <button type="button" className="secondary" disabled={!foods.length||entry.foods.length>=30} onClick={()=>updateEntry(entry.key,{foods:[...entry.foods,newFood()]})}>Add food</button>
        </>}
        <strong>Entry totals</strong><NutritionTotals nutrients={dayEntryTotals(entry,meals,foods)}/>
        <button type="button" className="danger" aria-label={`Remove entry ${index+1}`} disabled={dayEntries.length===1} onClick={()=>setDayEntries(current=>current.filter(row=>row.key!==entry.key))}>Remove entry</button>
      </fieldset>)}
      <button type="button" className="secondary" disabled={dayEntries.length>=12} onClick={()=>setDayEntries(current=>[...current,newEntry()])}>Add entry</button>
  </>;
}
