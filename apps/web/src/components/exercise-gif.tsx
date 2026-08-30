import {useState} from 'react';

export function ExerciseGif({id,name,available=true}:{id:string;name:string;available?:boolean}){const[failed,setFailed]=useState(!available);return <div className="exercise-media">{failed?<span>Animation unavailable</span>:<img loading="lazy" src={`http://127.0.0.1:3000/api/v1/exercises/${encodeURIComponent(id)}/gif`} alt={`${name} demonstration`} onError={()=>setFailed(true)}/>}</div>}
