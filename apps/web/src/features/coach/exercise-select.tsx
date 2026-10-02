import { useEffect, useId, useRef, useState } from 'react';
import { apiRequest, type Exercise } from '../../lib/api';
import { ExerciseGif } from '../../components/exercise-gif';

export function ExerciseSelect({ name, index, exercises, initialId = '', initialName = '' }: { name: string; index: number; exercises: Exercise[]; initialId?: string; initialName?: string }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState(exercises);
  const [selected, setSelected] = useState({ id: initialId, name: initialName || exercises.find(item => item.id === initialId)?.name || '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  useEffect(() => {
    let active = true;
    setActiveIndex(-1);
    if (!query.trim()) { setItems(exercises); setLoading(false); setError(''); return; }
    setItems([]); setLoading(true); setError('');
    const timer = window.setTimeout(() => {
      void apiRequest<{ items: Exercise[] }>(`/exercises?q=${encodeURIComponent(query.trim())}&limit=50`).then(result => { if (active) setItems(result.items); }).catch(() => { if (active) setError('Search failed. Try another search.'); }).finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, exercises]);
  useEffect(() => { input.current?.setCustomValidity(selected.id ? '' : 'Choose an exercise from the dropdown.'); }, [selected]);
  useEffect(() => { if (open && activeIndex >= 0) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' }); }, [activeIndex, id, open]);
  function close() { setOpen(false); setQuery(''); setActiveIndex(-1); }
  function choose(exercise: Exercise) { setSelected({ id: exercise.id, name: exercise.name }); close(); }
  return <div className="exercise-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <label htmlFor={id}>Exercise</label>
    <input type="hidden" name={name} value={selected.id}/>
    <div className="workout-exercise-selection">
    {selected.id && <div className="workout-exercise-preview" title={`${selected.name} GIF`}>
      <ExerciseGif id={selected.id} name={selected.name} />
    </div>}
    <div className="exercise-combobox-control">
      <input ref={input} id={id} role="combobox" aria-label={`Exercise ${index}`} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off" required={!selected.id} maxLength={180} value={open ? query : selected.name}
        placeholder={selected.name || 'Search and select an exercise…'}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(-1); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActiveIndex(current => items.length ? event.key === 'ArrowDown' ? (current + 1) % items.length : (current <= 0 ? items.length - 1 : current - 1) : -1);
          } else if (event.key === 'Enter' && open) {
            event.preventDefault(); if (items[activeIndex]) choose(items[activeIndex]);
          } else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
        }}/>
      <span className="exercise-combobox-chevron" aria-hidden="true">⌄</span>
    </div>
    </div>
    {open && <div className="exercise-combobox-popup">
      <div role="listbox" id={`${id}-list`} aria-label={`Exercises for exercise ${index}`} aria-busy={loading}>
        {items.map((exercise, optionIndex) => <button type="button" role="option" tabIndex={-1} id={`${id}-option-${optionIndex}`} key={exercise.id}
          aria-selected={selected.id === exercise.id} className={activeIndex === optionIndex ? 'highlighted' : ''}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(exercise)}>
          <span className="exercise-option-preview" aria-hidden="true"><ExerciseGif id={exercise.id} name={exercise.name} available={exercise.gifAvailable ?? true} /></span><span className="exercise-option-text"><strong>{exercise.name}</strong><small>{exercise.target}{exercise.custom ? ' · Your exercise' : ''}</small></span>
        </button>)}
      </div>
      {loading && <p role="status">Searching exercises…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && !items.length && <p role="status">No matching exercises.</p>}
    </div>}
  </div>;
}
