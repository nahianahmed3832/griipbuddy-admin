import { dateParam, param, reportQuery, type Query } from './data';
import type { Region } from './sections';

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
  const period = input && ['today','yesterday','7','30','90','custom'].includes(input) ? input : custom ? 'custom' : fallback;
  const today = dhakaDay();
  const to = period === 'yesterday' ? offset(today, -1) : period === 'custom' ? validDay(param(query,'to')) ?? today : today;
  const from = period === 'custom' ? validDay(param(query,'from')) ?? to : ['7','30','90'].includes(period) ? offset(to, 1 - Number(period)) : to;
  return { period, from, to };
}

export function overviewQuery(query: Query, region: Region) {
  const { period, from, to } = periodRange(query);
  const scope = reportQuery({ ...query, from, to }, region);
  return { period, scope, refresh: param(query,'refresh') === '1' ? '1' : undefined };
}
