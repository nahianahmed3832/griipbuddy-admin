'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import styles from './order-date-range-calendar.module.css';

export type OrderDateRange = { from: string; to: string };
const headings = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const caption = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const spokenDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'full' });

function monthDate(value: string) {
  const result = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(result.getTime())) return new Date();
  return result;
}

function monthAt(value: Date, distance: number, day = 1) {
  const result = new Date(value);
  result.setUTCMonth(value.getUTCMonth() + distance, day);
  return result;
}

function daySlot(month: Date, offset: number) {
  const first = monthAt(month, 0);
  const date = monthAt(month, 0, offset + 1 - first.getUTCDay());
  return { day: date.toISOString().slice(0, 10), number: date.getUTCDate(), outside: date.getUTCMonth() !== month.getUTCMonth() };
}

function Month({ month, range, onPick }: {
  month: Date; range: OrderDateRange; onPick: (day: string) => void;
}) {
  const title = caption.format(month);
  const cells = Math.ceil((monthAt(month, 0).getUTCDay() + monthAt(month, 1, 0).getUTCDate()) / 7) * 7;
  return <section className={styles.month} aria-label={title}>
    <h3>{title}</h3>
    <div className={styles.days}>
      {headings.map(label => <span className={styles.weekday} key={label}>{label}</span>)}
      {Array.from({ length: cells }, (_, index) => {
        const { day, number, outside } = daySlot(month, index);
        const boundary = day === range.from || day === range.to;
        const selected = boundary || !!(range.from && range.to && day > range.from && day < range.to);
        return <button type="button" key={day} title={spokenDay.format(monthDate(day))}
          aria-label={spokenDay.format(monthDate(day))} aria-pressed={selected} data-boundary={boundary}
          data-from={day === range.from} data-outside={outside} onClick={() => onPick(day)}>{number}</button>;
      })}
    </div>
  </section>;
}

export function OrderDateRangeCalendar({ range, today, trigger, close, onChange }: {
  range: OrderDateRange; today: string; trigger: RefObject<HTMLButtonElement | null>;
  close: () => void; onChange: (value: OrderDateRange) => void;
}) {
  const [month, setMonth] = useState(() => monthAt(monthDate(range.from || today), 0));
  const [anchor, setAnchor] = useState('');
  const popover = useRef<HTMLDivElement>(null);
  const label = useId();

  useLayoutEffect(() => {
    const popup = popover.current;
    const button = trigger.current;
    if (!popup || !button) return;
    function place() {
      if (!popup || !button) return;
      const target = button.getBoundingClientRect();
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      const margin = 4;
      const left = Math.max(margin, Math.min(target.left, window.innerWidth - width - margin));
      const bottomSpace = window.innerHeight - target.bottom;
      const above = bottomSpace < height + margin && target.top > bottomSpace;
      const top = Math.max(margin, above ? target.top - height - margin : target.bottom + margin);
      popup.style.left = Math.round(left) + 'px';
      popup.style.top = Math.round(top) + 'px';
    }
    place();
    const size = new ResizeObserver(place);
    size.observe(popup);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => { size.disconnect(); window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [trigger]);

  useEffect(() => {
    (popover.current?.querySelector<HTMLButtonElement>('button[data-from="true"]') ??
      popover.current?.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!popover.current?.contains(target) && !trigger.current?.contains(target)) close();
    }
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [close, trigger]);

  function choose(day: string) {
    if (!anchor) {
      setAnchor(day);
      onChange({ from: day, to: '' });
    } else {
      onChange(day < anchor ? { from: day, to: anchor } : { from: anchor, to: day });
      setAnchor('');
    }
  }

  return <div className={styles.calendar} ref={popover} role="dialog" aria-labelledby={label}
    onKeyDown={event => { if (event.key === 'Escape') { close(); trigger.current?.focus(); } }}>
    <span className={styles.srOnly} id={label}>Choose a date range</span>
    <div className={styles.navigation}>
      <button type="button" aria-label="Previous month" onClick={() => setMonth(value => monthAt(value, -1))}><ChevronLeft size={16}/></button>
      <button type="button" aria-label="Next month" onClick={() => setMonth(value => monthAt(value, 1))}><ChevronRight size={16}/></button>
    </div>
    <Month month={month} range={range} onPick={choose}/>
    <Month month={monthAt(month, 1)} range={range} onPick={choose}/>
  </div>;
}
