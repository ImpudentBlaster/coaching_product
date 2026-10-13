import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';

type Client = { clientId: string; name: string; email: string; status: string };
export function AssignedPackageClients({ packageId }: { packageId: string }) {
  const [items, setItems] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setItems([]); setHasMore(false);
    const timer = window.setTimeout(() => {
      void apiRequest<{ items: Client[]; hasMore: boolean }>(`/coach/packages/${packageId}/clients?offset=${offset}&query=${encodeURIComponent(query)}`)
        .then(result => { if (active) { setItems(result.items); setHasMore(result.hasMore); } })
        .catch(() => { if (active) setError('Unable to load assigned clients. Please try again.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [packageId, query, offset, revision]);
  return <section className="detail-section package-assigned-clients" aria-label="Assigned clients">
    <h4 className="detail-section-title">Assigned clients</h4>
    <label className="package-client-search"><span className="sr-only">Search assigned clients</span><input type="search" placeholder="Search by name or email…" value={query} onChange={event => { setQuery(event.target.value); setOffset(0); }} /></label>
    {error ? <div role="alert"><p>{error}</p><button type="button" className="secondary" onClick={() => setRevision(value => value + 1)}>Retry assigned clients</button></div> : loading ? <p role="status">Loading assigned clients…</p> : !items.length ? <p className="detail-empty">{query ? 'No clients match your search.' : 'No clients are assigned to this package.'}</p> : <ul className="package-client-list">{items.map(item => <li key={item.clientId}><div><Link to={`/coach/clients/${item.clientId}`}>{item.name}</Link><small>{item.email}</small></div><span className={`status ${item.status === 'APPROVED' ? 'active' : 'pending_review'}`}>{item.status === 'APPROVED' ? 'Approved' : 'Pending approval'}</span></li>)}</ul>}
    {(offset > 0 || hasMore) && <div className="workout-confirm-actions"><button type="button" className="secondary" disabled={loading || offset === 0} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous clients</button><button type="button" className="secondary" disabled={loading || !hasMore} onClick={() => setOffset(value => value + 20)}>Next clients</button></div>}
  </section>;
}
