'use client';

import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronDown, CircleX, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './production-location-filter.module.css';

export type LocationOption = { value: string; label: string };

export function ProductionLocationFilter({ options, value, change, className, triggerClassName, name }: {
  options: LocationOption[];
  value: string[];
  change: (value: string[]) => void;
  className?: string;
  triggerClassName?: string;
  name?: string;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(value);
  const selectedRef = useRef(value);
  useEffect(() => {
    selectedRef.current = value;
    setSelected(value);
  }, [value]);

  function commit(next: string[]) {
    selectedRef.current = next;
    setSelected(next);
    change(next);
  }

  function toggle(id: string) {
    const current = selectedRef.current;
    commit(current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  function removeControl(label: string, remove: () => void) {
    return <span role="button" tabIndex={0} aria-label={label} className={styles.remove} onClick={event => {
      event.stopPropagation();
      remove();
    }} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        remove();
      }
    }}><CircleX size={16}/></span>;
  }

  return <div className={[styles.field, className].filter(Boolean).join(' ')}>
    <span id={labelId}>Locations</span>
    {name && selected.map(id => <input key={id} type="hidden" name={name} value={id}/>)}
    <Popover.Root open={open} onOpenChange={setOpen} modal>
      <Popover.Trigger asChild>
        <button type="button" aria-labelledby={labelId} className={[styles.trigger, triggerClassName].filter(Boolean).join(' ')}>
          {selected.length ? <span className={styles.selected}>
            <span className={styles.badges}>
              {selected.slice(0, 2).map(id => <span className={styles.badge} key={id}>
                {options.find(option => option.value === id)?.label}
                {removeControl('Remove ' + (options.find(option => option.value === id)?.label ?? 'location'), () => toggle(id))}
              </span>)}
              {selected.length > 2 && <span className={styles.badge}>+ {selected.length - 2} more
                {removeControl('Remove additional locations', () => commit(selectedRef.current.slice(0, 2)))}
              </span>}
            </span>
            <span className={styles.actions}>
              <span role="button" tabIndex={0} aria-label="Clear locations" onClick={event => {
                event.stopPropagation();
                commit([]);
              }} onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  commit([]);
                }
              }}><X size={16}/></span>
              <span className={styles.separator}/><ChevronDown size={16}/>
            </span>
          </span> : <span className={styles.placeholder}><span>All locations</span><ChevronDown size={16}/></span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.menu} align="start" sideOffset={4} onEscapeKeyDown={() => setOpen(false)}>
          <Command className={styles.command}>
            <div className={styles.search}><Search size={16}/><Command.Input placeholder="Search..." aria-label="Search locations" onKeyDown={event => {
              if (event.key === 'Enter') setOpen(true);
              if (event.key === 'Backspace' && !event.currentTarget.value) commit(selectedRef.current.slice(0, -1));
            }}/></div>
            <Command.List className={styles.list}>
              <Command.Empty className={styles.empty}>No results found.</Command.Empty>
              <Command.Group className={styles.group}>
                {options.map(option => <Command.Item className={styles.item} key={option.value} value={option.label} onSelect={() => toggle(option.value)}>
                  <span className={styles.checkbox} data-checked={selected.includes(option.value)}><Check size={12}/></span><span>{option.label}</span>
                </Command.Item>)}
              </Command.Group>
              <Command.Separator className={styles.divider}/>
              <Command.Group className={styles.group}>
                <div className={styles.footer}>
                  {selected.length > 0 && <><Command.Item className={styles.item} onSelect={() => commit([])}>Clear</Command.Item><span className={styles.separator}/></>}
                  <Command.Item className={styles.item} onSelect={() => setOpen(false)}>Close</Command.Item>
                </div>
              </Command.Group>
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </div>;
}
