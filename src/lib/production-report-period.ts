import type { Query } from './data';

export const productionReportPeriods = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisQuarter', label: 'This quarter' },
  { value: 'thisFiscalYear', label: 'This fiscal year (Jul–Jun)' },
  { value: 'custom', label: 'Custom range' },
] as const;

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

function daysBefore(day: string, offset: number) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function param(query: Query, key: string) {
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

export function productionReportPeriodRange(query: Query) {
  const requested = param(query, 'period');
  const customFrom = validDate(param(query, 'from'));
  const customTo = validDate(param(query, 'to'));
  const period = requested === '7' ? 'last7' : requested === '30' ? 'last30' : requested === '90' ? 'last90'
    : productionReportPeriods.some(option => option.value === requested) || requested === 'last90'
      ? requested! : customFrom || customTo ? 'custom' : 'last30';
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const monthStart = today.slice(0, 7) + '-01';
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const quarterStart = 1 + 3 * Math.floor((month - 1) / 3);

  if (period === 'custom') {
    return { period, from: customFrom ?? customTo ?? today, to: customTo ?? customFrom ?? today };
  }
  if (period === 'yesterday') {
    const day = daysBefore(today, 1);
    return { period, from: day, to: day };
  }
  if (period === 'lastMonth') {
    const to = daysBefore(monthStart, 1);
    return { period, from: to.slice(0, 7) + '-01', to };
  }
  const starts: Record<string, string> = {
    last7: daysBefore(today, 6),
    last30: daysBefore(today, 29),
    last90: daysBefore(today, 89),
    thisMonth: monthStart,
    thisQuarter: year + '-' + String(quarterStart).padStart(2, '0') + '-01',
    thisFiscalYear: (month < 7 ? year - 1 : year) + '-07-01',
  };
  return { period, from: starts[period] ?? today, to: today };
}
