import { EditorDialog } from '../../components/editor-dialog';
import { notify } from '../../lib/notify';
import { ClientPlanDialog, type ClientPlanKind } from './client-plan-dialog';
import { formatDate } from '../../lib/dates';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { apiRequest, type ClientRelationship, type ProgramAssignment } from '../../lib/api';
import { useAuth } from '../auth/auth-context';
import { CoachOnboarding } from './coach-onboarding';
import { ClientWizard } from './client-wizard';
import { CoachCheckins } from '../checkins/coach-checkins';
import type { Checkin } from '../checkins/checkin-types';
import { SupplementDetails, type SupplementPlan } from './supplement-studio';
import { type NutritionNode } from '../nutrition/nutrition-details';
import { ClientTrainingDetails, ClientNutritionDetails } from './client-plan-details';
import { ProgressStory } from '../../components/progress-story';
import './client-profile-page.css';

export type ClientProfile = {
  client:{id:string;displayName:string;email:string;phone:string|null;status:'APPROVED';joinedAt:string};
  onboarding:{status:string;data:Record<string,unknown>}|null;
  program:ProgramAssignment|null;
  supplements?:{planId?:string;snapshot:SupplementPlan;assignedAt:string}|null;
  nutrition:{planId?:string;snapshot:NutritionNode;assignedAt:string}|null;
  subscription:{plan_name:string;status:string;starts_on:string;ends_or_renews_on:string|null;notes:string;amount:string|null;currency:string|null}|null;
  progress:Array<Record<string,unknown>>;
  workouts:Array<{id:string;name:string;status:string;startedAt:string;completedAt:string|null}>;
  checkins:Checkin[];
};
const tabs=[['overview','Overview'],['questionnaire','Questionnaire'],['training','Training'],['nutrition','Nutrition'],['supplements','Supplements'],['progress','Progress'],['checkins','Check-ins'],['membership','Membership']] as const;
function date(value:string){return formatDate(value);}
function value(item:unknown,unit=''){return item===null||item===undefined||item===''?'Not recorded':`${String(item)}${unit}`;}

