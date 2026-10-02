import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { apiRequest, type ClientRelationship, type ProgramAssignment } from '../../lib/api';
import { useAuth } from '../auth/auth-context';
import { CoachOnboarding } from './coach-onboarding';
import { ClientWizard } from './client-wizard';
import { CoachCheckins } from '../checkins/coach-checkins';
import type { Checkin } from '../checkins/checkin-types';
import { NutritionDetails, type NutritionNode } from '../nutrition/nutrition-details';
import { ProgressStory } from '../../components/progress-story';

export type ClientProfile = {
  client:{id:string;displayName:string;email:string;phone:string|null;status:'APPROVED';joinedAt:string};
  onboarding:{status:string;data:Record<string,unknown>}|null;
  program:ProgramAssignment|null;
  nutrition:{snapshot:NutritionNode;assignedAt:string}|null;
  subscription:{plan_name:string;status:string;starts_on:string;ends_or_renews_on:string|null;notes:string;amount:string|null;currency:string|null}|null;
  progress:Array<Record<string,unknown>>;
  workouts:Array<{id:string;name:string;status:string;startedAt:string;completedAt:string|null}>;
  checkins:Checkin[];
};
const tabs=[['overview','Overview'],['questionnaire','Questionnaire'],['training','Training'],['nutrition','Nutrition'],['progress','Progress'],['checkins','Check-ins'],['membership','Membership']] as const;
function date(value:string){return new Date(value.length===10?`${value}T12:00:00`:value).toLocaleDateString();}
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
  return <section className="coach-client-profile">
    <div className="profile-topbar">{back}<div className="actions"><button className="secondary" onClick={()=>void refresh()}>Refresh</button><button className="primary" onClick={()=>setEditing(true)}>Edit client & plans</button></div></div>
    <header className="card client-profile-header"><div className="client-profile-identity"><div className="avatar large" aria-hidden="true">{client.displayName.charAt(0)}</div><div><p className="eyebrow">Client profile</p><h1>{client.displayName}</h1><p>{client.email}</p>{client.phone&&<p>{client.phone}</p>}<span className="status approved">Approved</span></div></div>
      <dl className="client-profile-stats"><div><dt>Joined</dt><dd>{date(client.joinedAt)}</dd></div><div><dt>Membership</dt><dd>{subscription?.plan_name??'Not assigned'}</dd></div><div><dt>Starting weight</dt><dd>{value(onboarding?.data.weight,' kg')}</dd></div><div><dt>Latest weight</dt><dd>{value(latestWeight?.body_weight,' kg')}</dd>{latestWeight&&<small>{String(latestWeight.measurement_date)}</small>}</div><div><dt>Age at onboarding</dt><dd>{value(onboarding?.data.age)}</dd></div><div><dt>Questionnaire</dt><dd>{onboarding?.status.replaceAll('_',' ').toLowerCase()??'Not started'}</dd></div></dl>
      <nav className="client-profile-tabs" aria-label="Client profile sections">{tabs.map(([id,label])=><Link key={id} to={`?tab=${id}`} aria-current={tab===id?'page':undefined}>{label}</Link>)}</nav>
    </header>
    <div className="client-profile-content">
      {tab==='overview'&&<div className="client-profile-grid"><section className="card plan-summary"><h2>Coaching plan</h2><dl className="profile-facts"><div><dt>Training</dt><dd>{program?.snapshot.name??'No program assigned'}</dd></div><div><dt>Nutrition</dt><dd>{nutrition?.snapshot.name??'No plan assigned'}</dd></div><div><dt>Initial questionnaire</dt><dd>{onboarding?.status.toLowerCase()??'Not started'}</dd></div></dl><Link className="secondary" to="?tab=questionnaire">View questionnaire</Link></section>
        <section className="card plan-summary"><h2>Latest check-ins</h2>{checkins.filter(item=>item.submittedAt).slice(0,3).map(item=><div className="profile-record" key={item.id}><strong>{item.form.name}</strong><p>Due {date(item.dueDate)} · {item.status.toLowerCase()}</p></div>)}{!checkins.some(item=>item.submittedAt)&&<p>No submitted check-ins yet.</p>}<Link className="secondary" to="?tab=checkins">View check-ins</Link></section>
        <section className="card plan-summary"><h2>Recent workouts</h2>{workouts.length?workouts.slice(0,5).map(item=><div className="profile-record" key={item.id}><strong>{item.name??'Workout'}</strong><p>{date(item.startedAt)} · {item.status.replaceAll('_',' ').toLowerCase()}</p></div>):<p>No workouts recorded yet.</p>}<Link className="secondary" to="?tab=training">View training</Link></section>
        <section className="card plan-summary"><h2>Latest measurements</h2>{progress[0]?<><p>Recorded {String(progress[0].measurement_date)}</p><dl className="profile-facts">{[['body_weight','Weight',' kg'],['waist','Waist',' cm'],['chest','Chest',' cm'],['arm','Arm',' cm']].map(([key,label,unit])=><div key={key}><dt>{label}</dt><dd>{value(progress[0]?.[key!],unit)}</dd></div>)}</dl></>:<p>No measurements recorded yet.</p>}<Link className="secondary" to="?tab=progress">View progress</Link></section></div>}
      {tab==='questionnaire'&&<div className="card profile-questionnaire"><CoachOnboarding clientId={clientId} onReviewed={()=>setProfile(current=>current&&current.onboarding?{...current,onboarding:{...current.onboarding,status:'REVIEWED'}}:current)}/></div>}
      {tab==='training'&&<section className="card plan-summary"><h2>{program?.snapshot.name??'No program assigned'}</h2>{program?<><p>{program.snapshot.description}</p>{program.snapshot.days.map((day,index)=><section className="profile-record" key={index}><h3>{day.dayLabel}: {day.name}</h3>{day.exercises.map((exercise,i)=><p key={i}>{exercise.name} · {exercise.sets} sets · {exercise.repetitions??`${exercise.durationSeconds??0}s`} {exercise.repetitions!==null?'reps':''}</p>)}</section>)}</>:<p>Use Edit client & plans to assign a training program.</p>}</section>}
      {tab==='nutrition'&&<section className="card plan-summary"><h2>{nutrition?.snapshot.name??'No nutrition plan assigned'}</h2>{nutrition?<NutritionDetails node={nutrition.snapshot}/>:<p>Use Edit client & plans to assign a nutrition plan.</p>}</section>}
      {tab==='progress'&&<>{progress.length?<><ProgressStory entries={progress}/><section className="card plan-summary"><h2>Measurement history</h2><p>Latest {progress.length} records (up to 90).</p><div className="profile-table-scroll"><table><thead><tr><th>Date</th><th>Weight (kg)</th><th>Waist (cm)</th><th>Chest (cm)</th><th>Arm (cm)</th><th>Notes</th></tr></thead><tbody>{progress.map(entry=><tr key={String(entry.measurement_date)}><td>{String(entry.measurement_date)}</td>{['body_weight','waist','chest','arm','notes'].map(key=><td key={key}>{value(entry[key])}</td>)}</tr>)}</tbody></table></div></section></>:<section className="card plan-summary"><h2>Progress</h2><p>This client has not recorded any measurements yet.</p></section>}</>}
      {tab==='checkins'&&<><section className="card plan-summary"><h2>Check-in schedule</h2><p>Latest {checkins.length} assignments (up to 50).</p>{checkins.length?checkins.map(item=><div className="profile-record" key={item.id}><strong>{item.form.name}</strong><p>{date(item.dueDate)} · {item.status.toLowerCase()}</p></div>):<p>No check-ins assigned.</p>}</section><CoachCheckins clients={[relationship]} checkins={checkins} onSaved={refresh}/></>}
      {tab==='membership'&&<section className="card plan-summary"><h2>Membership</h2>{subscription?<><dl className="profile-facts"><div><dt>Plan</dt><dd>{subscription.plan_name}</dd></div><div><dt>Status</dt><dd>{subscription.status.toLowerCase()}</dd></div><div><dt>Starts</dt><dd>{date(subscription.starts_on)}</dd></div><div><dt>Ends / renews</dt><dd>{subscription.ends_or_renews_on?date(subscription.ends_or_renews_on):'Not set'}</dd></div>{subscription.amount&&<div><dt>Amount</dt><dd>{subscription.amount} {subscription.currency}</dd></div>}</dl><p>{subscription.notes}</p><p className="profile-muted">Informational record. Payments are managed outside this app.</p></>:<p>No membership assigned. Use Edit client & plans to add one.</p>}</section>}
    </div>
  </section>;
}
