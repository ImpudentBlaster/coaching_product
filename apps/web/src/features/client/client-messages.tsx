import { formatDateTime } from '../../lib/dates';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiRequest } from '../../lib/api';
import { LoadingPanel } from '../../components/loading-panel';
import { useAuth } from '../auth/auth-context';
import './client-messages.css';

type Message = { id: string; authorUserId: string; message: string; createdAt: string };
export function ClientMessages({ refreshVersion }: { refreshVersion: number }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [sent, setSent] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const result = await apiRequest<{ messages: Message[] }>('/feedback?context=GENERAL');
      setMessages(result.messages);
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Unable to load messages.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshVersion]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    setBusy(true); setError(''); setSent(false);
    try {
      await apiRequest('/feedback', { method: 'POST', body: JSON.stringify({ context: 'GENERAL', message: draft.trim() }) });
      setDraft(''); setSent(true); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send message.'); }
    finally { setBusy(false); }
  }
  return <section className="card client-messages"><header><div><h2>Conversation with your coach</h2><p>Share an update or ask a question about your plan.</p></div><span className="status approved">General feedback</span></header>
    {loading ? <LoadingPanel label="Loading messages…" /> : loadError ? <div role="alert"><p>{loadError}</p><button className="secondary" onClick={() => void load()}>Try again</button></div> : messages.length ? <ol className="client-conversation" aria-label="Message history">{[...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(item => <li className={item.authorUserId === user?.id ? 'own-message' : 'coach-message'} key={item.id}><div className="conversation-bubble"><header><strong>{item.authorUserId === user?.id ? 'You' : 'Coach'}</strong><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time></header><p>{item.message}</p></div></li>)}</ol> : <p className="conversation-empty">No messages yet. Send your coach an update below.</p>}
    <form onSubmit={event => void send(event)}><label htmlFor="coach-message-draft">Message your coach</label><textarea id="coach-message-draft" rows={4} maxLength={4000} required disabled={busy} value={draft} placeholder="Write your message…" onChange={event => { setDraft(event.target.value); setError(''); setSent(false); }} />{error && <p role="alert">{error}</p>}{sent && <p role="status">Message sent.</p>}<div className="conversation-compose-footer"><small>{draft.length} / 4000</small><button className="primary" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send message'}</button></div></form>
  </section>;
}
