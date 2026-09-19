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
  const [suggestions, setSuggestions] = useState<Exercise[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [suggestionError, setSuggestionError] = useState('');
  const [retry, setRetry] = useState(0);
  const [shuffle, setShuffle] = useState(0);
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
  useEffect(() => {
    let active = true; setSuggestions([]); setSuggestionError('');
    void apiRequest<{ items: Exercise[] }>(`/exercises/suggestions?q=${encodeURIComponent(criteria.search)}`).then(result => { if (active) setSuggestions(result.items); }).catch(() => { if (active) setSuggestionError('Suggestions could not load.'); });
    return () => { active = false; };
  }, [criteria.search, shuffle, retry]);
  function search(value: string) { setQuery(value); setCriteria({ search: value.trim(), page: 1 }); }
  return <section className="card collection exercise-library">
    <header className="collection-toolbar"><div><h2>Exercises</h2><p className="exercise-library-hint">Explore the library or add an exercise for your coaching practice.</p></div><button className="primary" onClick={() => setEditing(true)}>Add exercise</button></header>
    <div className="exercise-search-area"><form className="collection-tools" onSubmit={event => { event.preventDefault(); search(query); }}><label className="collection-search"><span className="sr-only">Search exercises</span><input type="search" value={query} placeholder="Search exercises…" maxLength={180} onChange={event => setQuery(event.target.value)} /></label>{query && <button className="secondary" type="button" onClick={() => search('')}>Clear</button>}</form>
      <div className="exercise-suggestion-heading"><span>{criteria.search ? 'Try a matching exercise' : 'Try something different'}</span><button type="button" disabled={pending} onClick={() => setShuffle(value => value + 1)}>Shuffle suggestions</button></div>
      <div className="exercise-suggestions" aria-label="Exercise suggestions">{!pending && suggestions.map(exercise => <button type="button" key={exercise.id} onClick={() => search(exercise.name)}>{exercise.name}<small>{exercise.bodyPart} · {exercise.equipment}</small></button>)}</div>
      {suggestionError && <p className="exercise-library-hint" role="status">{suggestionError} Use Shuffle suggestions to retry.</p>}
    </div>
    <Notice message={message} onClear={() => setMessage('')} />
    {error ? <div className="collection-empty" role="alert">{error}<button className="secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : loading || pending ? <p className="collection-empty" role="status">Searching exercises…</p> : items.length ? <div className="exercise-grid">{items.map(exercise => <article className="exercise-card" key={exercise.id}><ExerciseGif id={exercise.id} name={exercise.name} available={exercise.gifAvailable} /><div>{exercise.custom && <span className="status approved">Your exercise</span>}<h3>{exercise.name}</h3><p>{exercise.bodyPart} · {exercise.equipment}</p><p>Target: {exercise.target}</p>{exercise.secondaryMuscles.length > 0 && <p>Also works: {exercise.secondaryMuscles.join(', ')}</p>}<details><summary>Instructions</summary><ol>{exercise.instructions.map((step, index) => <li key={index}>{step}</li>)}</ol></details></div></article>)}</div> : <p className="collection-empty">No exercises match your search. Try another name or add your own exercise.</p>}
    <footer className="collection-pagination"><span>{total} exercises · Page {criteria.page} of {Math.max(1, Math.ceil(total / 10))}</span><div className="actions"><button className="secondary" disabled={loading || pending || criteria.page === 1} onClick={() => setCriteria(value => ({ ...value, page: value.page - 1 }))}>Previous</button><button className="secondary" disabled={loading || pending || criteria.page * 10 >= total} onClick={() => setCriteria(value => ({ ...value, page: value.page + 1 }))}>Next</button></div></footer>
    {editing && <EditorDialog title="Add exercise" busy={saving} onClose={() => setEditing(false)}><ExerciseForm onBusy={setSaving} onSaved={exercise => { setEditing(false); search(exercise.name); setRetry(value => value + 1); setMessage(`${exercise.name} added to your exercise library.`); onCreated?.(); }} /></EditorDialog>}
  </section>;
}
