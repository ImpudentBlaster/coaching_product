import { useId, useState } from 'react';
import type { ProgramAssignment } from '../../lib/api';
import { WorkoutExerciseDetails } from '../coach/workout-exercise-details';
import './client-plans.css';

export function ClientTrainingPlan({ assignment }: { assignment: ProgramAssignment }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const days = assignment.snapshot.days;
  const index = selected < days.length ? selected : 0;
  const day = days[index];
  const sets = day?.exercises.reduce((total, exercise) => total + exercise.sets, 0) ?? 0;
  return <section className="card client-plan-panel client-training-plan" aria-label="Assigned training plan">
    <header className="client-plan-heading"><div><p className="eyebrow">Your active program</p><h2>{assignment.snapshot.name}</h2><p>{days.length} {days.length === 1 ? 'training day' : 'training days'}</p></div><span className="status active">Assigned</span></header>
    <div className="detail-view"><section className="detail-section"><h3 className="detail-section-title">Program overview</h3><p className="workout-description">{assignment.snapshot.description || 'Follow your assigned sessions below. Open an exercise’s instructions for technique guidance.'}</p></section></div>
    {day ? <><div className="client-workout-tabs" role="tablist" aria-label="Training days">{days.map((item, position) => <button key={position} type="button" role="tab" id={`${id}-tab-${position}`} aria-selected={index === position} aria-controls={`${id}-panel`} tabIndex={index === position ? 0 : -1} onClick={() => setSelected(position)} onKeyDown={event => { let next = position; if (event.key === 'ArrowRight') next = (position + 1) % days.length; else if (event.key === 'ArrowLeft') next = (position - 1 + days.length) % days.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = days.length - 1; else return; event.preventDefault(); setSelected(next); document.getElementById(`${id}-tab-${next}`)?.focus(); }}><span>Day {position + 1}</span>{item.dayLabel || item.name}</button>)}</div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${index}`} tabIndex={0} className="detail-view client-workout-panel"><div className="client-workout-heading"><div><h3>{day.name}</h3><p>{day.exercises.length} {day.exercises.length === 1 ? 'exercise' : 'exercises'} <span aria-hidden="true">·</span> {sets} total sets</p></div></div><WorkoutExerciseDetails key={`${assignment.id}-${index}`} exercises={day.exercises} />{!day.exercises.length && <p className="detail-empty">No exercises in this workout yet.</p>}</div></> : <p className="client-plan-empty">Your coach has not added training days to this program yet.</p>}
  </section>;
}
