type Nutrients = { calories: number; protein: number; carbs: number; fat: number };
export type NutritionNode = { kind: 'foods' | 'meals' | 'days' | 'plans'; name: string; notes: string; custom?: boolean; nutrients?: Nutrients; servingSize?: number; unit?: string; items?: Array<{ id: string; label?: string; quantity?: number; node: NutritionNode; nutrients?: Nutrients }> };
export type NutritionEntry = { version?:number; id: string; data: NutritionNode; createdAt: string; updatedAt?:string };
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
export function NutritionTotals({ nutrients, inline=false }: { nutrients: Nutrients; inline?:boolean }) {
  const Container=inline?'span':'p';
  return <Container className="nutrition-totals"><strong>{format(nutrients.calories)} kcal</strong><span>{format(nutrients.protein)}g protein</span><span>{format(nutrients.carbs)}g carbs</span><span>{format(nutrients.fat)}g fat</span></Container>;
}
export function NutritionDetails({ node }: { node: NutritionNode }) {
  return <div>
    {node.notes && <p>{node.notes}</p>}
    {node.kind === 'foods' && <p>Per {node.servingSize} {node.unit}</p>}
    {node.nutrients && <NutritionTotals nutrients={node.nutrients}/>}
    {node.items?.map((item, index) => <details className="nutrition-detail" key={`${item.id}-${index}`} open={node.kind === 'plans'}>
      <summary>{item.node.custom?(item.label||item.node.name):<>{item.label ? `${item.label} — ` : ''}{item.node.name}</>}{item.quantity !== undefined ? ` · ${item.quantity} ${item.node.unit}` : ''}</summary>
      {item.quantity !== undefined ? <>{item.nutrients && <NutritionTotals nutrients={item.nutrients}/>}<p>{item.node.notes}</p></> : <NutritionDetails node={item.node}/>}
    </details>)}
  </div>;
}
