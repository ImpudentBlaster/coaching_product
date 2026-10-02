import { ExerciseGif } from '../../components/exercise-gif';
import { useEffect, useState } from 'react';
import { apiRequest, type Exercise, type WorkoutTemplate } from '../../lib/api';
import './workout-details.css';

export function WorkoutExerciseDetails({ exercises }: { exercises: WorkoutTemplate['exercises'] }) {
  return <ol className="workout-detail-exercises">{[...exercises].sort((a,b) => a.position-b.position).map((exercise, index) => <li className="workout-exercise-card" key={`${exercise.exerciseId}-${index}`}>
          <div className="workout-detail-exercise-heading"><div className="workout-exercise-preview"><ExerciseGif id={exercise.exerciseId} name={exercise.name} available={exercise.gifAvailable ?? true} /></div><span className="detail-exercise-number" aria-hidden="true">{index + 1}</span><h4>{exercise.name}</h4></div>
          <dl className="workout-detail-stats">
            <div><dt>Sets</dt><dd>{exercise.sets}</dd></div>
            <div><dt>Reps</dt><dd>{exercise.repetitions ?? '—'}</dd></div>
            <div><dt>Rest</dt><dd>{exercise.restSeconds}s</dd></div>
            <div><dt>RPE</dt><dd>{exercise.targetRpe ?? '—'}</dd></div>
            {exercise.durationSeconds !== null && <div><dt>Duration</dt><dd>{exercise.durationSeconds}s</dd></div>}
            {exercise.tempo && <div><dt>Tempo</dt><dd>{exercise.tempo}</dd></div>}
          </dl>
          <ExerciseInstructions exercise={exercise} />
          {exercise.notes && <p className="workout-detail-notes"><strong>Notes</strong><br/>{exercise.notes}</p>}
        </li>)}</ol>;
}

function ExerciseInstructions({ exercise }: { exercise: WorkoutTemplate['exercises'][number] }) {
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState(exercise.instructions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open || instructions !== undefined) return;
    let active = true;
    setLoading(true); setError('');
    void apiRequest<{ items: Exercise[] }>(`/exercises?q=${encodeURIComponent(exercise.name)}&limit=50`).then(result => {
      const match = result.items.find(item => item.id === exercise.exerciseId);
      if (!match) throw new Error('Exercise instructions could not load.');
      if (active) setInstructions(match.instructions);
    }).catch(() => { if (active) setError('Exercise instructions could not load.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, instructions, exercise.exerciseId, exercise.name, retry]);
  return <details className="workout-exercise-instructions" onToggle={event => setOpen(event.currentTarget.open)}><summary>Instructions<span className="sr-only"> for {exercise.name}</span></summary>{loading || (instructions === undefined && !error) ? <p role="status">Loading instructions…</p> : error ? <div role="alert">{error} <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Retry instructions</button></div> : instructions?.length ? <ol>{instructions.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p>No instructions available.</p>}</details>;
}
