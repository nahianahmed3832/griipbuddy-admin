'use client';

import { Ellipsis } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './production-catalog.module.css';

export function ProductionCatalogActions({ label, title, outlined, children }: {
  label: string; title?: string; outlined?: boolean; children: (close: () => void) => ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    function close() {
      if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
    }
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  function close() {
    if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
  }
  function toggle() {
    const menu = panel.current;
    const rect = trigger.current?.getBoundingClientRect();
    if (!menu || !rect) return;
    if (menu.matches(':popover-open')) {
      menu.hidePopover();
      return;
    }
    menu.showPopover();
    menu.style.left = Math.max(4, Math.min(window.innerWidth - menu.offsetWidth - 4, rect.right - menu.offsetWidth)) + 'px';
    menu.style.top = (rect.bottom + menu.offsetHeight <= window.innerHeight - 4
      ? rect.bottom + 4 : Math.max(4, rect.top - menu.offsetHeight - 4)) + 'px';
  }
  return <div className={styles.rowMenu}>
    <button className={outlined ? styles.iconOutline : styles.iconGhost} type="button" ref={trigger}
      aria-label={label} aria-expanded={open} aria-controls={id} onClick={toggle}><Ellipsis size={16} aria-hidden="true"/></button>
    <div className={styles.dropdown} popover="auto" id={id} ref={panel}
      onToggle={event => setOpen(event.currentTarget.matches(':popover-open'))}>
      {title && <strong>{title}</strong>}{children(close)}
    </div>
  </div>;
}
