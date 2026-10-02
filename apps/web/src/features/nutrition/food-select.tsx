import './food-library.css';
import { useEffect, useId, useRef, useState } from 'react';
import type { NutritionNode } from './nutrition-details';

export function FoodSelect({ index, options, value, onSelect }: { index: number; options: Array<{id:string;data:NutritionNode}>; value:string; onSelect:(id:string)=>void }) {
  const id=useId(); const input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false); const [query,setQuery]=useState(''); const [active,setActive]=useState(-1);
  const selected=options.find(option=>option.id===value);
  const matches=options.filter(option=>option.data.name.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{input.current?.setCustomValidity(value&&selected?'':'Choose a food from the dropdown.');},[value,selected]);
  function close(){setOpen(false);setQuery('');setActive(-1);}
  function choose(foodId:string){onSelect(foodId);close();}
  return <div className="exercise-picker food-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))close();}}>
    <label htmlFor={id}>food</label>
    <div className="exercise-combobox-control"><input ref={input} id={id} role="combobox" aria-label={`Food ${index}`} aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open&&active>=0?`${id}-${active}`:undefined} required={!value} autoComplete="off" value={open?query:selected?.data.name??''} placeholder="Search predefined and your own foods…"
      onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setActive(-1);setOpen(true);}}
      onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);setActive(current=>matches.length?(current+(event.key==='ArrowDown'?1:-1)+matches.length)%matches.length:-1);}else if(event.key==='Enter'&&open){event.preventDefault();if(matches[active])choose(matches[active].id);}else if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();}}}/><span className="exercise-combobox-chevron" aria-hidden="true">⌄</span></div>
    {open&&<div className="exercise-combobox-popup"><div role="listbox" id={`${id}-list`} aria-label={`Foods for food ${index}`}>{matches.map((option,i)=><button type="button" role="option" tabIndex={-1} id={`${id}-${i}`} key={option.id} aria-selected={option.id===value} className={active===i?'highlighted':''} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(option.id)}>{option.data.name}</button>)}</div>{!matches.length&&<p role="status">No foods match your search.</p>}</div>}
  </div>;
}
