import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Action = { label: string; onSelect: () => void; danger?: boolean };
export function ActionMenu({ name, items, disabled = false }: { name: string; items: Action[]; disabled?: boolean }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  function close(restore = false) { setPosition(null); if (restore) trigger.current?.focus(); }
  function open() {
    const rect = trigger.current!.getBoundingClientRect();
    const height = items.length * 42 + 12;
    setPosition({ top: Math.max(8, rect.bottom + height + 8 > window.innerHeight ? rect.top - height - 4 : rect.bottom + 4), left: Math.max(8, Math.min(rect.right - 170, window.innerWidth - 178)) });
  }
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function outside(event: PointerEvent) { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null); }
    function dismiss() { setPosition(null); }
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true); };
  }, [position]);
  return <>
    <button ref={trigger} type="button" className="secondary icon-button workout-icon-action" title="Actions" aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? id : undefined} disabled={disabled}
      onClick={() => position ? close() : open()} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); open(); } }}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
    </button>
    {position && createPortal(<div ref={menu} id={id} role="menu" aria-label={`Actions for ${name}`} className="row-action-menu" style={position}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
      onKeyDown={event => {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      }}>
      {items.map(item => <button type="button" role="menuitem" key={item.label} className={item.danger ? 'danger' : ''} onClick={() => { close(true); item.onSelect(); }}>{item.label}</button>)}
    </div>, document.body)}
  </>;
}
