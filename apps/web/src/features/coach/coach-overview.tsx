import { formatDate } from '../../lib/dates';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { ClientWizard } from './client-wizard';
import { DashboardLatest } from './dashboard-latest';
import './coach-overview.css';

export type CoachOverviewData = {
  activeClients: number; pendingClients: number; onboardingReviews: number;
  checkinReviews: number; dueToday: number; overdue: number; completedWorkouts7d: number;
  onboarding: Array<{clientId:string;clientName:string;submittedAt:string}>;
  dueCheckins: Array<{id:string;clientId:string;clientName:string;dueDate:string}>;
  activity: Array<{id:string;clientId:string;clientName:string;kind:'WORKOUT'|'ONBOARDING'|'CHECKIN';title:string;happenedAt:string}>;
  latestClients?: Array<{clientId:string;clientName:string;email:string;packageName:string|null;membershipStatus:string|null;joinedAt:string}>;
  latestCheckins?: Array<{id:string;clientId:string;clientName:string;formName:string;dueDate:string;submittedAt:string;status:string}>;
  latestMessages?: Array<{id:string;clientId:string;clientName:string;author:string;message:string;context:string;createdAt:string}>;
};
function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function shortDate(value:string) {
  return formatDate(value);
}

export function CoachOverview({name}:{name:string}) {
  const [data,setData] = useState<CoachOverviewData>();
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [attempt,setAttempt] = useState(0);
  const [adding,setAdding] = useState(false);
  const today = localDate();
  const activity = data?.activity.filter(item => item.kind !== 'WORKOUT') ?? [];
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    void apiRequest<{overview:CoachOverviewData}>(`/coach/dashboard?date=${today}`).then(result=>{
      if(active)setData(result.overview);
    }).catch((error:unknown)=>{if(active)setError(error instanceof Error?error.message:'Unable to load dashboard.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[attempt,today]);
  if(adding)return <ClientWizard onClose={()=>setAdding(false)} onSaved={async()=>{setAttempt(value=>value+1);}}/>;
  return <section className="coach-overview">
    <header className="dashboard-head"><div><p className="eyebrow">Coach dashboard</p><h1>Your coaching overview</h1><p className="lede">Welcome, {name}. Here’s where your clients need you.</p></div><div className="actions"><button className="secondary" disabled={loading} onClick={()=>setAttempt(value=>value+1)}>Refresh</button><button className="primary" onClick={()=>setAdding(true)}>Add client</button></div></header>
    {error?<div className="card overview-error" role="alert"><h2>Unable to load dashboard</h2><p>{error}</p><button className="secondary" onClick={()=>setAttempt(value=>value+1)}>Try again</button></div>
      :loading?<div className="overview-loading" role="status"><p>Loading your coaching overview…</p><div className="overview-metrics">{Array.from({length:4},(_,i)=><div key={i} className="card skeleton"/>)}</div></div>
      :data&&<>
        <div className="overview-metrics">
          <Metric label="Active clients" value={data.activeClients} detail="Approved and ready to coach" to="/coach?tab=clients"/>
          <Metric label="Onboarding to review" value={data.onboardingReviews} detail="Submitted questionnaires" to="#onboarding-reviews"/>
          <Metric label="Check-ins to review" value={data.checkinReviews} detail="Submitted and awaiting feedback" to="/coach/studio?tab=checkins"/>
          <Metric label="Check-ins due today" value={data.dueToday} detail="Awaiting client updates" to="/coach/studio?tab=checkins"/>
        </div>
        <div className="overview-priority">
          <section className="card overview-panel overview-attention" id="onboarding-reviews"><header><div><p className="eyebrow">Your next actions</p><h2>Needs your attention</h2></div><span className="overview-count">{data.pendingClients+data.onboardingReviews+data.checkinReviews}</span></header>
            {data.pendingClients>0&&<Link className="overview-task" to="/coach?tab=clients"><span className="overview-task-icon" aria-hidden="true">＋</span><div><strong>{data.pendingClients} {data.pendingClients===1?'client needs':'clients need'} approval</strong><p>Review access before coaching begins.</p></div><span aria-hidden="true">→</span></Link>}
            {data.checkinReviews>0&&<Link className="overview-task" to="/coach/studio?tab=checkins"><span className="overview-task-icon" aria-hidden="true">✓</span><div><strong>{data.checkinReviews} check-in{data.checkinReviews===1?'':'s'} ready for review</strong><p>Read their updates and share feedback.</p></div><span aria-hidden="true">→</span></Link>}
            {data.onboarding.map(item=><div className="overview-task" key={item.clientId}><span className="overview-task-icon" aria-hidden="true">{item.clientName.charAt(0)}</span><div><strong>{item.clientName}</strong><p>Onboarding submitted {shortDate(item.submittedAt)}</p></div><Link className="secondary" aria-label={`Review onboarding for ${item.clientName}`} to={`/coach/clients/${item.clientId}?tab=questionnaire`}>Review</Link></div>)}
            {data.pendingClients+data.onboardingReviews+data.checkinReviews===0&&<div className="overview-empty"><h3>You’re all caught up</h3><p>Client approvals and new submissions will appear here.</p></div>}
            {data.onboardingReviews>data.onboarding.length&&<p className="overview-note">Showing the 5 oldest questionnaires. <Link to="/coach?tab=clients">View all clients →</Link></p>}
          </section>
          <section className="card overview-panel"><header><div><p className="eyebrow">Client follow-through</p><h2>Due check-ins</h2></div><Link to="/coach/studio?tab=checkins">Manage →</Link></header>
            <div className="overview-due-totals"><div><strong>{data.dueToday}</strong><span>Due today</span></div><div><strong>{data.overdue}</strong><span>Overdue</span></div></div>
            <details className="overview-outstanding"><summary>View outstanding check-ins<span className="overview-count">{data.dueToday+data.overdue}</span></summary><div className="overview-outstanding-list">{data.dueCheckins.length===0?<div className="overview-empty"><h3>No check-ins outstanding</h3><p>Unsubmitted check-ins will appear here when they’re due.</p></div>:<><p className="overview-note">Awaiting client submission · oldest first</p>{data.dueCheckins.map(item=><div className="overview-task" key={item.id}><div><strong>{item.clientName}</strong><p>Due {shortDate(item.dueDate)}</p></div><span className={`overview-due-tag ${item.dueDate<today?'late':''}`}>{item.dueDate<today?'Overdue':'Today'}</span></div>)}{data.dueToday+data.overdue>data.dueCheckins.length&&<p className="overview-note">Showing 5 of {data.dueToday+data.overdue} outstanding check-ins.</p>}</>}</div></details>
          </section>
        </div>
        <DashboardLatest data={data}/>
        <section className="card overview-panel overview-activity"><header><div><p className="eyebrow">Across your clients</p><h2>Recent activity</h2></div><Link to="/coach/studio?tab=checkins">View check-ins →</Link></header>
          {activity.length===0?<div className="overview-empty"><h3>Your clients’ activity starts here</h3><p>Submitted questionnaires and check-ins will appear as clients get started.</p></div>:activity.map(item=><div className="overview-task" key={item.id}><span className="overview-task-icon" aria-hidden="true">✓</span><div><strong>{item.clientName}</strong><p>Submitted · {item.title}</p></div><time dateTime={item.happenedAt}>{shortDate(item.happenedAt)}</time></div>)}
        </section>
        <nav className="overview-shortcuts" aria-label="Coaching shortcuts"><Link to="/coach?tab=clients">Manage clients <span>→</span></Link><Link to="/coach/studio?tab=programs">Training programs <span>→</span></Link><Link to="/coach/studio?tab=nutrition">Nutrition plans <span>→</span></Link><Link to="/coach/studio?tab=checkins">Check-ins <span>→</span></Link></nav>
      </>}
  </section>;
}
function Metric({label,value,detail,to}:{label:string;value:number;detail:string;to:string}) {
  const content=<><span>{label}</span><strong>{value}</strong><small>{detail}</small></>;
  return to.startsWith('#')?<a className="card overview-metric" href={to}>{content}</a>:<Link className="card overview-metric" to={to}>{content}</Link>;
}
