import { useEffect, useState } from 'react';
import { apiRequest, type Exercise } from '../../lib/api';
import { ExerciseGif } from '../../components/exercise-gif';
import { EditorDialog, Notice } from '../../components/editor-dialog';
import { ExerciseForm } from './exercise-form';
import './exercise-library.css';

export function ExerciseLibrary({ onCreated }: { onCreated?: () => void }) {
  const [query, setQuery] = useState('');
  const [criteria, setCriteria] = useState({ search: '', page: 1 });
  const [items, setItems] = useState<Exercise[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const pending = query.trim() !== criteria.search;
  useEffect(() => {
    const timer = window.setTimeout(() => setCriteria(previous => previous.search === query.trim() ? previous : { search: query.trim(), page: 1 }), 350);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void apiRequest<{ items: Exercise[]; total: number }>(`/exercises?q=${encodeURIComponent(criteria.search)}&page=${criteria.page}&limit=10`).then(result => {
      if (active) { setItems(result.items); setTotal(result.total); }
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : 'Unable to load exercises'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [criteria, retry]);
  function search(value: string) { setQuery(value); setCriteria({ search: value.trim(), page: 1 }); }
  return <section className="card collection exercise-library" aria-busy={loading || pending}>
    <header className="collection-toolbar"><div><h2>Exercises</h2><p className="exercise-library-hint">Explore the library or add an exercise for your coaching practice.</p></div><button className="primary" onClick={() => setEditing(true)}>Add exercise</button></header>
    <div className="exercise-search-area"><form className="collection-tools" onSubmit={event => { event.preventDefault(); search(query); }}><label className="collection-search"><span className="sr-only">Search exercises</span><input type="search" value={query} placeholder="Search exercises…" maxLength={180} onChange={event => setQuery(event.target.value)} /></label>{query && <button className="secondary" type="button" onClick={() => search('')}>Clear</button>}</form>
    </div>
    <Notice message={message} onClear={() => setMessage('')} />
    {items.length > 0 && (loading || pending) && <span className="sr-only" role="status">Refreshing exercises…</span>}
    {error ? <div className="collection-empty" role="alert">{error}<button className="secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : (loading || pending) && !items.length ? <p className="collection-empty" role="status">Searching exercises…</p> : items.length ? <div className="exercise-table-scroll" tabIndex={0} role="region" aria-label="Exercise results table"><table className="exercise-table"><caption className="sr-only">Exercise library results</caption><colgroup><col className="exercise-col-preview"/><col className="exercise-col-name"/><col className="exercise-col-body"/><col className="exercise-col-equipment"/><col className="exercise-col-target"/><col className="exercise-col-instructions"/></colgroup><thead><tr><th scope="col">Preview</th><th scope="col">Exercise</th><th scope="col">Body part</th><th scope="col">Equipment</th><th scope="col">Target muscles</th><th scope="col">Instructions</th></tr></thead><tbody>{items.map(exercise => <tr key={exercise.id}><td><ExerciseGif id={exercise.id} name={exercise.name} available={exercise.gifAvailable} /></td><th scope="row">{exercise.name}{exercise.custom && <span className="status approved">Your exercise</span>}</th><td>{exercise.bodyPart}</td><td>{exercise.equipment}</td><td>{exercise.target}{exercise.secondaryMuscles.length > 0 && <small>Also works: {exercise.secondaryMuscles.join(', ')}</small>}</td><td><details><summary>Instructions<span className="sr-only"> for {exercise.name}</span></summary><ol>{exercise.instructions.map((step, index) => <li key={index}>{step}</li>)}</ol></details></td></tr>)}</tbody></table></div> : <div className="collection-empty"><h3>No exercises found</h3><p>Try a different search or add a new exercise.</p></div>}
    <footer className="collection-pagination"><span>{total} exercises · Page {criteria.page} of {Math.max(1, Math.ceil(total / 10))}</span><div className="actions"><button className="secondary" disabled={Boolean(error) || loading || pending || criteria.page === 1} onClick={() => setCriteria(value => ({ ...value, page: value.page - 1 }))}>Previous</button><button className="secondary" disabled={Boolean(error) || loading || pending || criteria.page * 10 >= total} onClick={() => setCriteria(value => ({ ...value, page: value.page + 1 }))}>Next</button></div></footer>
    {editing && <EditorDialog title="Add exercise" busy={saving} onClose={() => setEditing(false)}><ExerciseForm onBusy={setSaving} onSaved={exercise => { setEditing(false); search(''); setMessage(`${exercise.name} added to your exercise library.`); onCreated?.(); }} /></EditorDialog>}
  </section>;
}
