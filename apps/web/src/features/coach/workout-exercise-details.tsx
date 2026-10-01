import { ExerciseGif } from '../../components/exercise-gif';
import type { WorkoutTemplate } from '../../lib/api';

export function WorkoutExerciseDetails({ exercises }: { exercises: WorkoutTemplate['exercises'] }) {
  return <ol className="workout-detail-exercises">{[...exercises].sort((a,b) => a.position-b.position).map((exercise, index) => <li key={`${exercise.exerciseId}-${index}`}>
          <div className="workout-detail-exercise-heading"><div className="workout-exercise-preview"><ExerciseGif id={exercise.exerciseId} name={exercise.name} /></div><h4><span className="workout-exercise-index">{index + 1}.</span> {exercise.name}</h4></div>
          <dl className="workout-detail-stats">
            <div><dt>Sets</dt><dd>{exercise.sets}</dd></div>
            <div><dt>Reps</dt><dd>{exercise.repetitions ?? '—'}</dd></div>
            <div><dt>Rest</dt><dd>{exercise.restSeconds}s</dd></div>
            <div><dt>RPE</dt><dd>{exercise.targetRpe ?? '—'}</dd></div>
            {exercise.durationSeconds !== null && <div><dt>Duration</dt><dd>{exercise.durationSeconds}s</dd></div>}
            {exercise.tempo && <div><dt>Tempo</dt><dd>{exercise.tempo}</dd></div>}
          </dl>
          {exercise.notes && <p className="workout-detail-notes"><strong>Notes</strong><br/>{exercise.notes}</p>}
        </li>)}</ol>;
}
