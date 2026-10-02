import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { notify } from '../../lib/notify';

type ClientOption = { id: string; name: string; email: string; assignmentId: string | null };
export function ProgramAssignment({ programId, busy, onBusy, revision, onChanged }: { programId: string; busy: boolean; onBusy: (value: boolean) => void; revision: number; onChanged: () => void }) {
  const saving = useRef(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const search = query.trim();
  useEffect(() => {
    let active = true;
    setError('');
    if (!search) {
      setItems([]); setHasMore(false); setLoading(false); return;
    }
    setItems([]); setLoading(true); setHasMore(false);
    const timer = window.setTimeout(() => {
      void apiRequest<{ items: ClientOption[]; hasMore: boolean }>(`/coach/programs/assignment-clients?programId=${programId}&q=${encodeURIComponent(search)}`)
        .then(result => { if (active) { setItems(result.items); setHasMore(result.hasMore); } })
        .catch(() => { if (active) setError('Unable to search clients. Please try again.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, retry, programId, revision]);
  async function toggle(client: ClientOption) {
    if (busy || saving.current) return;
    saving.current = true; onBusy(true);
    try {
      let assignmentId: string | null = null;
      if (client.assignmentId) {
        await apiRequest('/coach/programs/' + programId + '/assignments/' + client.assignmentId, { method: 'DELETE' });
      } else {
        const result = await apiRequest<{ assignments: { id: string }[] }>('/coach/programs/' + programId + '/assign', { method: 'POST', body: JSON.stringify({ clientIds: [client.id] }) });
        assignmentId = result.assignments[0]!.id;
      }
      setItems(current => current.map(item => item.id === client.id ? { ...item, assignmentId } : item));
      notify.success(client.assignmentId ? 'Program removed from ' + client.name + '.' : 'Program assigned to ' + client.name + '.');
      onChanged();
    } catch (cause) { notify.error(cause instanceof Error ? cause.message : 'Unable to update assignment. Please try again.'); }
    finally { saving.current = false; onBusy(false); }
  }
  return <section className="program-assign-controls" aria-label="Assign to clients">
    <p className="assignment-help assignment-intro">Check a client to assign this program; uncheck to remove it. Changes save immediately. Assigning replaces their current program.</p>
    <label>Search clients<input type="search" placeholder="Search by name or email…" maxLength={180} value={query} disabled={busy} onChange={event => setQuery(event.target.value)}/></label>
    {search && <div className="assignment-client-list" aria-label="Client search results" aria-busy={loading}>
      <h5 className="assignment-results-heading">Search results</h5>
      {loading ? <p role="status">Searching clients…</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : items.length ? items.map(client => <label className="assignment-client-option" key={client.id}>
        <input type="checkbox" checked={!!client.assignmentId} disabled={busy} onChange={() => void toggle(client)}/>
        <span><strong>{client.name}</strong><small>{client.email}</small></span>
      </label>) : <p role="status">{search ? 'No clients match your search.' : 'No approved clients available.'}</p>}
    </div>}
    {!search && <p className="detail-empty">Search by name or email to find clients.</p>}
    {hasMore && <p>Showing the first 50 clients. Refine your search to find more.</p>}

  </section>;
}
