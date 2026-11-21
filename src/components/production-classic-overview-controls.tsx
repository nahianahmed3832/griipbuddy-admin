'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ProductionReportSelect } from './production-report-filters';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminPath } from '@/lib/paths';
import type { PosRange } from '@/lib/pos';
import { productionReportValue } from '@/lib/report-format';
import { ProductionDateRange } from './production-date-range';
import styles from './production-classic-overview.module.css';

export function ClassicOverviewFilters({ locations, location, region, range, from, to, today, assigned }: {
  locations: { value: string; label: string }[]; location?: string; region: string; range: PosRange; from: string; to: string; today: string; assigned?: boolean;
}) {
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
    <input type="hidden" name="selectedOption" value={range}/>
    {range === 'Custom Range' && <><input type="hidden" name="from" value={from}/><input type="hidden" name="to" value={to}/></>}
    <ProductionReportSelect label="Business Location" name="businessLocation" value={location || ''}
      fieldClassName={styles.field} options={assigned ? locations : [{value:'',label:'All'},...locations]}
      change={value => navigate({businessLocation:value})}/>
    <ProductionDateRange from={from} to={to} today={today} range={range} onChange={(selection, from, to) =>
      navigate({ selectedOption: selection, from: selection === 'Custom Range' ? from : '', to: selection === 'Custom Range' ? to : '' })}/>
    <Link className={styles.clear} href={'/dashboard/overview?view=classic' + (region === 'BD' ? '' : '&region=' + region)}>Clear Filter</Link>
  </form>;
}

export function ClassicOverviewTrend({ data, currency }: { data: { date: string; orders: number }[]; currency: string }) {
  const compact = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);
  const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return <div className={styles.trend}>
    <h4>Booked online order value ({currency})</h4>
    <div className={styles.chart}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs><linearGradient id="classic-orders-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
          </linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3}/>
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={date}/>
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={compact}/>
          <Tooltip labelFormatter={value => new Date(String(value)).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}
            formatter={value => [productionReportValue(value, 'money', currency), 'Booked value']} contentStyle={{ borderRadius: 8, border: 'none' }}/>
          <Area type="monotone" dataKey="orders" stroke="#3b82f6" fill="url(#classic-orders-gradient)" strokeWidth={2} isAnimationActive={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>;
}
