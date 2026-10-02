import type { ReactNode } from 'react';
import type { NutritionNode } from './nutrition-details';
import './food-table.css';

const format = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
export function FoodTableCells({ food, children, actions, weight, metadataCells }: { food: NutritionNode; children?: ReactNode; actions: ReactNode; weight?:ReactNode;metadataCells?:ReactNode }) {
  return <>
    <td className="food-name"><strong>{food.name}</strong>{children}</td>
    <td className="food-weight">{weight??<>{format(food.servingSize)} {food.unit ?? ''}</>}</td>
    <td><div className="food-macronutrients">
      <span><small>Protein</small><span>{format(food.nutrients?.protein)} g</span></span>
      <span><small>Carbs</small><span>{format(food.nutrients?.carbs)} g</span></span>
      <span><small>Fat</small><span>{format(food.nutrients?.fat)} g</span></span>
    </div></td>
    <td className="food-calories">{format(food.nutrients?.calories)} kcal</td>
    {metadataCells}
    <td className="food-actions"><div className="actions">{actions}</div></td>
  </>;
}
