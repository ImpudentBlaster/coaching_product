import { useId, useState } from 'react';
import type { Program, WorkoutTemplate } from '../../lib/api';
import { WorkoutExerciseDetails } from './workout-exercise-details';

export function ProgramWorkoutDetails({ day, index, workout }: {
  day: Program['days'][number]; index: number; workout: WorkoutTemplate | undefined;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <li className={`program-day-card${open ? ' is-open' : ''}`}>

    <button type="button" className="program-workout-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className="detail-day-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <span className="detail-day-title"><strong>{day.dayLabel}</strong><small>{workout ? `${workout.exercises.length} ${workout.exercises.length === 1 ? 'exercise' : 'exercises'}` : 'Workout details unavailable'}</small></span>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}/></svg>
    </button>
    <div id={id} className="program-day-content" hidden={!open}>
      {open && (workout ? <>
        {workout.description && <p className="workout-description">{workout.description}</p>}
        <h5 className="detail-section-title">Exercises</h5>
        <WorkoutExerciseDetails exercises={workout.exercises}/>
        {!workout.exercises.length && <p>No exercises added yet.</p>}
      </> : <p>This workout’s details are unavailable. Refresh the workspace to try again.</p>)}
    </div>
  </li>;
}
