import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { onboardingSections, type Onboarding } from '../client/onboarding-types';

export function CoachOnboarding({clientId,onReviewed}:{clientId:string;onReviewed?:()=>void}) {
  const [record,setRecord] = useState<Onboarding|null>();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    let active=true;
    void apiRequest<{onboarding:Onboarding|null}>(`/coach/clients/${clientId}/onboarding`).then(result=>{if(active)setRecord(result.onboarding);}).catch((error:unknown)=>{if(active)setError(error instanceof Error?error.message:'Unable to load questionnaire.');});
    return ()=>{active=false;};
  },[clientId,attempt]);
  async function review() {
    setBusy(true);setError('');
    try {const result=await apiRequest<{onboarding:Onboarding}>(`/coach/clients/${clientId}/onboarding/review`,{method:'POST',body:'{}'});setRecord(result.onboarding);onReviewed?.();}
    catch(error){setError(error instanceof Error?error.message:'Unable to review questionnaire.');}
    finally{setBusy(false);}
  }
  return <section className="onboarding-review"><h2>Initial questionnaire</h2>
    {error&&<><p role="alert" className="error">{error}</p><button className="secondary" onClick={()=>{setError('');setAttempt(value=>value+1);}}>Try again</button></>}
    {record===undefined&&!error&&<p role="status">Loading questionnaire…</p>}
    {record===null&&<p>This client has not started their questionnaire yet.</p>}
    {record&&<><p className="status">{record.status==='DRAFT'?'Draft — not submitted':record.status==='SUBMITTED'?'Submitted — ready for review':'Reviewed'}</p>
      {record.submittedAt&&<p>Submitted {new Date(record.submittedAt).toLocaleString()}</p>}
      {record.reviewedAt&&<p>Reviewed {new Date(record.reviewedAt).toLocaleString()}</p>}
      {onboardingSections.map(section=><section key={section.title}><h3>{section.title}</h3><dl>{section.fields.map(field=>{const value=record.data[field.name];return <div className="onboarding-answer" key={field.name}><dt>{field.label}</dt><dd>{Array.isArray(value)?value.join(', ')||'Not provided':value===''||value===undefined||value===null?'Not provided':String(value)}</dd></div>;})}</dl></section>)}
      {record.status==='SUBMITTED'&&<button className="primary" disabled={busy} onClick={()=>void review()}>{busy?'Saving…':'Mark as reviewed'}</button>}
    </>}
  </section>;
}
