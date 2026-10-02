import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { notify } from '../../lib/notify';
import type { NutritionEntry, NutritionNode } from './nutrition-details';

type CatalogFood = {id:string;libraryEntryId:string;data:NutritionNode};
export function useNutritionFoods(entries:NutritionEntry[],onBusy:(busy:boolean)=>void) {
  const [catalog,setCatalog]=useState<CatalogFood[]>([]);
  const [added,setAdded]=useState<NutritionEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [choosing,setChoosing]=useState(false);
  const selecting=useRef(false);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    void apiRequest<{foods:CatalogFood[]}>('/coach/nutrition-library/catalog').then(result=>{if(active)setCatalog(result.foods);}).catch(()=>{if(active)setError('Food library could not load. Your own foods are still available.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[retry]);
  const meals=entries.filter(entry=>entry.data.kind==='meals');
  const ownFoods=[...entries,...added].filter(entry=>entry.data.kind==='foods');
  const foods=[...ownFoods,...catalog.filter(food=>!ownFoods.some(entry=>entry.id===food.libraryEntryId)).map(food=>({id:food.libraryEntryId,data:food.data}))];
  function chooseFood(id:string):{id:string;quantity:string}|undefined|Promise<{id:string;quantity:string}|undefined> {
    if(selecting.current)return;
    const starter=catalog.find(food=>food.libraryEntryId===id);
    if(!starter||ownFoods.some(food=>food.id===id))return {id,quantity:String(foods.find(food=>food.id===id)?.data.servingSize??100)};
    selecting.current=true;setChoosing(true);onBusy(true);
    return copyFood(starter);
  }
  async function copyFood(starter:CatalogFood):Promise<{id:string;quantity:string}|undefined> {
    try {
      const result=await apiRequest<{entry:NutritionEntry}>('/coach/nutrition-library/catalog/'+encodeURIComponent(starter.id)+'/add',{method:'POST',body:'{}'});
      setAdded(current=>[...current.filter(food=>food.id!==result.entry.id),result.entry]);
      return {id:result.entry.id,quantity:String(result.entry.data.servingSize??100)};
    }catch{notify.error('Unable to select food. Please try again.');}
    finally{selecting.current=false;setChoosing(false);onBusy(false);}
  }
  return {meals,foods,loading,error,choosing,chooseFood,retry:()=>setRetry(value=>value+1)};
}
