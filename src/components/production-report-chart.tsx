'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { productionReportValue } from '@/lib/report-format';

export type ReportPoint = { key: string; [key: string]: number | string | null };
export type ReportLine = { key: string; label: string; color: string };

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateName = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact' });

function tickLabel(key: string, unit: string) {
  const date = new Date((key.length === 7 ? key + '-01' : key) + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime())) return key;
  if (unit === 'month') return monthName.format(date);
  const day = dateName.format(date);
  return unit === 'week' ? 'Wk of ' + day : day;
}

export function ProductionReportChart({ points, lines, unit, currency, valueType = 'money', showSinglePoint = false }: {
  points: ReportPoint[];
  lines: ReportLine[];
  unit: string;
  currency: string;
  valueType?: string;
  showSinglePoint?: boolean;
}) {
  if (points.length < (showSinglePoint ? 1 : 2) || !lines.length) return null;
  const label = (value: unknown) => tickLabel(String(value), unit);
  return <div style={{ height: 260, width: '100%' }}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1"/>
        <XAxis dataKey="key" tickFormatter={label} tickLine={false} axisLine={{ stroke: '#94a3b8' }}
          tick={{ fontSize: 12, fill: '#334155' }} minTickGap={16}/>
        <YAxis tickFormatter={value => compact.format(Number(value))} tickLine={false} axisLine={false}
          tick={{ fontSize: 12, fill: '#334155' }} width={56}/>
        <Tooltip labelFormatter={label} formatter={(value, name) => [productionReportValue(value, valueType, currency), name]}
          contentStyle={{ borderRadius: 8, fontSize: 12, borderColor: '#cbd5e1' }}/>
        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600 }}/>
        {lines.map(line => <Line key={line.key} type="monotone" dataKey={line.key} name={line.label} stroke={line.color}
          strokeWidth={2.5} dot={points.length <= 31 && { r: 3, strokeWidth: 2 }} activeDot={{ r: 5 }}/>)}
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
