import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { ClientNutritionDetails } from '../coach/client-plan-details';
import { SupplementDetails, type SupplementPlan } from '../coach/supplement-studio';
import type { NutritionNode } from '../nutrition/nutrition-details';
import './client-plans.css';

type Plans = { assignment: { snapshot: NutritionNode } | null; supplements?: { snapshot: SupplementPlan } | null };
export function AssignedNutritionPlan({ supplementsOnly = false, refreshVersion = 0 }: { supplementsOnly?: boolean; refreshVersion?: number }) {
  const [plans, setPlans] = useState<Plans | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setPlans(null); setError('');
    void apiRequest<Plans>('/client/nutrition-plan').then(result => { if (active) setPlans(result); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load assigned plans.'); });
    return () => { active = false; };
  }, [attempt, refreshVersion]);
  if (error) return <section className="card client-plan-panel"><p role="alert">{error}</p><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry assigned plans</button></section>;
  if (!plans) return <section className="card client-plan-panel"><p role="status">Loading assigned plans…</p></section>;
  return <div className="client-assigned-plans">
    {!supplementsOnly && <section className="card client-plan-panel" aria-label="Assigned meal plan"><header className="client-plan-heading"><div><p className="eyebrow">Assigned meal plan</p><h2>{plans.assignment?.snapshot.name ?? 'Your nutrition plan'}</h2></div>{plans.assignment && <span className="status active">Assigned</span>}</header>{plans.assignment ? <ClientNutritionDetails node={plans.assignment.snapshot} /> : <p className="client-plan-empty">Your coach has not assigned a meal plan yet.</p>}</section>}
    {supplementsOnly && <section className="card client-plan-panel" aria-label="Assigned supplement plan"><header className="client-plan-heading"><div><p className="eyebrow">Assigned supplement plan</p><h2>{plans.supplements?.snapshot.name ?? 'Your supplements'}</h2></div>{plans.supplements && <span className="status active">Assigned</span>}</header>{plans.supplements ? <div className="client-supplement-content"><SupplementDetails plan={plans.supplements.snapshot} /></div> : <p className="client-plan-empty">Your coach has not assigned a supplement plan yet.</p>}</section>}
  </div>;
}
