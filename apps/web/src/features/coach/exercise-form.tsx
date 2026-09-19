import { useEffect, useId, useState, type FormEvent } from 'react';
import { apiRequest, type Exercise } from '../../lib/api';
import { Notice } from '../../components/editor-dialog';

type Filters = { bodyParts: string[]; equipment: string[]; targets: string[] };
function readGif(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]!);
    reader.onerror = () => reject(new Error('Unable to read this GIF. Please select it again.'));
    reader.readAsDataURL(file);
  });
}
export function ExerciseForm({ onSaved, onBusy }: { onSaved: (exercise: Exercise) => void; onBusy: (busy: boolean) => void }) {
  const id = useId();
  const [filters, setFilters] = useState<Filters>({ bodyParts: [], equipment: [], targets: [] });
  const [steps, setSteps] = useState(['']);
  const [gif, setGif] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void apiRequest<Filters>('/exercises/filters').then(result => { if (active) setFilters(result); }).catch(() => { /* Category suggestions are optional; free text remains usable. */ }); return () => { active = false; }; }, []);
  useEffect(() => { if (!gif) { setPreview(''); return; } const url = URL.createObjectURL(gif); setPreview(url); return () => URL.revokeObjectURL(url); }, [gif]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); onBusy(true); setError('');
    try {
      const secondaryMuscles = String(form.get('secondaryMuscles')).split(',').map(value => value.trim()).filter(Boolean);
      const result = await apiRequest<{ exercise: Exercise }>('/exercises', { method: 'POST', body: JSON.stringify({ name: String(form.get('name')), bodyPart: String(form.get('bodyPart')), equipment: String(form.get('equipment')), target: String(form.get('target')), secondaryMuscles: [...new Set(secondaryMuscles)], instructions: steps.map(step => step.trim()), ...(gif ? { gif: await readGif(gif) } : {}) }) });
      onSaved(result.exercise);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to add exercise.'); }
    finally { setSaving(false); onBusy(false); }
  }
  return <form className="vertical exercise-form" onSubmit={event => void save(event)}>
    <p className="exercise-library-hint">Uses the same fields as the exercise library. Your exercises are available to your coaching practice and can be used in workout templates.</p>
    <Notice message={error} error onClear={() => setError('')} />
    <fieldset disabled={saving} className="vertical">
      <label>Exercise name<input name="name" required minLength={2} maxLength={180} placeholder="e.g. Seated dumbbell press" /></label>
      <div className="form-row"><label>Body part<input name="bodyPart" list={`${id}-body`} required maxLength={100} placeholder="e.g. shoulders" /></label><label>Equipment<input name="equipment" list={`${id}-equipment`} required maxLength={100} placeholder="e.g. dumbbell" /></label></div>
      <label>Target muscle<input name="target" list={`${id}-target`} required maxLength={100} placeholder="e.g. delts" /></label>
      <label>Secondary muscles<input name="secondaryMuscles" maxLength={2020} placeholder="e.g. triceps, upper chest" /><small>Optional. Separate muscle names with commas (up to 20).</small></label>
      <datalist id={`${id}-body`}>{filters.bodyParts.map(value => <option key={value} value={value} />)}</datalist><datalist id={`${id}-equipment`}>{filters.equipment.map(value => <option key={value} value={value} />)}</datalist><datalist id={`${id}-target`}>{filters.targets.map(value => <option key={value} value={value} />)}</datalist>
      <div className="vertical"><h3>Step-by-step instructions</h3>{steps.map((step, index) => <div className="exercise-instruction" key={index}><label>Step {index + 1}<textarea required maxLength={2000} value={step} onChange={event => setSteps(previous => previous.map((value, position) => position === index ? event.target.value : value))} /></label><button className="secondary" type="button" disabled={steps.length === 1} aria-label={`Remove step ${index + 1}`} onClick={() => setSteps(previous => previous.filter((_, position) => position !== index))}>Remove</button></div>)}<button className="secondary" type="button" disabled={steps.length >= 30} onClick={() => setSteps(previous => [...previous, ''])}>Add instruction step</button></div>
      <label>Animation (optional GIF)<input type="file" accept="image/gif,.gif" onChange={event => {
        const file = event.target.files?.[0]; setError('');
        if (file && (!file.size || file.size > 8 * 1024 * 1024 || !/\.gif$/i.test(file.name))) { setError('Choose a GIF file up to 8 MB.'); event.target.value = ''; return; }
        setGif(file ?? null); event.target.value = '';
      }} /><small>Up to 8 MB, 200 frames. Instructions remain available without an animation.</small></label>
      {preview && <div className="exercise-upload-preview"><img src={preview} alt="New exercise animation preview" /><span>{gif?.name}</span><button className="secondary" type="button" onClick={() => setGif(null)}>Remove animation</button></div>}
    </fieldset>
    <button className="primary" type="submit" disabled={saving}>{saving ? 'Saving exercise…' : 'Save exercise'}</button>
  </form>;
}
