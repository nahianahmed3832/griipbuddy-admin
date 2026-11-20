import { dateParam, param, reportQuery, type Query } from './data';
import type { Region } from './sections';
import { overviewPresets } from './overview-periods';

function validDay(value?: string) {
  if (!dateParam(value)) return undefined;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? value : undefined;
}

function dhakaDay() {
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' });
  return format.format(new Date());
}

function offset(day: string, days: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function periodRange(query: Query, fallback = 'today') {
  const input = param(query, 'period');
  const custom = validDay(param(query, 'from')) || validDay(param(query, 'to'));
  const period = input && (overviewPresets.some(([key]) => key === input) || ['7','30','90'].includes(input))
    ? input : custom ? 'custom' : fallback;
  const today = dhakaDay();
  const [year, month] = today.split('-').map(Number);
  const monthStart = today.slice(0, 7) + '-01';
  const previousMonthEnd = offset(monthStart, -1);
  const quarterMonth = 1 + 3 * Math.floor((month - 1) / 3);
  if (period === 'lastMonth') return { period, from: previousMonthEnd.slice(0, 7) + '-01', to: previousMonthEnd };
  if (period === 'thisMonth') return { period, from: monthStart, to: today };
  if (period === 'thisQuarter') return { period, from: year + '-' + String(quarterMonth).padStart(2, '0') + '-01', to: today };
  if (period === 'thisFiscalYear') return { period, from: (month < 7 ? year - 1 : year) + '-07-01', to: today };
  const to = period === 'yesterday' ? offset(today, -1) : period === 'custom' ? validDay(param(query,'to')) ?? today : today;
  const duration = ({ last7: 7, last30: 30, '7': 7, '30': 30, '90': 90 } as Record<string, number>)[period];
  const from = period === 'custom' ? validDay(param(query,'from')) ?? to : duration ? offset(to, 1 - duration) : to;
  return from <= to ? { period, from, to } : { period, from: today, to: today };
}

export function overviewQuery(query: Query, region: Region) {
  const { period, from, to } = periodRange(query);
  const scope = reportQuery({ ...query, from, to }, region);
  return { period, scope, refresh: param(query,'refresh') === '1' ? '1' : undefined };
}
