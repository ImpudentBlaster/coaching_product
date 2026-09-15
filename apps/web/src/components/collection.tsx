import { Children, isValidElement, useId, useState, type ReactNode } from 'react';

function searchable(node:ReactNode):string {
  if(typeof node==='string'||typeof node==='number')return String(node);
  if(Array.isArray(node))return node.map(searchable).join(' ');
  if(isValidElement<{children?:ReactNode;'data-search'?:string}>(node))return node.props['data-search']??searchable(node.props.children);
  return '';
}
export function Collection({title,children,actions,loading=false,error='',onRetry}:{title:string;children:ReactNode;actions?:ReactNode;loading?:boolean;error?:string;onRetry?:()=>void}) {
  const id=useId();const[query,setQuery]=useState('');const[page,setPage]=useState(1);const[size,setSize]=useState(10);
  const rows=Children.toArray(children).filter(row=>isValidElement(row));
  const filtered=rows.filter(row=>searchable(row).toLowerCase().includes(query.trim().toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/size));const current=Math.min(page,pages);
  return <section className="card collection" aria-busy={loading}>
    <header className="collection-toolbar"><div><h2>{title}</h2><span className="collection-count">{filtered.length} {filtered.length===1?'record':'records'}</span></div><div className="collection-tools">
      <label className="collection-search" htmlFor={id}><span className="sr-only">Search {title}</span><input id={id} type="search" placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}}/></label>
      {query&&<button type="button" className="secondary" onClick={()=>{setQuery('');setPage(1);}}>Clear search</button>}{actions}
    </div></header>
    {error?<div className="collection-empty" role="alert"><h3>Unable to load {title.toLowerCase()}</h3><p>{error}</p>{onRetry&&<button className="secondary" onClick={onRetry}>Try again</button>}</div>:loading?<div className="collection-empty" role="status">Loading {title.toLowerCase()}…</div>:filtered.length===0?<div className="collection-empty"><h3>{query?'No matches found':`No ${title.toLowerCase()} yet`}</h3><p>{query?'Try a different search or clear your search.':'New records will appear here.'}</p></div>:<div className="collection-rows">{filtered.slice((current-1)*size,current*size)}</div>}
    <footer className="collection-pagination"><label>Rows per page<select value={size} onChange={event=>{setSize(Number(event.target.value));setPage(1);}}>{[10,25,50].map(value=><option key={value}>{value}</option>)}</select></label><span aria-live="polite">{filtered.length?`${(current-1)*size+1}–${Math.min(current*size,filtered.length)}`:'0'} of {filtered.length}</span><div className="actions"><button type="button" className="secondary" disabled={loading||current===1} onClick={()=>setPage(current-1)} aria-label={`Previous page of ${title}`}>Previous</button><span>{current} / {pages}</span><button type="button" className="secondary" disabled={loading||current===pages} onClick={()=>setPage(current+1)} aria-label={`Next page of ${title}`}>Next</button></div></footer>
  </section>;
}
