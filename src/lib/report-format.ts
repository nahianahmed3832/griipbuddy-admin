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
