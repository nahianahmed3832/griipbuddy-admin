'use client';

import { CalendarDays } from 'lucide-react';
import { useRef, useState } from 'react';
import { posRangeDates, posRanges, validPosDay, type PosRange } from '@/lib/pos';
import { OrderDateRangeCalendar, type OrderDateRange } from './order-date-range-calendar';
import { ProductionReportSelect } from './production-report-filters';
import styles from './production-date-range.module.css';

const options = posRanges.map(value => ({ value, label: value }));
const date = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit' });
const format = (day: string) => date.format(new Date(day + 'T00:00:00Z'));

export function ProductionDateRange({ range, from, to, today, onChange }: {
  range: PosRange; from: string; to: string; today: string;
  onChange: (range: PosRange, from: string, to: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState(false);
  const [draft, setDraft] = useState<OrderDateRange>();
  const picked = draft ?? { from: validPosDay(from) ? from : '1970-01-01', to: validPosDay(to) ? to : today };
  const close = () => { setChosen(false); setDraft(undefined); };
  return <div className={styles.field}>
    <ProductionReportSelect label="Date Range" fieldClassName={styles.preset} selectClassName={styles.control}
      value={chosen ? 'Custom Range' : range} options={options} change={value => {
        const preset = options.find(option => option.value === value)?.value;
        if (!preset) return;
        if (preset === 'Custom Range') { setChosen(true); return; }
        close();
        onChange(preset, ...posRangeDates(preset, today));
      }}/>
    <button type="button" ref={trigger} aria-label="Select date range" aria-expanded={chosen} aria-haspopup="dialog"
      className={styles.button} onClick={() => chosen ? close() : setChosen(true)}>
      <CalendarDays size={16}/>{format(picked.from)}
      {picked.to && picked.from !== picked.to && ' - ' + format(picked.to)}
    </button>
    {chosen && <OrderDateRangeCalendar today={today} range={picked} trigger={trigger} close={close} onChange={value => {
      setDraft(value);
      if (value.to) onChange('Custom Range', value.from, value.to);
    }}/>}
  </div>;
}
