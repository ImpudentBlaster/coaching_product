import { useCallback, useEffect, useState } from 'react';
import { apiBlob, apiRequest } from '../../lib/api';

type Photo={id:string;createdAt:string};
export function CheckinPhotos({id,coach=false,locked=false,disabled=false,onBusyChange}:{id:string;coach?:boolean;locked?:boolean;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const [photos,setPhotos]=useState<Photo[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [loaded,setLoaded]=useState(false);
  const path=`/${coach?'coach':'client'}/checkins/${id}/photos`;
  const load=useCallback(async()=>{
    try{setPhotos((await apiRequest<{photos:Photo[]}>(path)).photos);setLoaded(true);}
    catch(error){setMessage(error instanceof Error?error.message:'Unable to load photos');}
  },[path]);
  useEffect(()=>{void load();},[load]);
  async function upload(file:File){
    if(busy||disabled)return;
    if(file.size>8*1024*1024){setMessage('Choose a photo smaller than 8 MB.');return;}
    setBusy(true);onBusyChange?.(true);setMessage('');
    try{await apiRequest(path,{method:'POST',headers:{'content-type':'application/octet-stream'},body:file});await load();}
    catch(error){setMessage(error instanceof Error?error.message:'Unable to upload photo');}
    finally{setBusy(false);onBusyChange?.(false);}
  }
  async function remove(photoId:string){
    if(busy||disabled)return;
    setBusy(true);onBusyChange?.(true);setMessage('');
    try{await apiRequest(`${path}/${photoId}`,{method:'DELETE'});await load();}
    catch(error){setMessage(error instanceof Error?error.message:'Unable to remove photo');}
    finally{setBusy(false);onBusyChange?.(false);}
  }
  return <section className="checkin-photo-section"><h3>Check-in photos</h3>
    {!locked&&!coach&&<><p>Upload at least one photo to submit. JPEG, PNG or WebP, up to 8 MB each; maximum 5 photos. Visible only to you and your approved coach.</p><label>Add a photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||disabled||photos.length>=5} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file);}}/></label></>}
    {busy&&<p role="status">Saving photo…</p>}{message&&<p role="alert">{message}</p>}
    {loaded&&photos.length===0&&<p>{locked||coach?'No photos attached.':'No photos uploaded yet.'}</p>}
    <div className="checkin-photo-grid">{photos.map(photo=><div key={photo.id}><PrivatePhoto path={`${path}/${photo.id}`}/>{!locked&&!coach&&<button type="button" className="danger" disabled={busy||disabled} onClick={()=>void remove(photo.id)}>Remove photo</button>}</div>)}</div>
  </section>;
}
function PrivatePhoto({path}:{path:string}){
  const [url,setUrl]=useState('');const[error,setError]=useState('');
  useEffect(()=>{let active=true;let objectUrl='';void apiBlob(path).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}}).catch(()=>{if(active)setError('Unable to load photo.');});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[path]);
  return url?<a href={url} target="_blank" rel="noreferrer"><img className="checkin-photo" src={url} alt="Private check-in photo"/></a>:<p>{error||'Loading photo…'}</p>;
}
