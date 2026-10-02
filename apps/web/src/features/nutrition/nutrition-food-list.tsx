import { NutritionTotals, type NutritionNode } from './nutrition-details';

export function NutritionFoodList({ items }: { items: NonNullable<NutritionNode['items']> }) {
  return <ul className="meal-food-list">{items.map((item,index)=><li key={`${item.id}-${index}`}>
    <h5>{item.node.name}</h5>
    {item.label&&<p className="meal-food-quantity">{item.label}</p>}
    <p className="meal-food-quantity">{item.quantity??item.node.servingSize} {item.node.unit}</p>
    {item.nutrients&&<NutritionTotals nutrients={item.nutrients}/>}
  </li>)}</ul>;
}