export function ClientProfilePage(){
  const {user,ready}=useAuth();
  const {clientId=''}=useParams();
  if(!ready)return <p role="status">Loading session…</p>;
  if(!user)return <Navigate to="/login" replace/>;
  if(user.role!=='COACH'||user.approvalStatus!=='APPROVED')return <Navigate to="/" replace/>;
  return <Profile key={clientId} clientId={clientId} coachId={user.id}/>;
}
function Profile({clientId,coachId}:{clientId:string;coachId:string}){
  const [params]=useSearchParams();
  const tab=tabs.some(([id])=>id===params.get('tab'))?params.get('tab'):'overview';
  const [profile,setProfile]=useState<ClientProfile>();
  const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const [planDialog,setPlanDialog]=useState<{kind:ClientPlanKind;create:boolean;edit?:boolean}|null>(null);
  const [deletingPlan,setDeletingPlan]=useState<ClientPlanKind|null>(null);
  const [planBusy,setPlanBusy]=useState(false);
  const [attempt,setAttempt]=useState(0);const [editing,setEditing]=useState(false);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    void apiRequest<{profile:ClientProfile}>(`/coach/clients/${encodeURIComponent(clientId)}/profile`).then(result=>{if(active)setProfile(result.profile);})
      .catch((error:unknown)=>{if(active)setError(error instanceof Error?error.message:'Unable to load client profile.');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[clientId,attempt]);
  async function refresh(){setAttempt(n=>n+1);}
  if(editing)return <ClientWizard clientId={clientId} onClose={()=>setEditing(false)} onSaved={refresh}/>;
  const back=<Link className="profile-back" to="/coach?tab=clients">← Back to clients</Link>;
  if(error)return <section>{back}<div className="card plan-summary" role="alert"><h1>Unable to open client profile</h1><p>{error}</p><button className="secondary" onClick={()=>void refresh()}>Try again</button></div></section>;
  if(loading||!profile)return <section>{back}<p role="status">Loading client profile…</p></section>;
  const {client,onboarding,program,nutrition,subscription,progress,workouts,checkins}=profile;
  const latestWeight=progress.find(entry=>entry.body_weight!==null&&entry.body_weight!==undefined);
  const relationship:ClientRelationship={id:clientId,coachId,clientId,status:'APPROVED',rejectionReason:null,createdAt:client.joinedAt,client:{id:clientId,email:client.email,displayName:client.displayName,role:'CLIENT',approvalStatus:'APPROVED',businessName:null,createdAt:client.joinedAt}};
  const currentPlan=(kind:ClientPlanKind)=>kind==='program'&&program?{id:program.programId,name:program.snapshot.name}:kind==='nutrition'&&nutrition?.planId?{id:nutrition.planId,name:nutrition.snapshot.name}:kind==='supplements'&&profile.supplements?.planId?{id:profile.supplements.planId,name:profile.supplements.snapshot.name}:undefined;
  const planName=(kind:ClientPlanKind)=>kind==='program'?'workout program':kind==='nutrition'?'nutrition plan':'supplement plan';
  async function deleteAssignment(){if(!deletingPlan||planBusy)return;const assigned=currentPlan(deletingPlan);if(!assigned)return;setPlanBusy(true);try{await apiRequest('/coach/clients/'+clientId+'/profile/plans/'+deletingPlan+'/'+assigned.id,{method:'DELETE'});setDeletingPlan(null);notify.success('Client plan assignment deleted.');await refresh();}catch(cause){notify.error(cause instanceof Error?cause.message:'Unable to delete assignment.');}finally{setPlanBusy(false);}}
  const planActions=(kind:ClientPlanKind)=><div className="actions client-plan-actions">{currentPlan(kind)?<><button type="button" className="secondary icon-button client-plan-edit" aria-label={'Edit '+planName(kind)} title={'Edit '+planName(kind)} onClick={()=>setPlanDialog({kind,create:false,edit:true})}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5"/></svg></button><button type="button" className="danger icon-button client-plan-delete" aria-label={'Delete '+planName(kind)} title={'Delete '+planName(kind)} onClick={()=>setDeletingPlan(kind)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button></>:<><button className="secondary" onClick={()=>setPlanDialog({kind,create:false})}>Assign {planName(kind)}</button><button className="primary" onClick={()=>setPlanDialog({kind,create:true})}>Create {planName(kind)}</button></>}</div>;
  return <section className="coach-client-profile">
    {planDialog&&<ClientPlanDialog kind={planDialog.kind} create={planDialog.create} edit={planDialog.edit??false} clientId={clientId} clientName={client.displayName} currentPlan={currentPlan(planDialog.kind)} onClose={()=>setPlanDialog(null)} onAssigned={refresh}/>}
    {deletingPlan&&<EditorDialog title={"Delete "+planName(deletingPlan)+" assignment?"} variant="confirmation" busy={planBusy} trackChanges={false} onClose={()=>setDeletingPlan(null)}><p>Remove {currentPlan(deletingPlan)?.name} from {client.displayName}? The reusable library plan and assignment history will be preserved.</p><div className="actions"><button className="secondary" disabled={planBusy} onClick={()=>setDeletingPlan(null)}>Cancel</button><button className="danger" disabled={planBusy} onClick={()=>void deleteAssignment()}>{planBusy?"Deleting…":"Delete assignment"}</button></div></EditorDialog>}
    <div className="profile-topbar">{back}<div className="actions"><button className="secondary" onClick={()=>void refresh()}>Refresh</button><button className="primary" onClick={()=>setEditing(true)}>Edit client & plans</button></div></div>
    <header className="card client-profile-header"><div className="client-profile-identity"><div className="avatar large" aria-hidden="true">{client.displayName.charAt(0)}</div><div><p className="eyebrow">Client profile</p><h1>{client.displayName}</h1><p>{client.email}</p>{client.phone&&<p>{client.phone}</p>}<span className="status approved">Approved</span></div></div>
      <dl className="client-profile-stats"><div><dt>Joined</dt><dd>{date(client.joinedAt)}</dd></div><div><dt>Membership</dt><dd>{subscription?.plan_name??'Not assigned'}</dd></div><div><dt>Starting weight</dt><dd>{value(onboarding?.data.weight,' kg')}</dd></div><div><dt>Latest weight</dt><dd>{value(latestWeight?.body_weight,' kg')}</dd>{latestWeight&&<small>{formatDate(String(latestWeight.measurement_date))}</small>}</div><div><dt>Age at onboarding</dt><dd>{value(onboarding?.data.age)}</dd></div><div><dt>Questionnaire</dt><dd>{onboarding?.status.replaceAll('_',' ').toLowerCase()??'Not started'}</dd></div></dl>
      <nav className="client-profile-tabs" aria-label="Client profile sections">{tabs.map(([id,label])=><Link key={id} to={`?tab=${id}`} aria-current={tab===id?'page':undefined}>{label}</Link>)}</nav>
    </header>
    <div className="client-profile-content">
      {tab==='overview'&&<div className="client-profile-grid"><section className="card plan-summary"><h2>Coaching plan</h2><dl className="profile-facts"><div><dt>Training</dt><dd>{program?.snapshot.name??'No program assigned'}</dd></div><div><dt>Nutrition</dt><dd>{nutrition?.snapshot.name??'No plan assigned'}</dd></div><div><dt>Supplements</dt><dd>{profile.supplements?.snapshot.name ?? 'No supplement plan assigned'}</dd></div><div><dt>Initial questionnaire</dt><dd>{onboarding?.status.toLowerCase()??'Not started'}</dd></div></dl><Link className="secondary" to="?tab=questionnaire">View questionnaire</Link></section>
        <section className="card plan-summary"><h2>Latest check-ins</h2>{checkins.filter(item=>item.submittedAt).slice(0,3).map(item=><div className="profile-record" key={item.id}><strong>{item.form.name}</strong><p>Due {date(item.dueDate)} · {item.status.toLowerCase()}</p></div>)}{!checkins.some(item=>item.submittedAt)&&<p>No submitted check-ins yet.</p>}<Link className="secondary" to="?tab=checkins">View check-ins</Link></section>
        <section className="card plan-summary"><h2>Recent workouts</h2>{workouts.length?workouts.slice(0,5).map(item=><div className="profile-record" key={item.id}><strong>{item.name??'Workout'}</strong><p>{date(item.startedAt)} · {item.status.replaceAll('_',' ').toLowerCase()}</p></div>):<p>No workouts recorded yet.</p>}<Link className="secondary" to="?tab=training">View training</Link></section>
        <section className="card plan-summary"><h2>Latest measurements</h2>{progress[0]?<><p>Recorded {formatDate(String(progress[0].measurement_date))}</p><dl className="profile-facts">{[['body_weight','Weight',' kg'],['waist','Waist',' cm'],['chest','Chest',' cm'],['arm','Arm',' cm']].map(([key,label,unit])=><div key={key}><dt>{label}</dt><dd>{value(progress[0]?.[key!],unit)}</dd></div>)}</dl></>:<p>No measurements recorded yet.</p>}<Link className="secondary" to="?tab=progress">View progress</Link></section></div>}
      {tab==='questionnaire'&&<div className="card profile-questionnaire"><CoachOnboarding clientId={clientId} onReviewed={()=>setProfile(current=>current&&current.onboarding?{...current,onboarding:{...current.onboarding,status:'REVIEWED'}}:current)}/></div>}
      {tab==='training'&&<section className="card plan-summary"><div className="client-plan-heading"><h2>{program?.snapshot.name??'Workout program'}</h2>{planActions('program')}</div>{!program&&<h3 className="client-assigned-plan-title">No program assigned</h3>}{program?<ClientTrainingDetails program={program}/>:<p>Choose an existing workout program or create one for this client.</p>}</section>}
      {tab==='nutrition'&&<section className="card plan-summary" aria-label="Nutrition plan"><div className="client-plan-heading"><h2>{nutrition?.snapshot.name??'Nutrition plan'}</h2>{planActions('nutrition')}</div>{!nutrition&&<h3 className="client-assigned-plan-title">No nutrition plan assigned</h3>}{nutrition?<ClientNutritionDetails node={nutrition.snapshot}/>:<p>Choose an existing nutrition plan or create one for this client.</p>}</section>}
      {tab==='supplements'&&<section className="card plan-summary client-supplement-plan" aria-label="Supplements"><div className="client-plan-heading"><h2>{profile.supplements?.snapshot.name??'Supplements'}</h2>{planActions('supplements')}</div>{profile.supplements ? <SupplementDetails plan={profile.supplements.snapshot}/> : <p>No supplement plan assigned. Choose an existing plan or create one for this client.</p>}</section>}
      {tab==='progress'&&<>{progress.length?<><ProgressStory entries={progress}/><section className="card plan-summary"><h2>Measurement history</h2><p>Latest {progress.length} records (up to 90).</p><div className="profile-table-scroll"><table><thead><tr><th>Date</th><th>Weight (kg)</th><th>Waist (cm)</th><th>Chest (cm)</th><th>Arm (cm)</th><th>Notes</th></tr></thead><tbody>{progress.map(entry=><tr key={String(entry.measurement_date)}><td>{formatDate(String(entry.measurement_date))}</td>{['body_weight','waist','chest','arm','notes'].map(key=><td key={key}>{value(entry[key])}</td>)}</tr>)}</tbody></table></div></section></>:<section className="card plan-summary"><h2>Progress</h2><p>This client has not recorded any measurements yet.</p></section>}</>}
      {tab==='checkins'&&<><section className="card plan-summary"><h2>Check-in schedule</h2><p>Latest {checkins.length} assignments (up to 50).</p>{checkins.length?checkins.map(item=><div className="profile-record" key={item.id}><strong>{item.form.name}</strong><p>{date(item.dueDate)} · {item.status.toLowerCase()}</p></div>):<p>No check-ins assigned.</p>}</section><CoachCheckins clients={[relationship]} checkins={checkins} onSaved={refresh}/></>}
      {tab==='membership'&&<section className="card plan-summary"><h2>Membership</h2>{subscription?<><dl className="profile-facts"><div><dt>Plan</dt><dd>{subscription.plan_name}</dd></div><div><dt>Status</dt><dd>{subscription.status.toLowerCase()}</dd></div><div><dt>Starts</dt><dd>{date(subscription.starts_on)}</dd></div><div><dt>Ends / renews</dt><dd>{subscription.ends_or_renews_on?date(subscription.ends_or_renews_on):'Not set'}</dd></div>{subscription.amount&&<div><dt>Amount</dt><dd>{subscription.amount} {subscription.currency}</dd></div>}</dl><p className="profile-membership-notes">{subscription.notes}</p><p className="profile-muted">Informational record. Payments are managed outside this app.</p></>:<p>No membership assigned. Use Edit client & plans to add one.</p>}</section>}
    </div>
  </section>;
}
