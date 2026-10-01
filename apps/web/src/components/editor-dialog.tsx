import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function EditorDialog({title,children,onClose,busy=false,variant='default'}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean;variant?:'default'|'drawer'|'confirmation'}) {
  const ref=useRef<HTMLDialogElement>(null);const id=useId();const[dirty,setDirty]=useState(false);
  useEffect(()=>{const dialog=ref.current!;const previous=document.activeElement as HTMLElement|null;dialog.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{dialog.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
  function close(){if(busy)return;if(dirty&&!window.confirm('Discard your unsaved changes?'))return;onClose();}
  return createPortal(<dialog ref={ref} className={`editor-dialog editor-dialog-${variant}`} aria-labelledby={id} onCancel={event=>{event.preventDefault();close();}}><header><h2 id={id}>{title}</h2><button className="secondary" type="button" disabled={busy} aria-label={variant==='default'?'Close form':'Close dialog'} onClick={close}>Close</button></header><div className="editor-body" onChangeCapture={()=>setDirty(true)}>{children}</div></dialog>,document.body);
}
export function Notice({message,error=false,onClear}:{message:string;error?:boolean;onClear:()=>void}){
  if(!message)return null;
  return <div className={`notice ${error?'error':'success'}`} role={error?'alert':'status'}><span>{message}</span><button type="button" className="secondary" onClick={onClear} aria-label="Dismiss message">Dismiss</button></div>;
}
