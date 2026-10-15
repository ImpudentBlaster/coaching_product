import { formatDateTime } from '../../lib/dates';
import { useEffect, useState, type FormEvent } from 'react';
import { EditorDialog } from '../../components/editor-dialog';
import { UnsavedChangesSheet } from '../../components/unsaved-changes-sheet';
import { apiRequest } from '../../lib/api';

type Message = { id: string; author: string; authorUserId: string; message: string; createdAt: string };
export function ClientMessageDialog({ clientId, clientName, coachId, onClose }: { clientId: string; clientName: string; coachId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [sent, setSent] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    void apiRequest<{ messages: Message[] }>(`/feedback?context=GENERAL&clientId=${encodeURIComponent(clientId)}`)
      .then(result => { if (active) setMessages(result.messages); })
      .catch(() => { if (active) setLoadError('Unable to load messages. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clientId, attempt]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setError(''); setSent(false);
    try {
      await apiRequest('/feedback', { method: 'POST', body: JSON.stringify({ clientId, context: 'GENERAL', contextId: null, message: text.trim() }) });
      setText(''); setSent(true); setAttempt(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send message.'); }
    finally { setBusy(false); }
  }
  return <EditorDialog title={`Message ${clientName}`} variant="drawer" busy={busy} trackChanges={false} onClose={() => { if (confirmClose) setConfirmClose(false); else if (text.trim()) setConfirmClose(true); else onClose(); }}>
    <div className="client-message-thread" inert={confirmClose}><p className="profile-muted">General coaching feedback with {clientName}.</p>
      {loading ? <p role="status">Loading messages…</p> : loadError ? <div role="alert"><p>{loadError}</p><button type="button" className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry messages</button></div> : messages.length ? <ol aria-label="Message history">{messages.map(item => <li key={item.id} className={item.authorUserId === coachId ? 'from-coach' : ''}><header><strong>{item.authorUserId === coachId ? 'You' : clientName}</strong><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time></header><p>{item.message}</p></li>)}</ol> : <p className="profile-muted">No messages yet. Start the conversation below.</p>}
      <form onSubmit={event => void send(event)}><label>Message<textarea required maxLength={4000} rows={4} value={text} disabled={busy} onChange={event => { setText(event.target.value); setSent(false); setError(''); }} /></label>{error && <p role="alert">{error}</p>}{sent && <p role="status">Message sent.</p>}<button className="primary" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send message'}</button></form>
    </div>
    {confirmClose && <UnsavedChangesSheet busy={busy} onKeepEditing={() => setConfirmClose(false)} onDiscard={onClose} />}
  </EditorDialog>;
}
