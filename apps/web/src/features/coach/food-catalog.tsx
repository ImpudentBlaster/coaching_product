import '../nutrition/food-library.css';
import { NutritionTotals } from '../nutrition/nutrition-details';
import { notify } from '../../lib/notify';
import { useEffect,useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Collection } from '../../components/collection';
import { type NutritionEntry } from '../nutrition/nutrition-details';

type Food={id:string;libraryEntryId:string;category:string;source:{name:string;url:string};data:NutritionEntry['data']};
export function FoodCatalog({entries,onAdded,onCreate,onCatalogLoaded}:{entries:NutritionEntry[];onAdded:()=>Promise<void>;onCreate?:()=>void;onCatalogLoaded?:(ids:string[])=>void}) {
  const [foods,setFoods]=useState<Food[]>([]);const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [adding,setAdding]=useState('');const [category,setCategory]=useState('');const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');
    void apiRequest<{foods:Food[]}>('/coach/nutrition-library/catalog').then(result=>{if(active){setFoods(result.foods);onCatalogLoaded?.(result.foods.map(food=>food.libraryEntryId));}}).catch((error:unknown)=>{if(active)setError(error instanceof Error?error.message:'Unable to load food library');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[attempt,onCatalogLoaded]);
  async function add(food:Food){if(adding)return;setAdding(food.id);try{await apiRequest(`/coach/nutrition-library/catalog/${food.id}/add`,{method:'POST',body:'{}'});await onAdded();notify.success(`${food.data.name} added to your foods.`);}catch(error){notify.error(error instanceof Error?error.message:'Unable to add food. Try again.');}finally{setAdding('');}}
  const existing=new Set(entries.map(entry=>entry.id));
  return <section className="food-catalog food-library">
    <p className="food-library-reference">Reference values per 100 g edible portion, including liquids by weight. Match raw/cooked preparation; brands and recipes vary.</p>
    <Collection title="Food library" countLabel="foods available" searchPlaceholder="Search foods…" emptyState={{title:"No foods found",description:"Try a different search or category."}} loading={loading} error={error} onRetry={()=>setAttempt(value=>value+1)} actions={<><label className="food-library-category"><span className="sr-only">Category</span><select value={category} onChange={event=>setCategory(event.target.value)}><option value="">All categories</option>{[...new Set(foods.map(food=>food.category))].sort().map(value=><option key={value}>{value}</option>)}</select></label>{onCreate&&<button className="secondary" onClick={onCreate}>Add custom food</button>}</>}>
      {foods.filter(food=>!category||food.category===category).map(food=><article className="food-catalog-row" key={food.id} data-search={food.data.name+' '+food.category}><div><span className="eyebrow">{food.category}</span><h3>{food.data.name}</h3><small>Per {food.data.servingSize} {food.data.unit}</small>{food.data.nutrients&&<NutritionTotals nutrients={food.data.nutrients}/>}<a className="food-source" href={food.source.url} target="_blank" rel="noreferrer">USDA source ↗</a></div>{existing.has(food.libraryEntryId)?<span className="food-library-added"><span aria-hidden="true">✓ </span>Added</span>:<button className="primary small" disabled={!!adding} onClick={()=>void add(food)}>{adding===food.id?'Adding…':<><span aria-hidden="true">+ </span>Add to my foods</>}</button>}</article>)}
    </Collection>
  </section>;
}
