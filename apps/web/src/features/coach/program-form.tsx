import { Notice } from '../../components/editor-dialog';
import { useState, type FormEvent } from 'react';
import { apiRequest, type WorkoutTemplate, type Program } from '../../lib/api';

export function ProgramForm({ templates, onSaved, onMessage, initial, onBusy }: {
  templates: WorkoutTemplate[];
  initial?: Program|undefined;
  onBusy?: (busy:boolean)=>void;
  onSaved: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [rows, setRows] = useState(() => initial?.days.map((day,index)=>({id:String(index),dayLabel:day.dayLabel}))??[{ id: crypto.randomUUID(), dayLabel: 'Day 1' }]);
  const [saving, setSaving] = useState(false);
  const [error,setError]=useState('');
  const availableTemplates = templates.filter(template => !template.archived_at);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !availableTemplates.length) return;
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
            templateId: String(data.get(`${row.id}-template`)),
            dayLabel: row.dayLabel.trim(),
          })),
        }),
      });
      form.reset();
      setRows([{ id: crypto.randomUUID(), dayLabel: 'Day 1' }]);
      onMessage(initial?'Program updated.':'Program created.');
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
      return [...current, { id: crypto.randomUUID(), dayLabel: `Day ${day}` }];
    });
  }

  return <form className="card profile-card vertical" onSubmit={save}><Notice message={error} error onClear={()=>setError('')}/>
    <h2>{initial?'Edit program':'Create program'}</h2>
    <label>Name<input name="name" defaultValue={initial?.name} minLength={2} maxLength={150} required disabled={saving}/></label>
    <label>Description<textarea name="description" defaultValue={initial?.description} maxLength={2000} disabled={saving}/></label>
    {!availableTemplates.length && <p>Create a workout template before adding workouts to a program.</p>}
    {rows.map((row, index) => <fieldset key={row.id} disabled={saving} style={{ display: 'grid', gap: '1rem', minWidth: 0 }}>
      <legend>Workout {index + 1}</legend>
      <label>Workout<select name={`${row.id}-template`} required defaultValue={initial?.days[Number(row.id)]?.templateId??''}>
        <option value="">Choose workout</option>
        {availableTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
      </select></label>
      <label>Day label<input value={row.dayLabel} maxLength={100} required pattern=".*\S.*" onChange={event => setRows(current => current.map(item => item.id === row.id ? { ...item, dayLabel: event.target.value } : item))}/></label>
      <button type="button" className="danger" aria-label={`Remove workout ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.id !== row.id))}>Remove workout</button>
    </fieldset>)}
    <button type="button" className="secondary" disabled={saving || rows.length >= 100 || !availableTemplates.length} onClick={addWorkout}>Add workout</button>
    <button type="submit" className="primary" disabled={saving || !availableTemplates.length}>{saving ? 'Saving…' : initial?'Save changes':'Create program'}</button>
  </form>;
}
