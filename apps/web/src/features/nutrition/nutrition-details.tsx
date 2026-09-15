import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';

type Nutrients = { calories: number; protein: number; carbs: number; fat: number };
export type NutritionNode = { kind: 'foods' | 'meals' | 'days' | 'plans'; name: string; notes: string; nutrients?: Nutrients; servingSize?: number; unit?: string; items?: Array<{ id: string; label?: string; quantity?: number; node: NutritionNode; nutrients?: Nutrients }> };
export type NutritionEntry = { version?:number; id: string; data: NutritionNode; createdAt: string };
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
export function NutritionTotals({ nutrients }: { nutrients: Nutrients }) {
  return <p className="nutrition-totals"><strong>{format(nutrients.calories)} kcal</strong><span>{format(nutrients.protein)}g protein</span><span>{format(nutrients.carbs)}g carbs</span><span>{format(nutrients.fat)}g fat</span></p>;
}
export function NutritionDetails({ node }: { node: NutritionNode }) {
  return <div>
    {node.notes && <p>{node.notes}</p>}
    {node.kind === 'foods' && <p>Per {node.servingSize} {node.unit}</p>}
    {node.nutrients && <NutritionTotals nutrients={node.nutrients}/>}
    {node.items?.map((item, index) => <details className="nutrition-detail" key={`${item.id}-${index}`} open={node.kind === 'plans'}>
      <summary>{item.label ? `${item.label} — ` : ''}{item.node.name}{item.quantity !== undefined ? ` · ${item.quantity} ${item.node.unit}` : ''}</summary>
      {item.quantity !== undefined ? <>{item.nutrients && <NutritionTotals nutrients={item.nutrients}/>}<p>{item.node.notes}</p></> : <NutritionDetails node={item.node}/>}
    </details>)}
  </div>;
}
export function AssignedNutritionPlan() {
  const [assignment, setAssignment] = useState<{ snapshot: NutritionNode } | null>(null);
  const [status, setStatus] = useState('Loading meal plan…');
  useEffect(() => {
    let active = true;
    void apiRequest<{ assignment: { snapshot: NutritionNode } | null }>('/client/nutrition-plan').then(result => {
      if (active) { setAssignment(result.assignment); setStatus(result.assignment ? '' : 'Your coach has not assigned a meal plan yet.'); }
    }).catch((error: unknown) => { if (active) setStatus(error instanceof Error ? error.message : 'Unable to load meal plan'); });
    return () => { active = false; };
  }, []);
  return <section className="card plan-summary nutrition-assigned"><p className="eyebrow">Assigned meal plan</p>
    {status && <p role="status">{status}</p>}
    {assignment && <><h2>{assignment.snapshot.name}</h2><NutritionDetails node={assignment.snapshot}/></>}
  </section>;
}
