import { SelectControl } from '../../components/form-controls';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { apiRequest, type Program } from '../../lib/api';
import { EditorDialog } from '../../components/editor-dialog';
import './workout-details.css';
import './package-details.css';
import { AssignedPackageClients } from './assigned-package-clients';
import { Collection } from '../../components/collection';
import { ActionMenu } from '../../components/action-menu';

export type PackageData = {
  name: string; description: string;
  paymentType: 'ONE_TIME' | 'SUBSCRIPTION' | 'INITIAL_AND_SUBSCRIPTION';
  amount: number | null; initialAmount: number | null; currency: string;
  durationDays: number | null; programId: string | null; nutritionPlanId: string | null; supplementPlanId?: string | null;
  checkin: { formId: string; frequency: 'ONCE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'; occurrences: number; weekdays: number[] } | null;
};
export type CoachingPackage = { id: string; data: PackageData; revision: number; archivedAt: string | null; clientCount: number };
const empty: PackageData = { name: '', description: '', paymentType: 'ONE_TIME', amount: null, initialAmount: null, currency: 'INR', durationDays: null, programId: null, nutritionPlanId: null, checkin: null };
type Option = { id: string; name: string };

export function PackagesPage() {
  const { user } = useAuth();
  const [packages, setPackages] = useState<CoachingPackage[]>([]);
  const [programs, setPrograms] = useState<Option[]>([]);
  const [nutrition, setNutrition] = useState<Option[]>([]);
  const [supplements, setSupplements] = useState<Option[]>([]);
  const [forms, setForms] = useState<Option[]>([]);
  const [editing, setEditing] = useState<CoachingPackage | null | undefined>();
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [viewing, setViewing] = useState<CoachingPackage | null>(null);
  async function load() {
    setLoading(true); setError('');
    try {
      const [p, w, n, f] = await Promise.all([
        apiRequest<{ packages: CoachingPackage[] }>('/coach/packages'),
        apiRequest<{ programs: Program[] }>('/coach/programs'),
        apiRequest<{ entries: { id: string; data: { kind: string; name: string }; archivedAt?: string | null }[] }>('/coach/nutrition-library'),
        apiRequest<{ forms: { id: string; definition: { name: string } }[] }>('/coach/checkins/forms'),
      ]);
      setPackages(p.packages); setPrograms(w.programs.filter(p => p.status === 'PUBLISHED').map(p => ({ id: p.id, name: p.name })));
      setSupplements(n.entries.filter(item => item.data.kind === 'supplements' && !item.archivedAt).map(item => ({id:item.id,name:item.data.name})));
      setNutrition(n.entries.filter(n => n.data.kind === 'plans' && !n.archivedAt).map(n => ({ id: n.id, name: n.data.name })));
      setForms(f.forms.map(f => ({ id: f.id, name: f.definition.name })));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load packages.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (user?.role === 'COACH' && user.approvalStatus === 'APPROVED') void load(); }, [user]);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'COACH' || user.approvalStatus !== 'APPROVED') return <p>Approved coach access required.</p>;
  const update = (patch: Partial<PackageData>) => setData(current => ({ ...current, ...patch }));
  function select(label: string, value: string | null, options: Option[], change: (id: string | null) => void) {
    return <label>{label}<SelectControl aria-label={label} value={value ?? ''} onChange={e => change(e.target.value || null)}><option value="">None</option>{value && !options.some(o => o.id === value) && <option value={value}>Unavailable selection — choose another</option>}{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectControl></label>;
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await apiRequest(editing ? `/coach/packages/${editing.id}` : '/coach/packages', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(editing ? { data, revision: editing.revision, archived: false } : data) });
      setEditing(undefined); await load(); setMessage('Package saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save package.'); }
    finally { setBusy(false); }
  }
  async function archive(p: CoachingPackage) {
    setBusy(true); setError('');
    try { await apiRequest(`/coach/packages/${p.id}`, { method: 'PUT', body: JSON.stringify({ data: p.data, revision: p.revision, archived: !p.archivedAt }) }); await load(); setMessage(p.archivedAt ? 'Package restored.' : 'Package archived.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update package.'); }
    finally { setBusy(false); }
  }
  const planType = (p: PackageData) => ({ ONE_TIME: 'One-time payment', SUBSCRIPTION: 'Subscription', INITIAL_AND_SUBSCRIPTION: 'Initial payment & subscription' })[p.paymentType];
  const selectionName = (options: Option[], id: string | null) => id ? options.find(option => option.id === id)?.name ?? 'Unavailable selection' : 'None';
  return <section className="packages-page"><header className="page-heading"><div><p className="eyebrow">Your coaching library</p><h1>Packages</h1><p>Bundle plans and check-ins for faster client setup.</p></div></header>
    {message && <p role="status">{message}</p>}
    <Collection title="Packages" loading={loading} error={editing === undefined ? error : ''} onRetry={() => void load()} columns={['Name', 'Type of plan', 'Price', 'Duration / renewal', 'Included plans', 'Assigned clients', 'Status', 'Action', 'View']} actions={<button className="primary" disabled={loading || busy} onClick={() => { setData(empty); setEditing(null); setError(''); }}>Add package</button>}>
      {packages.map(p => {
        const included = [p.data.programId && `Workout: ${selectionName(programs, p.data.programId)}`, p.data.nutritionPlanId && `Nutrition: ${selectionName(nutrition, p.data.nutritionPlanId)}`, p.data.supplementPlanId && ('Supplements: ' + selectionName(supplements, p.data.supplementPlanId)), p.data.checkin && `Check-ins: ${selectionName(forms, p.data.checkin.formId)}`].filter(Boolean).join(' · ') || 'Membership only';
        return <tr key={p.id} data-search={`${p.data.name} ${p.data.description} ${planType(p.data)} ${included} ${p.archivedAt ? 'Archived' : 'Available'} ${p.data.currency} ${p.data.amount ?? ''}`}>
          <td><strong>{p.data.name}</strong></td><td>{planType(p.data)}</td>
          <td>{p.data.amount === null ? 'Not recorded' : `${p.data.currency} ${p.data.amount}`}{p.data.paymentType === 'INITIAL_AND_SUBSCRIPTION' && p.data.initialAmount !== null && <div><small>Initial: {p.data.currency} {p.data.initialAmount}</small></div>}</td>
          <td>{p.data.durationDays ? `${p.data.paymentType === 'ONE_TIME' ? '' : 'Every '}${p.data.durationDays} days` : 'Not specified'}</td>
          <td><div className="package-included-plans">{included.split(' · ').map(plan => <div key={plan}>{plan}</div>)}</div></td><td><button type="button" className="secondary small" aria-label={`View ${p.clientCount} assigned clients for ${p.data.name}`} disabled={busy || loading} onClick={() => setViewing(p)}>{p.clientCount}</button></td><td><span className={`status ${p.archivedAt ? 'archived' : 'active'}`}>{p.archivedAt ? 'Archived' : 'Available'}</span></td>
          <td><ActionMenu name={p.data.name} disabled={busy || loading} items={[{ label: 'Edit', onSelect: () => { setData(p.data); setEditing(p); setError(''); } }, { label: p.archivedAt ? 'Restore' : 'Archive', onSelect: () => void archive(p) }]} /></td>
          <td className="workout-view-cell"><button type="button" className="secondary icon-button workout-icon-action" disabled={busy || loading} aria-label={`View ${p.data.name}`} title="View package" onClick={() => setViewing(p)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></td>
        </tr>;
      })}
    </Collection>
    {viewing && <EditorDialog title="Package details" variant="drawer" trackChanges={false} onClose={() => setViewing(null)} headerContent={<div className="workout-details-heading"><div><h3>{viewing.data.name}</h3><p className="detail-metadata"><span className={`status ${viewing.archivedAt ? 'archived' : 'active'}`}>{viewing.archivedAt ? 'Archived' : 'Available'}</span><span aria-hidden="true">·</span><span>{viewing.clientCount} assigned {viewing.clientCount === 1 ? 'client' : 'clients'}</span></p></div><button type="button" className="primary" disabled={busy} onClick={() => { setData(viewing.data); setEditing(viewing); setViewing(null); setError(''); }}>Edit package</button></div>}>
      <div className="detail-view package-details">
        <AssignedPackageClients key={viewing.id} packageId={viewing.id} />
        <section className="detail-section" aria-label="Package information"><h4 className="detail-section-title">Package information</h4><p className="workout-description package-description">{viewing.data.description || 'No description added.'}</p></section>
        <section className="detail-section" aria-label="Membership details"><h4 className="detail-section-title">Membership details</h4><dl className="package-detail-grid"><div><dt>Type of plan</dt><dd>{planType(viewing.data)}</dd></div><div><dt>{viewing.data.paymentType === 'ONE_TIME' ? 'Price' : 'Recurring price'}</dt><dd>{viewing.data.amount === null ? 'Not recorded' : `${viewing.data.currency} ${viewing.data.amount}`}</dd></div>{viewing.data.paymentType === 'INITIAL_AND_SUBSCRIPTION' && <div><dt>Initial payment</dt><dd>{viewing.data.initialAmount === null ? 'Not recorded' : `${viewing.data.currency} ${viewing.data.initialAmount}`}</dd></div>}<div><dt>{viewing.data.paymentType === 'ONE_TIME' ? 'Duration' : 'Renewal interval'}</dt><dd>{viewing.data.durationDays ? `${viewing.data.paymentType === 'ONE_TIME' ? '' : 'Every '}${viewing.data.durationDays} days` : 'Not specified'}</dd></div></dl><p className="detail-empty">Payment details are for manual records. No payments are collected.</p></section>
        <section className="detail-section" aria-label="Included plans"><h4 className="detail-section-title">Included plans</h4><dl className="package-detail-list"><div><dt>Workout program</dt><dd>{selectionName(programs, viewing.data.programId)}</dd></div><div><dt>Nutrition plan</dt><dd>{selectionName(nutrition, viewing.data.nutritionPlanId)}</dd></div><div><dt>Supplement plan</dt><dd>{selectionName(supplements, viewing.data.supplementPlanId ?? null)}</dd></div><div><dt>Check-in form</dt><dd>{selectionName(forms, viewing.data.checkin?.formId ?? null)}</dd></div>{viewing.data.checkin && <div><dt>Check-in schedule</dt><dd>{({ ONCE: 'Once', DAILY: 'Every day', WEEKLY: 'Every week', BIWEEKLY: 'Every two weeks', MONTHLY: 'Every month' })[viewing.data.checkin.frequency]} · {viewing.data.checkin.frequency === 'ONCE' ? 1 : viewing.data.checkin.occurrences} check-ins</dd></div>}<div><dt>Initial questionnaire</dt><dd>Standard client onboarding</dd></div></dl></section>
      </div>
    </EditorDialog>}
    {editing !== undefined && <EditorDialog title={editing ? 'Edit package' : 'New package'} busy={busy} onClose={() => { setEditing(undefined); setError(''); }}><form onSubmit={e => void save(e)}><fieldset disabled={busy} className="form-stack">
      {error && <p role="alert">{error}</p>}
      <label>Package name<input required minLength={2} maxLength={150} value={data.name} onChange={e => update({ name: e.target.value })} /></label>
      <label>Description<textarea required maxLength={4000} value={data.description} onChange={e => update({ description: e.target.value })} /></label>
      <label>Type of plan<SelectControl aria-label="Type of plan" value={data.paymentType} onChange={e => update({ paymentType: e.target.value as PackageData['paymentType'], initialAmount: null })}><option value="ONE_TIME">One-time payment</option><option value="SUBSCRIPTION">Subscription</option><option value="INITIAL_AND_SUBSCRIPTION">Initial payment & subscription</option></SelectControl></label>
      <div className="form-row"><label>{data.paymentType === 'ONE_TIME' ? 'Amount' : 'Recurring amount'}<input type="number" min={0} max={100000000} step="0.01" value={data.amount ?? ''} onChange={e => update({ amount: e.target.value === '' ? null : Number(e.target.value) })} /></label><label>Currency<input required pattern="[A-Z]{3}" maxLength={3} value={data.currency} onChange={e => update({ currency: e.target.value.toUpperCase() })} /></label></div>
      {data.paymentType === 'INITIAL_AND_SUBSCRIPTION' && <label>Initial amount<input type="number" min={0} max={100000000} step="0.01" value={data.initialAmount ?? ''} onChange={e => update({ initialAmount: e.target.value === '' ? null : Number(e.target.value) })} /></label>}
      <label>{data.paymentType === 'ONE_TIME' ? 'Duration in days' : 'Renewal interval in days'}<input type="number" min={1} max={3660} value={data.durationDays ?? ''} onChange={e => update({ durationDays: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <small>Payment details are for manual records. No payments are collected.</small>
      {select('Workout program', data.programId, programs, programId => update({ programId }))}
      {select('Nutrition plan', data.nutritionPlanId, nutrition, nutritionPlanId => update({ nutritionPlanId }))}
      {select('Supplement plan', data.supplementPlanId ?? null, supplements, supplementPlanId => update({ supplementPlanId }))}
      {select('Check-in form', data.checkin?.formId ?? null, forms, formId => update({ checkin: formId ? { formId, frequency: 'WEEKLY', occurrences: 12, weekdays: [] } : null }))}
      {data.checkin && <><label>Check-in frequency<SelectControl aria-label="Check-in frequency" value={data.checkin.frequency} onChange={e => update({ checkin: { ...data.checkin!, frequency: e.target.value as NonNullable<PackageData['checkin']>['frequency'] } })}>{['ONCE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].map(f => <option key={f}>{f}</option>)}</SelectControl></label>{data.checkin.frequency !== 'ONCE' && <label>Number of check-ins<input required type="number" min={1} max={366} value={data.checkin.occurrences} onChange={e => update({ checkin: { ...data.checkin!, occurrences: Number(e.target.value) } })} /></label>}</>}
      <p>Initial questionnaire: standard client onboarding.</p><button className="primary">{busy ? 'Saving…' : 'Save package'}</button>
    </fieldset></form></EditorDialog>}
  </section>;
}
