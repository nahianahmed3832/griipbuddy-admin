import * as XLSX from 'xlsx';
import { arr, obj, str, type RecordData } from './api';

type Cell = string | number;
const time = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Dhaka' });
const day = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Dhaka' });
const suffix: Record<string, string> = { money: 'BDT', count: '', percent: '%', cost: 'BDT', hours: 'hours', days: 'days' };
const numberFormats: Record<string, string> = { money: '#,##0.00', cost: '#,##0.00', count: '#,##0', percent: '0.00', hours: '0.0', days: '0.0' };

function label(record: RecordData) {
  const unit = suffix[str(record.type)];
  return str(record.label) + (unit ? ' (' + unit + ')' : '');
}

function cell(value: unknown, type: unknown): Cell {
  if (typeof value === 'string') {
    const at = ['date', 'datetime'].includes(str(type)) ? Date.parse(value) : NaN;
    return Number.isFinite(at) ? (type === 'date' ? day : time).format(at) : value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (type === 'percent') return Math.round(value * 10_000) / 100;
  if (type === 'hours' || type === 'days') return Math.round(value * 10) / 10;
  return type === 'money' || type === 'cost' ? Math.round(value * 100) / 100 : value;
}

export function hybridReportDownload(reportId: string, result: RecordData, format: 'csv' | 'xlsx') {
  const meta = obj(result.meta);
  const report = obj(result.report);
  const title = str(report.title);
  const from = str(meta.from);
  const to = str(meta.to);
  const asOf = Date.parse(str(meta.generated_at));
  const timezone = str(meta.timezone) || 'Asia/Dhaka';
  const params = obj(result.params);
  const filters = arr(result.filters).map(obj).flatMap(filter => {
    const value = str(params[str(filter.key)]);
    const option = arr(filter.options).map(obj).find(option => option.value === value);
    return value ? [[str(filter.label), str(option?.label) || value]] : [];
  });
  const overview: Cell[][] = [
    ['Report', title], ...(from && to ? [['Period', from + ' to ' + to + ' (' + timezone + ')']] : []),
    ['Date basis', str(report.dateBasis)], ['Region', 'BD (BDT)'],
    ...(report.usesLocations ? [['Locations', 'All']] : []), ...filters,
    ...(Number.isFinite(asOf) ? [['Generated', time.format(asOf) + ' (' + timezone + ')']] : []),
    ...arr(result.quality).map(flag => ['Note', str(obj(flag).message)]),
  ];
  const metrics: Cell[][] = [['Metric', 'Value'], ...arr(result.kpis).map(kpi => {
    const metric = obj(kpi);
    return [label(metric), cell(metric.value, metric.type)];
  })];
  const tables = arr(result.tables).map(obj).map(table => {
    const columns = arr(table.columns).map(obj);
    const rows: Cell[][] = [columns.map(label),
      ...[...arr(table.rows).map(obj), ...(table.totals ? [obj(table.totals)] : [])]
        .map(row => columns.map(column => cell(row[str(column.key)], column.type)))];
    return { title: str(table.title) || title, columns, rows };
  });
  const dateSuffix = /^(\d{4}-\d{2}-\d{2})$/.test(from) && /^(\d{4}-\d{2}-\d{2})$/.test(to)
    ? '_' + from + (to === from ? '' : '_to_' + to) : '_' + day.format(Date.now());
  const filename = reportId + '_bd' + dateSuffix + '.' + format;
  const headers = { 'Cache-Control': 'private, no-store', 'Content-Disposition': 'attachment; filename="' + filename + '"' };
  if (format === 'csv') {
    const protect = (value: Cell) => typeof value === 'string' && /^[=+@\t\r-]/.test(value) ? "'" + value : value;
    const csv = (rows: Cell[][]) => XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows.map(row => row.map(protect))), { RS: '\r\n' });
    return new Response('\uFEFF' + [csv(overview), csv(metrics), ...tables.map(table => csv([[table.title], ...table.rows]))].join('\r\n\r\n') + '\r\n',
      { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } });
  }
  const book = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([...overview, [], ...metrics]);
  summary['!cols'] = [{ wch: 34 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(book, summary, 'Summary');
  tables.forEach(({ title, columns, rows }) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    columns.forEach((column, c) => {
      for (let r = 1; r < rows.length; r++) {
        const entry = sheet[XLSX.utils.encode_cell({ c, r })];
        if (entry?.t === 'n' && numberFormats[str(column.type)]) entry.z = numberFormats[str(column.type)];
      }
    });
    const name = title.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 27).trim() || 'Data';
    let unique = name;
    for (let index = 2; book.SheetNames.some(sheet => sheet.toLowerCase() === unique.toLowerCase()); index++) unique = name + ' ' + index;
    XLSX.utils.book_append_sheet(book, sheet, unique);
  });
  return new Response(XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }),
    { headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
}
