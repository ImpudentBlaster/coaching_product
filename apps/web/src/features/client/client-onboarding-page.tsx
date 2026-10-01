import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { onboardingSections, type Onboarding } from './onboarding-types';

const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export function ClientOnboardingPage() {
  const navigate = useNavigate();
  const form = useRef<HTMLFormElement>(null);
  const [record,setRecord] = useState<Onboarding|null>();
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const locked = !!record && record.status !== 'DRAFT';
  useEffect(()=>{
    let active = true;
    void apiRequest<{onboarding:Onboarding|null}>('/client/onboarding').then(result=>{if(active)setRecord(result.onboarding);}).catch((error:unknown)=>{if(active)setError(error instanceof Error?error.message:'Unable to load questionnaire.');});
    return ()=>{active=false;};
  },[attempt]);
  async function save(submit:boolean) {
    if (busy || !form.current || locked) return;
    if (submit && !form.current.reportValidity()) return;
    const values = new FormData(form.current);
    const data: Onboarding['data'] = {};
    for (const section of onboardingSections) for (const field of section.fields) {
      const raw = String(values.get(field.name)??'');
      if (field.type === 'days') data[field.name] = values.getAll(field.name).map(String);
      else if (field.type === 'equipment') data[field.name] = raw.split(',').map(item=>item.trim()).filter(Boolean);
      else if (field.type === 'number') {if(raw)data[field.name]=Number(raw);}
      else if (raw || field.type !== 'experience') data[field.name]=raw;
    }
    setBusy(true);setError('');setMessage('');
    try {
      const result = await apiRequest<{onboarding:Onboarding}>(`/client/onboarding${submit?'/submit':''}`,{method:submit?'POST':'PUT',body:JSON.stringify(data)});
      setRecord(result.onboarding);
      if (submit) navigate('/client',{replace:true});
      else setMessage('Draft saved. You can safely return to this questionnaire later.');
    } catch(error) {setError(error instanceof Error?error.message:'Unable to save your answers.');}
    finally {setBusy(false);}
  }
  function handleSubmit(event:FormEvent) {event.preventDefault();void save(true);}
  if (record === undefined) return <section className="card">{error?<><p role="alert">{error}</p><button className="secondary" onClick={()=>{setError('');setAttempt(value=>value+1);}}>Try again</button></>:<p role="status">Loading your questionnaire…</p>}</section>;
  return <section className="onboarding-page">
    <header className="onboarding-welcome"><p className="eyebrow">Your starting point</p><h1>{locked?'Your initial questionnaire':'Welcome to your coaching journey'}</h1><p className="lede">Tell your coach about yourself so they can prepare your training and nutrition plan.</p>
      <p>{locked?record.status==='REVIEWED'?'Your coach has reviewed your answers.':'Submitted — your answers are ready for your coach to review.':'Complete the four sections below. Fields marked * are required. Save a draft whenever you need a break.'}</p>
      {record?.submittedAt&&<p>Submitted {new Date(record.submittedAt).toLocaleString()}{record.reviewedAt?` · Reviewed ${new Date(record.reviewedAt).toLocaleString()}`:''}</p>}
    </header>
    <nav className="onboarding-sections" aria-label="Questionnaire sections">{onboardingSections.map((section,index)=><a href={`#onboarding-${index}`} key={section.title}><span>{index+1}</span>{section.title}</a>)}</nav>
    <form ref={form} onSubmit={handleSubmit} className="onboarding-form">
      {onboardingSections.map((section,index)=><fieldset className="card onboarding-section" id={`onboarding-${index}`} key={section.title} disabled={busy||locked}>
        <legend>{index+1}. {section.title}</legend><p>{section.description}</p>
        <div className="onboarding-fields">{section.fields.map(field=>{
          const initial = record?.data[field.name];
          if (field.type === 'days') return <fieldset className="onboarding-days" key={field.name}><legend>{field.label}</legend>{days.map(day=><label key={day}><input name={field.name} type="checkbox" value={day} defaultChecked={Array.isArray(initial)&&initial.includes(day)}/>{day}</label>)}</fieldset>;
          return <label key={field.name}>{field.label}{field.required?' *':''}
            {field.type==='experience'?<select name={field.name} defaultValue={String(initial??'')} required><option value="">Select your experience</option><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></select>
              :field.type==='number'?<input name={field.name} type="number" min={field.step??1} max={field.max} step={field.step??1} required={field.required} defaultValue={String(initial??'')}/>
              :field.type==='equipment'?<input name={field.name} maxLength={field.maxLength} defaultValue={Array.isArray(initial)?initial.join(', '):String(initial??'')} placeholder="For example: dumbbells, resistance bands"/>
              :<textarea name={field.name} rows={3} required={field.required} minLength={field.required?2:undefined} maxLength={field.maxLength} defaultValue={String(initial??'')}/>}
          </label>;
        })}</div>
      </fieldset>)}
      <div className="card onboarding-actions">{error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}
        {locked?<Link className="primary link-button" to="/client">Go to dashboard</Link>:<><p>Your coach can view saved drafts. Once submitted, your answers are locked for review.</p><div className="actions"><button className="secondary" type="button" disabled={busy} onClick={()=>void save(false)}>Save draft</button><button className="primary" type="submit" disabled={busy}>{busy?'Saving…':'Submit questionnaire'}</button></div></>}
      </div>
    </form>
  </section>;
}
