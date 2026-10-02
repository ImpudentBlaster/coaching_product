import { createContext, useContext } from 'react';

export const EditorDirtyContext=createContext<()=>void>(()=>{});
export function useEditorDirty(){return useContext(EditorDirtyContext);}
