import type { Definition } from './checkin-types';
export function CheckinFields({ definition, answers, onChange, disabled=false }: {definition:Definition;answers:Record<string,string|number>;onChange:(id:string,value:string|number)=>void;disabled?:boolean}) {
  return <>{definition.fields.map(field=><label key={field.id}>{field.label}{field.unit?` (${field.unit})`:''}{field.required?' *':''}
    {field.type==='LONG_TEXT'?<textarea disabled={disabled} maxLength={4000} value={answers[field.id]??''} onChange={event=>onChange(field.id,event.target.value)}/>:<input disabled={disabled} type={field.type==='NUMBER'||field.type==='RATING'?'number':'text'} min={field.min} max={field.max} step={field.type==='RATING'?1:'any'} maxLength={500} value={answers[field.id]??''} onChange={event=>onChange(field.id,event.target.value)}/>}
  </label>)}</>;
}
