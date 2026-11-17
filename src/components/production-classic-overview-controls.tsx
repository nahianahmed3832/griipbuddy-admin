'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductionReportSelect } from './production-report-filters';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminPath } from '@/lib/paths';
import { dateLabel, posRanges } from '@/lib/pos';
import styles from './production-classic-overview.module.css';

export function ClassicOverviewFilters({ locations, location, region, range, from, to }: {
  locations: { value: string; label: string }[]; location?: string; region: string; range: string; from: string; to: string;
}) {
  const [choice, setChoice] = useState(range);
  const [custom, setCustom] = useState(false);
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  function navigate(changes: Record<string, string>) {
    if (!form.current) return;
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(form.current)) if (typeof value === 'string' && value) query.append(key,value);
    for (const [key,value] of Object.entries(changes)) query.set(key,value);
    router.replace('/dashboard/overview?' + query, {scroll:false});
  }

  return <form ref={form} className={styles.filters} action={adminPath('/dashboard/overview')}>
    <input type="hidden" name="view" value="classic"/>
    <input type="hidden" name="region" value={region}/>
    <ProductionReportSelect label="Business Location" name="businessLocation" value={location || ''}
      fieldClassName={styles.field} options={[{value:'',label:'All'},...locations]}
      change={value => navigate({businessLocation:value})}/>
    <div className={styles.dateRange}>
      <ProductionReportSelect label="Date Range" name="selectedOption" value={choice} fieldClassName={styles.field} selectClassName={styles.dateSelect}
        options={posRanges.map(value => ({value,label:value}))} change={value => {
          setChoice(value);
          if (value === 'Custom Range') setCustom(true);
          else navigate({selectedOption:value});
        }}/>
      <button type="button" className={styles.rangeButton} onClick={() => { setChoice('Custom Range'); setCustom(!custom); }}>
        <CalendarDays size={16}/>{from && to ? dateLabel(from, true) + ' - ' + dateLabel(to, true) : 'All time'}
      </button>
      {custom && <div className={styles.dateDialog}>
        <label>From<input name="from" type="date" defaultValue={from} required/></label>
        <label>To<input name="to" type="date" defaultValue={to} required/></label>
        <button type="submit" className="button primary">Apply</button>
      </div>}
      {!custom && choice === 'Custom Range' && <><input type="hidden" name="from" value={from}/><input type="hidden" name="to" value={to}/></>}
    </div>
    <Link className={styles.clear} href={'/dashboard/overview?view=classic' + (region === 'BD' ? '' : '&region=' + region)}>Clear Filter</Link>
  </form>;
}

export function ClassicOverviewTrend({ data }: { data: { date: string; orders: number }[] }) {
  const compact = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
  const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return <div className={styles.trend}>
    <h4>Daily Orders Trend</h4>
    <div className={styles.chart}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs><linearGradient id="classic-orders-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
          </linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3}/>
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={date}/>
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={compact}/>
          <Tooltip labelFormatter={value => new Date(String(value)).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            formatter={value => [Number(value).toLocaleString('en-US'), 'Orders']} contentStyle={{ borderRadius: 8, border: 'none' }}/>
          <Area type="monotone" dataKey="orders" stroke="#3b82f6" fill="url(#classic-orders-gradient)" strokeWidth={2} isAnimationActive={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>;
}
