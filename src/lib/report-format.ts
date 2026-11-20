export const reportNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

const dhakaDate = new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Dhaka'});
const dhakaDateTime = new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dhaka'});
const dhakaTime = new Intl.DateTimeFormat('en-GB', {timeStyle:'short',timeZone:'Asia/Dhaka'});
const percentage = new Intl.NumberFormat('en', {style:'percent',maximumFractionDigits:1});

export function reportTime(value: string) {
  return Number.isFinite(Date.parse(value)) ? dhakaTime.format(new Date(value)) : '';
}

export function reportValue(value: unknown, type: unknown, currency: string): string {
  const numeric = reportNumber(value);
  if (numeric !== null) {
    if (type === 'percent') return percentage.format(numeric);
    if (type === 'hours') return numeric >= 24 ? (numeric / 24).toFixed(1) + ' d' : numeric.toFixed(1) + ' h';
    if (type === 'days') return numeric.toFixed(1) + ' d';
    if (type === 'money' || type === 'cost' || type === 'currency') {
      return new Intl.NumberFormat(currency === 'BDT' || type === 'cost' ? 'en-IN' : 'en', {
        style:'currency', currency:type === 'cost' ? 'BDT' : currency, currencyDisplay:'narrowSymbol', minimumFractionDigits:0, maximumFractionDigits:2,
      }).format(numeric);
    }
    return numeric.toLocaleString(currency === 'BDT' ? 'en-IN' : 'en', {maximumFractionDigits:2});
  }
  if (typeof value !== 'string' || !value) return '—';
  if ((type === 'date' || type === 'datetime') && Number.isFinite(Date.parse(value))) {
    return (type === 'date' ? dhakaDate : dhakaDateTime).format(new Date(value));
  }
  return value;
}

export function reportRange(from: unknown, to: unknown) {
  if (typeof from !== 'string' || !from) return '';
  const start = reportValue(from,'date','BDT');
  return from === to || typeof to !== 'string' ? start : start + ' – ' + reportValue(to,'date','BDT');
}

const productionCurrencySymbols: Record<string, string> = { BDT: '৳', USD: '$', EUR: '€', AUD: 'A$' };
const productionCount = new Intl.NumberFormat('en-IN');
const productionNumber = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function productionReportValue(value: unknown, type: unknown, currency: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'text' || typeof type !== 'string') return String(value);
  if (type === 'date' || type === 'datetime') return reportValue(value, type, currency);
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) return '—';
  if (type === 'money' || type === 'cost' || type === 'currency') {
    const code = type === 'cost' ? 'BDT' : currency;
    const formatted = Math.abs(Math.round(number)).toLocaleString(code === 'BDT' ? 'en-IN' : 'en-US');
    return (Math.round(number) < 0 ? '-' : '') + (productionCurrencySymbols[code] ?? code + ' ') + formatted;
  }
  if (type === 'percent') return (number * 100).toFixed(1) + '%';
  if (type === 'hours') return number < 48 ? Math.round(number) + ' h' : (number / 24).toFixed(1) + ' d';
  if (type === 'days') return (Number.isInteger(number) ? productionCount.format(number) : number.toFixed(1)) + ' d';
  if (type === 'count') return productionCount.format(number);
  if (type === 'number') return productionNumber.format(number);
  return String(value);
}
