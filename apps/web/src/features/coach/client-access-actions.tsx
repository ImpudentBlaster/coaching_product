import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionMenu } from '../../components/action-menu';
import { EditorDialog } from '../../components/editor-dialog';
import { apiRequest, type ClientRelationship } from '../../lib/api';
import { notify } from '../../lib/notify';
import { useAuth } from '../auth/auth-context';

export function ClientAccessActions({ client, onEdit, onSaved, disabled }: { client: ClientRelationship; onEdit: () => void; onSaved: () => Promise<void>; disabled: boolean }) {
  const { switchToClient } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<'delete' | 'switch' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function mail(kind: 'password-reset' | 'registration-mail') {
    setBusy(true);
    try { const result = await apiRequest<{ message: string }>(`/coach/clients/${client.clientId}/${kind}`, { method: 'POST' }); notify.success(result.message); }
    catch (cause) { notify.error(cause instanceof Error ? cause.message : 'Unable to send email.'); }
    finally { setBusy(false); }
  }
  async function act() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (confirm === 'switch') { await switchToClient(client.clientId); navigate('/client', { replace: true }); }
      else { await apiRequest(`/coach/clients/${client.clientId}`, { method: 'DELETE' }); setConfirm(null); await onSaved(); notify.success('Client deleted.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to complete the action.'); }
    finally { setBusy(false); }
  }
  return <><ActionMenu name={client.client.displayName} disabled={disabled || busy} items={[
    ...(['APPROVED','PENDING_REVIEW'].includes(client.status) ? [{ label: 'Edit client', onSelect: onEdit }] : []),
    ...(client.status === 'APPROVED' ? [{ label: 'Questionnaire', onSelect: () => navigate(`/coach/clients/${client.clientId}?tab=questionnaire`) }, { label: 'Switch to client', onSelect: () => { setError(''); setConfirm('switch'); } }] : []),
    ...(['APPROVED','PENDING_REVIEW'].includes(client.status) ? [{ label: 'Reset password', onSelect: () => void mail('password-reset') }, { label: 'Resend registration mail', onSelect: () => void mail('registration-mail') }] : []),
    { label: 'Delete client', danger: true, onSelect: () => { setError(''); setConfirm('delete'); } },
  ]} />{confirm && <EditorDialog title={confirm === 'delete' ? 'Delete client' : 'Switch to client'} variant="confirmation" trackChanges={false} busy={busy} onClose={() => setConfirm(null)}><p>{confirm === 'delete' ? `Delete ${client.client.displayName} from your client list and revoke their access? Coaching records and audit history will be retained.` : `Switch to ${client.client.displayName}? You will enter this client’s account. Use the switch-back button to return to your coach account.`}</p>{error && <p role="alert">{error}</p>}<div className="actions"><button className="secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button className={confirm === 'delete' ? 'danger' : 'primary'} disabled={busy} onClick={() => void act()}>{busy ? 'Working…' : confirm === 'delete' ? 'Delete client' : 'Switch to client'}</button></div></EditorDialog>}</>;
}
