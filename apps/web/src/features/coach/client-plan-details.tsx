import type { ProgramAssignment } from '../../lib/api';
import { WorkoutExerciseDetails } from './workout-exercise-details';
import { DayContent } from '../nutrition/day-details';
import { NutritionDetails, NutritionTotals, type NutritionNode } from '../nutrition/nutrition-details';

function distinctName(label: string, name: string) {
  if (!label.trim()) return name;
  return !name.trim() || label.trim().toLowerCase() === name.trim().toLowerCase() ? label || name : `${label} — ${name}`;
}
export function ClientTrainingDetails({ program }: { program: ProgramAssignment }) {
  return <div className="detail-view client-plan-details">
    <section className="detail-section"><h3 className="detail-section-title">Program information</h3><p className="workout-description">{program.snapshot.description || 'No description added.'}</p></section>
    <section className="detail-section" aria-label="Workout schedule"><h3 className="detail-section-title">Workout schedule</h3>
      <ul className="client-workout-schedule">{program.snapshot.days.map((day, index) => <li key={index}><details className="client-workout-details">
        <summary><span className="detail-day-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="detail-day-title"><strong>{distinctName(day.dayLabel, day.name)}</strong><small>{day.exercises.length} {day.exercises.length === 1 ? 'exercise' : 'exercises'}</small></span></summary>
        <div className="program-day-content"><WorkoutExerciseDetails exercises={day.exercises}/>{!day.exercises.length && <p className="detail-empty">No exercises in this workout.</p>}</div>
      </details></li>)}</ul>{!program.snapshot.days.length && <p className="detail-empty">No workouts in this program.</p>}
    </section>
  </div>;
}
export function ClientNutritionDetails({ node }: { node: NutritionNode }) {
  if (node.kind !== 'plans') return <div className="detail-view meal-details client-plan-details"><NutritionDetails node={node}/></div>;
  return <div className="detail-view meal-details plan-details client-plan-details">
    <section className="detail-section"><h3 className="detail-section-title">Plan information</h3><p className="meal-notes">{node.notes || 'No description added.'}</p>{node.nutrients && <NutritionTotals nutrients={node.nutrients}/>}</section>
    <section className="detail-section" aria-label="Day schedule"><h3 className="detail-section-title">Day schedule</h3>
      <ul className="day-entry-list">{node.items?.map((day, index) => <li key={`${day.id}-${index}`}><details className="day-meal-details plan-day-details">
        <summary><span className="day-entry-heading"><strong>{day.label || day.node.name}</strong><span className="day-entry-meta">{day.node.items?.length ?? 0} {day.node.items?.length === 1 ? 'meal' : 'meals'}</span></span>{(day.nutrients ?? day.node.nutrients) && <NutritionTotals inline nutrients={(day.nutrients ?? day.node.nutrients)!}/>}</summary>
        <DayContent node={day.node}/>
      </details></li>)}</ul>{!node.items?.length && <p className="detail-empty">No days in this plan.</p>}
    </section>
  </div>;
}
