import { AssignedProgramClients } from './assigned-program-clients';
import { ProgramWorkoutDetails } from './program-workout-details';
import { ProgramAssignment } from './program-assignment';
import { ActionMenu } from '../../components/action-menu';
import { useState } from 'react';
import { EditorDialog, Notice } from '../../components/editor-dialog';
import { apiRequest, type ClientRelationship, type Program, type WorkoutTemplate } from '../../lib/api';

function Icon({ kind }: { kind: 'edit' | 'delete' | 'view' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'view' ? <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></> : <path d={kind === 'edit' ? 'm16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5' : 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'}/>}</svg>;
}
function Timestamp({ value, withTime = false }: { value: string | undefined; withTime?: boolean }) {
  if (!value || Number.isNaN(Date.parse(value))) return <>—</>;
  return <time dateTime={value} title={new Date(value).toLocaleString()}>{new Date(value).toLocaleString(undefined, { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' as const } : {}) })}</time>;
}
export function ProgramRow({ program, templates, onEdit, onSaved, onMessage, onAssignmentsChanged, disabled = false }: {
  onAssignmentsChanged?: () => Promise<void>; program: Program; clients: ClientRelationship[]; templates: WorkoutTemplate[]; onEdit: () => void; onSaved: () => Promise<void>; onMessage: (message: string) => void; disabled?: boolean;
}) {
  const [panel, setPanel] = useState<'view' | 'delete' | 'assign' | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignmentRevision, setAssignmentRevision] = useState(0);
  const [error, setError] = useState('');

  function assignmentsChanged() {
    setAssignmentRevision(value => value + 1);
    void onAssignmentsChanged?.().catch(() => setError('Assignment saved, but client counts could not refresh. Refresh the page to see the latest counts.'));
  }
  async function act(kind: 'delete' | 'publish' | 'assign', clientIds: string[] = []) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await apiRequest(`/coach/programs/${program.id}${kind === 'delete' ? '' : `/${kind}`}`, {
        method: kind === 'delete' ? 'DELETE' : 'POST',
        ...(kind === 'assign' ? { body: JSON.stringify({ clientIds }) } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update program. Please try again.');
      setBusy(false); return;
    }
    setPanel(null);
    onMessage(kind === 'delete' ? 'Program deleted successfully.' : kind === 'publish' ? 'Program published successfully.' : `Program assigned to ${clientIds.length} client${clientIds.length === 1 ? '' : 's'} successfully.`);
    try { await onSaved(); } finally { setBusy(false); }
  }
  return <tr>
    <td><strong>{program.name}</strong><div className="program-table-status"><span className={`status ${program.status.toLowerCase()}`}>{program.status}</span></div></td>
    <td><Timestamp value={program.created_at}/></td><td><Timestamp value={program.updated_at} withTime/></td><td>{program.days.length}</td><td>{program.client_count ?? 0}</td>
    <td><ActionMenu name={program.name} disabled={disabled || busy} items={[
      { label: 'Edit', onSelect: onEdit },
      { label: 'Delete', danger: true, onSelect: () => { setError(''); setPanel('delete'); } },
      { label: 'Assign', onSelect: () => { setError(''); setPanel('assign'); } },
    ]}/></td>
    <td className="workout-view-cell"><button type="button" className="secondary icon-button workout-icon-action" aria-label={`View ${program.name}`} title="View program" disabled={disabled || busy} onClick={() => { setError(''); setPanel('view'); }}><Icon kind="view"/></button></td>
    {(panel === 'view' || panel === 'assign') && <EditorDialog title="Program details" variant="drawer" busy={busy} onClose={() => setPanel(null)} headerContent={<div className="workout-details-heading"><div><h3>{program.name}</h3><p className="detail-metadata"><span className={`status ${program.status.toLowerCase()}`}>{program.status.toLowerCase()}</span><span aria-hidden="true">·</span><span>{program.days.length} workout {program.days.length === 1 ? 'day' : 'days'}</span></p></div><button type="button" className="primary" disabled={busy} onClick={() => { setPanel(null); onEdit(); }}>Edit program</button></div>}>
      <div className="workout-details detail-view">
        <section className="detail-section" aria-label="Program information"><h4 className="detail-section-title">Program information</h4><p className="workout-description">{program.description || 'No description added.'}</p></section>
        <section className="detail-section" aria-label="Workout schedule"><h4 className="detail-section-title">Workout schedule</h4>
        <ol className="workout-detail-exercises program-workout-list">{[...program.days].sort((a,b) => a.position-b.position).map((day,index) => <ProgramWorkoutDetails key={`${day.templateId}-${index}`} day={day} index={index} workout={templates.find(template => template.id === day.templateId)}/>)}</ol>
        {!program.days.length && <p>No workouts added yet.</p>}
        </section>
        <Notice transient message={error} error onClear={() => setError('')}/>
        <section className="detail-section detail-assignment" aria-label="Client assignment"><h4 className="detail-section-title">Assign to clients</h4>
        {panel === 'assign' && program.status === 'DRAFT' && <p>Publish this program before assigning it to a client.</p>}
        {program.status === 'DRAFT' && <button type="button" className="primary program-publish-action" disabled={busy || !program.days.length} onClick={() => void act('publish')}>{busy ? 'Publishing…' : 'Publish program'}</button>}
        {program.status === 'PUBLISHED' && <><ProgramAssignment programId={program.id} busy={busy} onBusy={setBusy} revision={assignmentRevision} onChanged={assignmentsChanged}/><AssignedProgramClients programId={program.id} busy={busy} onBusy={setBusy} externalRevision={assignmentRevision} onChanged={assignmentsChanged}/></>}
        {program.status === 'DRAFT' && panel !== 'assign' && <p className="detail-empty">Publish this program to make it available for client assignment.</p>}
        </section>
      </div>
    </EditorDialog>}
    {panel === 'delete' && <EditorDialog title="Delete program?" variant="confirmation" busy={busy} onClose={() => setPanel(null)}><p>Delete <strong>{program.name}</strong> from your program library? Existing client assignments will be preserved.</p><Notice transient message={error} error onClear={() => setError('')}/><div className="workout-confirm-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setPanel(null)}>Cancel</button><button type="button" className="danger" disabled={busy} onClick={() => void act('delete')}>{busy ? 'Deleting…' : 'Delete program'}</button></div></EditorDialog>}
  </tr>;
}
