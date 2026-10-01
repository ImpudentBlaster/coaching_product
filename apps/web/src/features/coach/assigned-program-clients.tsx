import { useEffect, useState } from 'react';
import { Notice } from '../../components/editor-dialog';
import { apiRequest } from '../../lib/api';

type Assignment = { id: string; clientId: string; name: string; email: string };
export function AssignedProgramClients({ programId, busy, onBusy, externalRevision = 0, onChanged }: { programId: string; busy: boolean; onBusy: (value: boolean) => void; externalRevision?: number; onChanged?: () => void }) {
  const [items, setItems] = useState<Assignment[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [removing, setRemoving] = useState<Assignment | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setItems([]);
    void apiRequest<{ items: Assignment[]; hasMore: boolean }>(`/coach/programs/${programId}/assignments?offset=${offset}`)
      .then(result => { if (active) { setItems(result.items); setHasMore(result.hasMore); } })
      .catch(() => { if (active) setError('Unable to load assigned clients. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [programId, offset, revision, externalRevision]);
  async function remove() {
    if (!removing || busy) return;
    onBusy(true); setError(''); setMessage('');
    try {
      await apiRequest(`/coach/programs/${programId}/assignments/${removing.id}`, { method: 'DELETE' });
      setMessage(`Program removed from ${removing.name}.`);
      setRemoving(null); setOffset(0); setRevision(value => value + 1); onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to remove assignment.'); }
    finally { onBusy(false); }
  }
  return <section className="assigned-program-clients" aria-label="Currently assigned clients">
    <h4>Currently assigned to</h4>
    <Notice message={message} onClear={() => setMessage('')}/>
    <Notice message={error} error onClear={() => setError('')}/>
    {error && !removing && <button type="button" className="secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}>Retry assigned clients</button>}
    {loading ? <p role="status">Loading assigned clients…</p> : !error && !items.length ? <p>No clients are assigned to this program.</p> : <ul>{items.map(item => <li key={item.id}><div><strong>{item.name}</strong><small>{item.email}</small></div><button type="button" className="danger" disabled={busy} aria-label={`Remove program from ${item.name}`} onClick={() => { setRemoving(item); setError(''); }}>Remove</button></li>)}</ul>}
    {removing && <div className="assignment-remove-confirm" role="group" aria-label="Confirm removal"><p>Remove this program from <strong>{removing.name}</strong>? Completed workout history will be kept.</p><div className="workout-confirm-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button type="button" className="danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing…' : 'Remove assignment'}</button></div></div>}
    {(offset > 0 || hasMore) && <div className="workout-confirm-actions"><button type="button" className="secondary" disabled={busy || loading || offset === 0} onClick={() => { setRemoving(null); setOffset(value => Math.max(0,value - 20)); }}>Previous clients</button><button type="button" className="secondary" disabled={busy || loading || !hasMore} onClick={() => { setRemoving(null); setOffset(value => value + 20); }}>Next clients</button></div>}
  </section>;
}
