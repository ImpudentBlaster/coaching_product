import { formatDateTime } from '../../lib/dates';
import { Link } from 'react-router-dom';
import type { CoachOverviewData } from './coach-overview';

function Timestamp({ value }: { value: string }) {
  return <time dateTime={value}>{formatDateTime(value)}</time>;
}
function ClientName({ id, name }: { id: string; name: string }) {
  return <Link className="latest-client-name" to={`/coach/clients/${id}`}><span className="overview-task-icon" aria-hidden="true">{name.split(' ').filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('')}</span><strong>{name}</strong></Link>;
}
export function DashboardLatest({ data }: { data: CoachOverviewData }) {
  const clients = data.latestClients ?? [], checkins = data.latestCheckins ?? [], messages = data.latestMessages ?? [];
  return <div className="dashboard-latest">
    <div className="overview-columns">
      <section className="card overview-panel latest-panel"><header><div><h2>Latest clients</h2><p className="overview-note">{data.activeClients} active clients · latest 5 joined</p></div><Link to="/coach?tab=clients">View all →</Link></header>
        {clients.length ? <div className="latest-table-scroll"><table className="latest-table"><caption className="sr-only">Latest clients</caption><thead><tr><th scope="col">Client</th><th scope="col">Package / membership</th><th scope="col">Joined</th><th scope="col">Action</th></tr></thead><tbody>{clients.map(item => <tr key={item.clientId}><td><ClientName id={item.clientId} name={item.clientName}/><small className="latest-client-email">{item.email}</small></td><td>{item.packageName ?? 'Not assigned'}{item.membershipStatus && <small className="latest-membership-status">{item.membershipStatus.replaceAll('_', ' ').toLowerCase()}</small>}</td><td><Timestamp value={item.joinedAt}/></td><td><Link className="secondary latest-view-icon" aria-label={`View client ${item.clientName}`} to={`/coach/clients/${item.clientId}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></Link></td></tr>)}</tbody></table></div> : <p className="overview-empty">Your latest approved clients will appear here.</p>}
      </section>
      <section className="card overview-panel latest-panel"><header><div><h2>Latest check-ins</h2><p className="overview-note">Most recently submitted · latest 5</p></div><Link to="/coach/studio?tab=checkins">View all →</Link></header>
        {checkins.length ? <div className="latest-table-scroll"><table className="latest-table"><caption className="sr-only">Latest check-ins</caption><thead><tr><th scope="col">Client / form</th><th scope="col">Due</th><th scope="col">Submitted</th><th scope="col">Status</th></tr></thead><tbody>{checkins.map(item => <tr key={item.id}><td><Link to={`/coach/clients/${item.clientId}?tab=checkins`}><strong>{item.clientName}</strong></Link><small>{item.formName}</small></td><td><Timestamp value={item.dueDate}/></td><td><Timestamp value={item.submittedAt}/></td><td><span className={`status ${item.status.toLowerCase()}`}>{item.status === 'REVIEWED' ? 'Reviewed' : 'To review'}</span></td></tr>)}</tbody></table></div> : <p className="overview-empty">Submitted check-ins will appear here.</p>}
      </section>
    </div>
    <section className="card overview-panel latest-panel latest-messages"><header><div><h2>Latest messages</h2><p className="overview-note">Incoming client messages · newest first · latest 5</p></div><Link to="/coach/studio?tab=clients">View feedback →</Link></header>
      {messages.length ? <div className="latest-table-scroll"><table className="latest-table"><caption className="sr-only">Latest messages</caption><thead><tr><th scope="col">Client</th><th scope="col">Message</th><th scope="col">Context</th><th scope="col">Sent</th></tr></thead><tbody>{messages.map(item => <tr key={item.id}><td><ClientName id={item.clientId} name={item.clientName}/></td><td><p className="latest-message-text">{item.message}</p></td><td>{item.context.replaceAll('_', ' ').toLowerCase()}</td><td><Timestamp value={item.createdAt}/></td></tr>)}</tbody></table></div> : <p className="overview-empty">Incoming client messages will appear here.</p>}
    </section>
  </div>;
}
