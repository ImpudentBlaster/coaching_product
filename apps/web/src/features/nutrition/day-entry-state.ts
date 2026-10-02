import type { NutritionNode } from './nutrition-details';
export type FoodRow = { key:string; id:string; quantity:string };
export type DayEntry = { key:string; name:string; type:'custom'|'meals'; mealId:string; foods:FoodRow[] };
export const newFood = ():FoodRow=>({key:crypto.randomUUID(),id:'',quantity:'100'});
export const newEntry = ():DayEntry=>({key:crypto.randomUUID(),name:'',type:'custom',mealId:'',foods:[newFood()]});


export function initialDayEntries(node?:NutritionNode):DayEntry[] {
  return node?.items?.map(item=>({
    key:item.node.custom?item.id:crypto.randomUUID(),name:item.label??item.node.name,
    type:item.node.custom||item.node.kind==='foods'?'custom':'meals',mealId:item.node.kind==='meals'&&!item.node.custom?item.id:'',
    foods:item.node.kind==='foods'?[{key:crypto.randomUUID(),id:item.id,quantity:String(item.quantity??item.node.servingSize??100)}]:item.node.custom?(item.node.items??[]).map(food=>({key:crypto.randomUUID(),id:food.id,quantity:String(food.quantity??100)})):[newFood()],
  }))??[newEntry()];
}
export function serializeDayEntries(entries:DayEntry[]) {
  return entries.map(entry=>entry.type==='meals'?{id:entry.mealId,label:entry.name}:{id:entry.key,type:'custom' as const,label:entry.name,foods:entry.foods.map(food=>({id:food.id,quantity:Number(food.quantity)}))});
}
export function dayEntryTotals(entry:DayEntry,meals:Array<{id:string;data:NutritionNode}>,foods:Array<{id:string;data:NutritionNode}>) {
  if(entry.type==='meals')return meals.find(meal=>meal.id===entry.mealId)?.data.nutrients??{calories:0,protein:0,carbs:0,fat:0};
  return entry.foods.reduce((total,row)=>{
    const food=foods.find(food=>food.id===row.id)?.data;const factor=Number(row.quantity)/(food?.servingSize??1);
    for(const key of ['calories','protein','carbs','fat'] as const)total[key]+=(food?.nutrients?.[key]??0)*factor;
    return total;
  },{calories:0,protein:0,carbs:0,fat:0});
}
export function dayTotals(entries:DayEntry[],meals:Array<{id:string;data:NutritionNode}>,foods:Array<{id:string;data:NutritionNode}>) {
  return entries.reduce((total,entry)=>{const value=dayEntryTotals(entry,meals,foods);for(const key of ['calories','protein','carbs','fat'] as const)total[key]+=value[key];return total;},{calories:0,protein:0,carbs:0,fat:0});
}
