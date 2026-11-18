import * as XLSX from 'xlsx';
import { arr, obj, str, type RecordData } from './api';

type Cell = string | number;
const time = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Dhaka' });
const suffix: Record<string, string> = { money: 'BDT', count: '', percent: '%', cost: 'BDT', hours: 'hours', days: 'days' };

function label(record: RecordData) {
  const unit = suffix[str(record.type)];
  return str(record.label) + (unit ? ' (' + unit + ')' : '');
}

function cell(value: unknown, type: unknown): Cell {
  if (typeof value === 'string') return value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return type === 'percent' ? Math.round(value * 10_000) / 100 : value;
}

export function hybridSalesDownload(result: RecordData, format: 'csv' | 'xlsx') {
  const meta = obj(result.meta);
  const report = obj(result.report);
  const title = str(report.title);
  const from = str(meta.from);
  const to = str(meta.to);
  const asOf = Date.parse(str(meta.generated_at));
  const timezone = str(meta.timezone) || 'Asia/Dhaka';
  const groupBy = str(obj(result.params).groupBy);
  const groupOption = arr(obj(arr(result.filters).find(filter => obj(filter).key === 'groupBy')).options).map(obj).find(option => option.value === groupBy);
  const overview: Cell[][] = [
    ['Report', title], ['Period', from + ' to ' + to + ' (' + timezone + ')'],
    ['Date basis', str(report.dateBasis)], ['Region', 'BD (BDT)'], ['Locations', 'All'],
    ...(groupBy ? [['Group by', str(groupOption?.label) || groupBy]] : []),
    ...(Number.isFinite(asOf) ? [['Generated', time.format(asOf) + ' (' + timezone + ')']] : []),
    ...arr(result.quality).map(flag => ['Note', str(obj(flag).message)]),
  ];
  const metrics: Cell[][] = [['Metric', 'Value'], ...arr(result.kpis).map(kpi => {
    const metric = obj(kpi);
    return [label(metric), cell(metric.value, metric.type)];
  })];
  const table = arr(result.tables).map(obj).find(table => table.id === 'periods') ?? {};
  const columns = arr(table.columns).map(obj);
  const tableRows: Cell[][] = [columns.map(label),
    ...[...arr(table.rows).map(obj), ...(table.totals ? [obj(table.totals)] : [])]
      .map(row => columns.map(column => cell(row[str(column.key)], column.type)))];
  const filename = 'sales-summary_bd_' + from + (to !== from ? '_to_' + to : '') + '.' + format;
  const headers = { 'Cache-Control': 'private, no-store', 'Content-Disposition': 'attachment; filename="' + filename + '"' };
  if (format === 'csv') {
    const protect = (value: Cell) => typeof value === 'string' && /^[=+@\t\r-]/.test(value) ? "'" + value : value;
    const csv = (rows: Cell[][]) => XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows.map(row => row.map(protect))), { RS: '\r\n' });
    return new Response('\uFEFF' + [csv(overview), csv(metrics), csv([[title], ...tableRows])].join('\r\n\r\n') + '\r\n',
      { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } });
  }
  const book = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([...overview, [], ...metrics]);
  summary['!cols'] = [{ wch: 34 }, { wch: 72 }];
  const sheet = XLSX.utils.aoa_to_sheet(tableRows);
  columns.forEach((column, c) => {
    for (let r = 1; r < tableRows.length; r++) {
      const entry = sheet[XLSX.utils.encode_cell({ c, r })];
      if (entry?.t === 'n') entry.z = column.type === 'money' ? '#,##0.00' : '#,##0';
    }
  });
  XLSX.utils.book_append_sheet(book, summary, 'Summary');
  XLSX.utils.book_append_sheet(book, sheet, 'Sales summary');
  return new Response(XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }),
    { headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
}
