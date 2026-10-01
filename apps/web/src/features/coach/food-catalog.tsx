import { useEffect,useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Collection } from '../../components/collection';
import { NutritionTotals,type NutritionEntry } from '../nutrition/nutrition-details';

type Food={id:string;libraryEntryId:string;category:string;source:{name:string;url:string};data:NutritionEntry['data']};
export function FoodCatalog({entries,onAdded,onCreate}:{entries:NutritionEntry[];onAdded:()=>Promise<void>;onCreate?:()=>void}) {
  const [foods,setFoods]=useState<Food[]>([]);const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [adding,setAdding]=useState('');const [category,setCategory]=useState('');const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');
    void apiRequest<{foods:Food[]}>('/coach/nutrition-library/catalog').then(result=>{if(active)setFoods(result.foods);}).catch((error:unknown)=>{if(active)setError(error instanceof Error?error.message:'Unable to load starter foods');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[attempt]);
  async function add(food:Food){if(adding)return;setAdding(food.id);setMessage('');try{await apiRequest(`/coach/nutrition-library/catalog/${food.id}/add`,{method:'POST',body:'{}'});await onAdded();setMessage(`${food.data.name} is in your food library. You can now edit it or use it in a meal.`);}catch(error){setMessage(error instanceof Error?error.message:'Unable to add food. Try again.');}finally{setAdding('');}}
  const existing=new Set(entries.map(entry=>entry.id));
  return <section className="food-catalog"><div className="food-catalog-intro"><p className="eyebrow">Starter library</p><h2>Common foods, ready to use</h2>{onCreate&&<button className="secondary" onClick={onCreate}>Add custom food</button>}<p>Add foods to your own library, then adjust them or use them in meals. You can also create custom foods below.</p><p className="profile-muted">Reference values per 100 g edible portion, including liquids by weight. Match raw/cooked preparation; brands and recipes vary.</p></div>
    {message&&<p role="status" className="food-catalog-message">{message}</p>}
    <Collection title="Starter foods" loading={loading} error={error} onRetry={()=>setAttempt(value=>value+1)} actions={<label>Category<select value={category} onChange={event=>setCategory(event.target.value)}><option value="">All categories</option>{[...new Set(foods.map(food=>food.category))].sort().map(value=><option key={value}>{value}</option>)}</select></label>}>
      {foods.filter(food=>!category||food.category===category).map(food=><article className="food-catalog-row" key={food.id} data-search={`${food.data.name} ${food.category}`}><div><span className="eyebrow">{food.category}</span><h3>{food.data.name}</h3><small>Per 100 g</small>{food.data.nutrients&&<NutritionTotals nutrients={food.data.nutrients}/>}<a className="food-source" href={food.source.url} target="_blank" rel="noreferrer">USDA source ↗</a></div><button className={existing.has(food.libraryEntryId)?'secondary':'primary small'} disabled={!!adding||existing.has(food.libraryEntryId)} onClick={()=>void add(food)}>{existing.has(food.libraryEntryId)?'Added to my foods':adding===food.id?'Adding…':'Add to my foods'}</button></article>)}
    </Collection>
  </section>;
}
