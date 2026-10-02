import { useEffect, useId, useRef } from 'react';

export function UnsavedChangesSheet({ onKeepEditing, onDiscard, busy }: { onKeepEditing: () => void; onDiscard: () => void; busy: boolean }) {
  const titleId = useId();
  const descriptionId = useId();
  const keep = useRef<HTMLButtonElement>(null);
  const discard = useRef<HTMLButtonElement>(null);
  useEffect(() => { keep.current?.focus(); }, []);
  return <section className="unsaved-changes-sheet" role="region" aria-labelledby={titleId} aria-describedby={descriptionId}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onKeepEditing(); }
      if (event.key === 'Tab') {
        event.preventDefault();
        (document.activeElement === keep.current ? discard : keep).current?.focus();
      }
    }}>
    <h3 id={titleId}>Unsaved changes</h3>
    <p id={descriptionId}>You have unsaved changes. Discard them or keep editing?</p>
    <div className="actions"><button ref={keep} type="button" className="secondary" onClick={onKeepEditing}>Keep editing</button>
      <button ref={discard} type="button" className="danger" disabled={busy} onClick={onDiscard}>Discard changes</button></div>
  </section>;
}
