import { Notice } from '../../components/editor-dialog';
import { useState, type FormEvent } from 'react';
import { ExerciseSelect } from './exercise-select';
import { apiRequest, type Exercise, type WorkoutTemplate, type Program } from '../../lib/api';

export function ProgramForm({ templates, exercises = [], onSaved, onMessage, initial, onBusy }: {
  templates: WorkoutTemplate[];
  exercises?: Exercise[];
  initial?: Program|undefined;
  onBusy?: (busy:boolean)=>void;
  onSaved: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  function newDay(dayLabel: string) { return { id: crypto.randomUUID(), dayLabel, mode: templates.some(template => !template.archived_at && !template.program_day_only) ? 'workout' : 'manual', exerciseRows: [crypto.randomUUID()] }; }
  const [rows, setRows] = useState(() => initial?.days.map((day,index)=>({id:String(index),dayLabel:day.dayLabel,mode:day.manual?'manual':'workout',exerciseRows:templates.find(template=>template.id===day.templateId)?.exercises.map((_,exerciseIndex)=>String(exerciseIndex))??[crypto.randomUUID()]}))??[newDay('Day 1')]);
  const [saving, setSaving] = useState(false);
  const [error,setError]=useState('');
  const availableTemplates = templates.filter(template => !template.archived_at && !template.program_day_only);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);onBusy?.(true);setError('');
    try {
      await apiRequest(`/coach/programs${initial?'/'+initial.id:''}`, {
        method: initial?'PUT':'POST',
        body: JSON.stringify({
          name: String(data.get('name')),
          description: String(data.get('description')),
          days: rows.map(row => ({
            dayLabel: row.dayLabel.trim(),
            ...(row.mode === 'workout' ? { templateId: String(data.get(`${row.id}-template`)) } : {
              exercises: row.exerciseRows.map(exerciseRow => {
                const prefix = `${row.id}-${exerciseRow}`;
                const original = templates.find(template => template.id === initial?.days[Number(row.id)]?.templateId)?.exercises[Number(exerciseRow)];
                return { exerciseId: String(data.get(`${prefix}-exercise`)), sets: Number(data.get(`${prefix}-sets`)), repetitions: Number(data.get(`${prefix}-repetitions`)), restSeconds: Number(data.get(`${prefix}-restSeconds`)), targetRpe: Number(data.get(`${prefix}-rpe`)), notes: String(data.get(`${prefix}-notes`)), durationSeconds: original?.durationSeconds ?? null, tempo: original?.tempo ?? null };
              }),
            }),
          })),
        }),
      });
      form.reset();
      setRows([newDay('Day 1')]);
      onMessage(initial?'Program updated successfully.':'Program created successfully.');
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create program');
    } finally {
      setSaving(false);onBusy?.(false);
    }
  }

  function addWorkout() {
    setRows(current => {
      let day = current.length + 1;
      while (current.some(row => row.dayLabel.trim() === `Day ${day}`)) day++;
      return [...current, newDay(`Day ${day}`)];
    });
  }

  return <form className="card profile-card vertical" onSubmit={save}><Notice transient message={error} error onClear={()=>setError('')}/>
    <h2>{initial?'Edit program':'Create program'}</h2>
    {initial?.status === 'PUBLISHED' && <p>Changes apply to future assignments. Existing clients keep their assigned version.</p>}
    <label>Name<input name="name" defaultValue={initial?.name} minLength={2} maxLength={150} required disabled={saving}/></label>
    <label>Description<textarea name="description" defaultValue={initial?.description} maxLength={2000} disabled={saving}/></label>

    {rows.map((row, index) => <fieldset key={row.id} disabled={saving} style={{ display: 'grid', gap: '1rem', minWidth: 0 }}>
      <legend>Day {index + 1}</legend>
      <label>Day exercises<select value={row.mode} onChange={event => { const mode = event.target.value; setRows(current => current.map(item => item.id === row.id ? { ...item, mode } : item)); }}><option value="workout" disabled={!availableTemplates.length}>Existing workout</option><option value="manual">Add exercises manually</option></select></label>
      {row.mode === 'workout' ? <label>Workout<select name={`${row.id}-template`} required defaultValue={initial?.days[Number(row.id)]?.templateId??''}>
        <option value="">Choose workout</option>
        {availableTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
      </select></label> : <>
        {row.exerciseRows.map((exerciseRow, exerciseIndex) => {
          const prefix = `${row.id}-${exerciseRow}`;
          const original = templates.find(template => template.id === initial?.days[Number(row.id)]?.templateId)?.exercises[Number(exerciseRow)];
          return <fieldset className="vertical" key={exerciseRow}><legend>Exercise {exerciseIndex + 1}</legend>
            <ExerciseSelect name={`${prefix}-exercise`} index={exerciseIndex + 1} exercises={exercises} initialId={original?.exerciseId ?? ''} initialName={original?.name ?? ''}/>
            <div className="form-row"><label>Sets<input name={`${prefix}-sets`} type="number" min="1" max="100" defaultValue={original?.sets ?? 3} required/></label><label>Reps<input name={`${prefix}-repetitions`} type="number" min="0" defaultValue={original?.repetitions ?? 10} required/></label><label>Rest sec<input name={`${prefix}-restSeconds`} type="number" min="0" max="3600" defaultValue={original?.restSeconds ?? 60} required/></label><label>RPE<input name={`${prefix}-rpe`} type="number" min="0" max="10" step="any" defaultValue={original?.targetRpe ?? 7} required/></label></div>
            <label>Notes<textarea name={`${prefix}-notes`} defaultValue={original?.notes ?? ''} maxLength={1000}/></label>
            <button type="button" className="danger" aria-label={`Remove exercise ${exerciseIndex + 1} from day ${index + 1}`} disabled={row.exerciseRows.length === 1} onClick={() => setRows(current => current.map(item => item.id === row.id ? { ...item, exerciseRows: item.exerciseRows.filter(value => value !== exerciseRow) } : item))}>Remove exercise</button>
          </fieldset>;
        })}
        <button type="button" className="secondary" disabled={row.exerciseRows.length >= 100} onClick={() => setRows(current => current.map(item => item.id === row.id ? { ...item, exerciseRows: [...item.exerciseRows, crypto.randomUUID()] } : item))}>Add exercise</button>
      </>}
      <label>Day label<input value={row.dayLabel} maxLength={100} required pattern=".*\S.*" onChange={event => setRows(current => current.map(item => item.id === row.id ? { ...item, dayLabel: event.target.value } : item))}/></label>
      <button type="button" className="danger" aria-label={`Remove day ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.id !== row.id))}>Remove day</button>
    </fieldset>)}
    <button type="button" className="secondary" disabled={saving || rows.length >= 100} onClick={addWorkout}>Add day</button>
    <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : initial?'Save changes':'Create program'}</button>
  </form>;
}
