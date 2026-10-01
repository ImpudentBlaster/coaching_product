import { ActionMenu } from '../../components/action-menu';
import { useState } from 'react';
import { EditorDialog, Notice } from '../../components/editor-dialog';
import { WorkoutExerciseDetails } from './workout-exercise-details';
import { apiRequest, type WorkoutTemplate } from '../../lib/api';

export function WorkoutActions({ workout, onEdit, onDeleted, onMessage, disabled = false, tableCells = false }: {
  workout: WorkoutTemplate;
  onEdit: () => void;
  onDeleted: () => Promise<void>;
  onMessage: (message: string) => void;
  disabled?: boolean;
  tableCells?: boolean;
}) {
  const [panel, setPanel] = useState<'view' | 'delete' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const Cell = tableCells ? 'td' : 'div';

  async function remove() {
    if (deleting) return;
    setDeleting(true); setError('');
    try {
      await apiRequest(`/coach/workout-templates/${workout.id}`, { method: 'DELETE' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete workout. Please try again.');
      setDeleting(false);
      return;
    }
    setPanel(null);
    onMessage('Workout deleted successfully.');
    try { await onDeleted(); } finally { setDeleting(false); }
  }

  return <>
    <Cell><ActionMenu name={workout.name} disabled={disabled || deleting} items={[
      { label: 'Edit', onSelect: onEdit },
      { label: 'Delete', danger: true, onSelect: () => { setError(''); setPanel('delete'); } },
    ]}/></Cell>
    <Cell className="workout-view-cell"><button type="button" className="secondary workout-icon-action" title="View workout" aria-label={`View ${workout.name}`} disabled={disabled || deleting} onClick={() => setPanel('view')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
    </button></Cell>
    {panel === 'view' && <EditorDialog title="Workout details" variant="drawer" onClose={() => setPanel(null)}>
      <div className="workout-details">
        <div className="workout-details-heading"><div><h3>{workout.name}</h3><p>{workout.exercises.length} exercises</p></div><button type="button" className="secondary" onClick={() => { setPanel(null); onEdit(); }}>Edit workout</button></div>
        <p className="workout-description">{workout.description || 'No description added.'}</p>
        <WorkoutExerciseDetails exercises={workout.exercises}/>
        {!workout.exercises.length && <p>No exercises added yet.</p>}
      </div>
    </EditorDialog>}
    {panel === 'delete' && <EditorDialog title="Delete workout?" variant="confirmation" busy={deleting} onClose={() => setPanel(null)}>
      <p>Delete <strong>{workout.name}</strong> from your workout library? Existing assigned workouts will be preserved.</p>
      <Notice message={error} error onClear={() => setError('')}/>
      <div className="workout-confirm-actions"><button type="button" className="secondary" disabled={deleting} onClick={() => setPanel(null)}>Cancel</button><button type="button" className="danger" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete workout'}</button></div>
    </EditorDialog>}
  </>;
}
