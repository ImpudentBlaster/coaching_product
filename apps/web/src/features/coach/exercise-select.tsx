import { useEffect, useState } from 'react';
import { apiRequest, type Exercise } from '../../lib/api';

export function ExerciseSelect({ name, index, exercises, initialId = '', initialName = '' }: { name: string; index: number; exercises: Exercise[]; initialId?: string; initialName?: string }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(exercises);
  const [selected, setSelected] = useState({ id: initialId, name: initialName });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!query.trim()) { setItems(exercises); setLoading(false); setError(''); return; }
    setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      void apiRequest<{ items: Exercise[] }>(`/exercises?q=${encodeURIComponent(query.trim())}&limit=50`).then(result => { if (active) setItems(result.items); }).catch(() => { if (active) setError('Search failed. Try another search.'); }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, exercises]);
  return <div className="exercise-picker"><label>Find exercise {index}<input type="search" value={query} maxLength={180} placeholder="Search the full exercise library…" onChange={event => setQuery(event.target.value)} /></label><label>Exercise<select name={name} required value={selected.id} onChange={event => setSelected({ id: event.target.value, name: items.find(item => item.id === event.target.value)?.name ?? initialName })}><option value="">Choose exercise</option>{selected.id && !items.some(item => item.id === selected.id) && <option value={selected.id}>{selected.name}</option>}{items.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name} · {exercise.target}{exercise.custom ? ' · Your exercise' : ''}</option>)}</select></label>{loading && <p role="status">Searching exercises…</p>}{error && <p role="alert">{error}</p>}{!loading && !error && query.trim() && !items.length && <p>No matching exercises.</p>}</div>;
}
