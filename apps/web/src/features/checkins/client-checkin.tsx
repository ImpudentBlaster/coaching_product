import { CheckinPhotos } from './checkin-photos';
import { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { CheckinFields } from './checkin-fields';
import { collectAnswers, type Checkin } from './checkin-types';

export function DailyCheckins({checkins,onSaved}:{checkins:Checkin[];onSaved:()=>Promise<void>}){
  const now=new Date();
  const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const [day,setDay]=useState(today);
  const dates=[...new Set([today,...checkins.map(checkin=>checkin.dueDate)])].sort();
  const selected=checkins.filter(checkin=>checkin.dueDate===day);
  return <div><label className="daily-checkin-picker">Check-in date<select value={day} onChange={event=>setDay(event.target.value)}>{dates.map(date=><option key={date} value={date}>{date}{date===today?' (Today)':''}</option>)}</select></label>
    {selected.length===0&&<p>No check-in assigned for this date. Choose another date to view your assignments.</p>}
    <div className="workbench-grid">{selected.map(checkin=><ClientCheckin key={`${checkin.id}-${checkin.revision}`} checkin={checkin} onSaved={onSaved}/>)}</div>
  </div>;
}

export function ClientCheckin({checkin,onSaved}:{checkin:Checkin;onSaved:()=>Promise<void>}) {
  const [answers,setAnswers]=useState(checkin.data??{});
  const [busy,setBusy]=useState(false);
  const [photoBusy,setPhotoBusy]=useState(false);
  const [message,setMessage]=useState('');
  const locked=checkin.status==='SUBMITTED'||checkin.status==='REVIEWED';
  async function save(submit:boolean) {
    if(busy||photoBusy)return;
    setBusy(true);setMessage('');
    try { await apiRequest(`/client/checkins/${checkin.id}${submit?'/submit':''}`,{method:submit?'POST':'PUT',body:JSON.stringify({revision:checkin.revision,answers:collectAnswers(checkin.form,answers)})});await onSaved(); }
    catch(error){setMessage(error instanceof Error?error.message:'Unable to save check-in');}
    finally{setBusy(false);}
  }
  return <article className="card profile-card vertical"><h2>{checkin.form.name}</h2><p>Due {checkin.dueDate} · {checkin.status.toLowerCase()}</p><p>{checkin.notes}</p>
    {message&&<p role="alert">{message}</p>}
    <form className="checkin-fields" noValidate onSubmit={event=>{event.preventDefault();void save(true);}}>
      <CheckinFields definition={checkin.form} answers={answers} disabled={busy||photoBusy||locked} onChange={(id,value)=>setAnswers(current=>({...current,[id]:value}))}/>
      {!locked&&<><p>Fields marked * are required when submitting. You can save an incomplete draft.</p><div className="actions"><button className="secondary" type="button" disabled={busy||photoBusy} onClick={()=>void save(false)}>Save draft</button><button className="primary" disabled={busy||photoBusy}>{busy?'Saving…':'Submit check-in'}</button></div></>}
    </form>
    <CheckinPhotos id={checkin.id} locked={locked} disabled={busy} onBusyChange={setPhotoBusy}/>
    {checkin.submittedAt&&<p>Submitted {new Date(checkin.submittedAt).toLocaleString()}</p>}
    {checkin.reviewStatus&&<div className="checkin-review"><strong>{checkin.reviewStatus.replaceAll('_',' ')}</strong><p>{checkin.reviewNotes}</p>{checkin.reviewedAt&&<small>Reviewed {new Date(checkin.reviewedAt).toLocaleString()}</small>}</div>}
  </article>;
}
