import { useState } from 'react';
import './birth-date-picker.css';
export function BirthDatePicker({value,onChange}:{value:string|null;onChange:(value:string|null)=>void}) {
  const [year,setYear]=useState(value?.slice(0,4)??'');
  const [month,setMonth]=useState(value?.slice(5,7)??'');
  const [day,setDay]=useState(value?.slice(8,10)??'');
  const today=new Date().toISOString().slice(0,10);
  const currentYear=Number(today.slice(0,4));
  const days=year&&month?new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate():31;
  const partial=!!(year||month||day);
  function change(nextYear:string,nextMonth:string,nextDay:string) {
    const count=nextYear&&nextMonth?new Date(Date.UTC(Number(nextYear),Number(nextMonth),0)).getUTCDate():31;
    if(Number(nextDay)>count) nextDay='';
    setYear(nextYear);setMonth(nextMonth);setDay(nextDay);
    if(nextYear&&nextMonth&&nextDay)onChange(nextYear+'-'+nextMonth+'-'+nextDay);
    else if(!nextYear&&!nextMonth&&!nextDay)onChange(null);
  }
  return <fieldset className="birth-date-picker"><legend>Date of birth</legend><div className="birth-date-fields">
    <label>Day<select aria-label="Birth day" required={partial} value={day} onChange={event=>change(year,month,event.target.value)}><option value="">Day</option>{Array.from({length:days},(_,index)=>String(index+1).padStart(2,'0')).map(number=><option key={number} value={number} disabled={!!year&&!!month&&year+'-'+month+'-'+number>=today}>{number}</option>)}</select></label>
    <label>Month<select aria-label="Birth month" required={partial} value={month} onChange={event=>change(year,event.target.value,day)}><option value="">Month</option>{['January','February','March','April','May','June','July','August','September','October','November','December'].map((name,index)=><option key={name} value={String(index+1).padStart(2,'0')} disabled={year===String(currentYear)&&index+1>Number(today.slice(5,7))}>{name}</option>)}</select></label>
    <label>Year<select aria-label="Birth year" required={partial} value={year} onChange={event=>change(event.target.value,month,day)}><option value="">Year</option>{Array.from({length:currentYear-1899},(_,index)=>String(currentYear-index)).map(number=><option key={number}>{number}</option>)}</select></label>
  </div><div className="birth-date-help"><small>Optional. Date of birth must be before today.</small>{partial&&<button className="secondary small" type="button" onClick={()=>change('','','')}>Clear birth date</button>}</div></fieldset>;
}

