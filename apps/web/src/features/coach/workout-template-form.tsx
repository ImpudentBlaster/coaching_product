import { Notice } from '../../components/editor-dialog';
import { useState, type FormEvent } from 'react';
import { apiRequest, type Exercise, type WorkoutTemplate } from '../../lib/api';

export function WorkoutTemplateForm({ exercises, onSaved, onMessage, initial, onBusy }: {
  exercises: Exercise[];
  initial?: WorkoutTemplate|undefined;
  onBusy?: (busy:boolean)=>void;
  onSaved: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [rows, setRows] = useState<string[]>(() => initial?.exercises.map((_,index)=>String(index))??[crypto.randomUUID()]);
  const [saving, setSaving] = useState(false);
  const [error,setError]=useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);onBusy?.(true);setError('');
    try {
      await apiRequest(`/coach/workout-templates${initial?'/'+initial.id:''}`, {
        method: initial?'PUT':'POST',
        body: JSON.stringify({
          name: String(data.get('name')),
          description: String(data.get('description')),
          exercises: rows.map(id => ({
            durationSeconds:initial?.exercises[Number(id)]?.durationSeconds??null,
            tempo:initial?.exercises[Number(id)]?.tempo??null,
            exerciseId: String(data.get(`${id}-exercise`)),
            sets: Number(data.get(`${id}-sets`)),
            repetitions: Number(data.get(`${id}-repetitions`)),
            restSeconds: Number(data.get(`${id}-restSeconds`)),
            targetRpe: Number(data.get(`${id}-rpe`)),
            notes: String(data.get(`${id}-notes`)),
          })),
        }),
      });
      form.reset();
      setRows([crypto.randomUUID()]);
      onMessage(initial?'Workout template updated.':'Workout template created.');
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create workout');
    } finally {
      setSaving(false);onBusy?.(false);
    }
  }

  return <form className="card profile-card vertical" onSubmit={save}><Notice message={error} error onClear={()=>setError('')}/>
    <h2>{initial?'Edit workout template':'Create workout template'}</h2>
    <label>Name<input name="name" defaultValue={initial?.name} minLength={2} maxLength={150} required disabled={saving}/></label>
    <label>Description<textarea name="description" defaultValue={initial?.description} maxLength={2000} disabled={saving}/></label>
    {rows.map((id, index) => <fieldset className="vertical" key={id} disabled={saving}>
      <legend>Exercise {index + 1}</legend>
      <label>Exercise<select name={`${id}-exercise`} required defaultValue={initial?.exercises[Number(id)]?.exerciseId??''}>
        <option value="">Choose exercise</option>{initial?.exercises[Number(id)]&&!exercises.some(e=>e.id===initial.exercises[Number(id)]?.exerciseId)&&<option value={initial.exercises[Number(id)]!.exerciseId}>{initial.exercises[Number(id)]!.name}</option>}
        {exercises.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name} · {exercise.target}</option>)}
      </select></label>
      <div className="form-row">
        <label>Sets<input name={`${id}-sets`} type="number" min="1" max="100" defaultValue={initial?.exercises[Number(id)]?.sets??3} required/></label>
        <label>Reps<input name={`${id}-repetitions`} type="number" min="0" defaultValue={initial?.exercises[Number(id)]?.repetitions??10} required/></label>
        <label>Rest sec<input name={`${id}-restSeconds`} type="number" min="0" max="3600" defaultValue={initial?.exercises[Number(id)]?.restSeconds??60} required/></label>
        <label>RPE<input name={`${id}-rpe`} type="number" min="0" max="10" step="any" defaultValue={initial?.exercises[Number(id)]?.targetRpe??7} required/></label>
      </div>
      <label>Notes<textarea name={`${id}-notes`} defaultValue={initial?.exercises[Number(id)]?.notes??''} maxLength={1000}/></label>
      <button type="button" className="danger" aria-label={`Remove exercise ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(row => row !== id))}>Remove exercise</button>
    </fieldset>)}
    <button type="button" className="secondary" disabled={saving || rows.length >= 100} onClick={() => setRows(current => [...current, crypto.randomUUID()])}>Add exercise</button>
    <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : initial?'Save changes':'Create template'}</button>
  </form>;
}
