import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { UnsavedChangesSheet } from './unsaved-changes-sheet';
import { notify } from '../lib/notify';
import { EditorDirtyContext } from './editor-dialog-context';

export function EditorDialog({title,children,onClose,busy=false,variant='default',headerContent,footerContent,trackChanges=true}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean;variant?:'default'|'drawer'|'confirmation';headerContent?:ReactNode;footerContent?:(close:()=>void)=>ReactNode;trackChanges?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);const id=useId();const[dirty,setDirty]=useState(false);
  const [confirmClose,setConfirmClose]=useState(false);
  const returnFocus=useRef<HTMLElement|null>(null);
  useEffect(()=>{const dialog=ref.current!;const previous=document.activeElement as HTMLElement|null;dialog.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{dialog.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
  function keepEditing(){setConfirmClose(false);requestAnimationFrame(()=>returnFocus.current?.focus());}
  function close(){if(busy)return;if(dirty){returnFocus.current=document.activeElement as HTMLElement|null;setConfirmClose(true);return;}onClose();}
  const context = <><h2 id={id}>{title}</h2><button className="secondary" type="button" disabled={busy} aria-label={variant==='default'?'Close form':'Close dialog'} onClick={close}>Close</button></>;
  return createPortal(<dialog ref={ref} className={`editor-dialog editor-dialog-${variant}${headerContent ? ' detail-dialog' : ''}`} aria-labelledby={id} onCancel={event=>{event.preventDefault();if(confirmClose)keepEditing();else close();}}><header inert={confirmClose}>{headerContent ? <><div className="detail-dialog-context">{context}</div>{headerContent}</> : context}</header><div className="editor-body" inert={confirmClose} onChangeCapture={()=>{if(trackChanges)setDirty(true);}}><EditorDirtyContext.Provider value={()=>{if(trackChanges)setDirty(true);}}>{children}</EditorDirtyContext.Provider></div>{footerContent&&<footer className="editor-footer" inert={confirmClose}>{footerContent(close)}</footer>}{confirmClose&&<UnsavedChangesSheet busy={busy} onKeepEditing={keepEditing} onDiscard={()=>{if(!busy)onClose();}}/>}</dialog>,document.body);
}
export function Notice({message,error=false,onClear,transient=false}:{message:string;error?:boolean;onClear:()=>void;transient?:boolean}){
  const lastMessage=useRef('');
  const clear=useRef(onClear);clear.current=onClear;
  useEffect(()=>{
    if(!message){lastMessage.current='';return;}
    if(error&&!transient)return;
    if(lastMessage.current===message)return;
    lastMessage.current=message;
    if(error)notify.error(message);else notify.success(message);
    clear.current();
  },[message,error,transient]);
  if(!error||transient)return null;
  if(!message)return null;
  return <div className={`notice ${error?'error':'success'}`} role={error?'alert':'status'}><span>{message}</span><button type="button" className="secondary" onClick={onClear} aria-label="Dismiss message">Dismiss</button></div>;
}
