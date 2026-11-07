import Link from 'next/link';
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Boxes, ChartNoAxesCombined, CircleAlert,
  FileText, Info, RefreshCw, ShoppingBag } from 'lucide-react';
import { api, ApiError, arr, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, reportFilterKeys, reportIds, reportQuery, type Query } from '@/lib/data';
import { periodRange } from '@/lib/overview';
import { adminPath } from '@/lib/paths';
import { reportNumber, reportRange, reportTime, reportValue } from '@/lib/report-format';
import { has, type Region, type Staff } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { ComparisonField, CurrencyField, LocationField, PeriodFields } from './overview-filters';
import { ProductThumbnail } from './product-thumbnail';
import { Empty } from './tables';
import { TrendChart } from './trend-chart';

const shortcuts = [
  ['sales-summary', 'Sales Summary', 'sales_summary'],
  ['pending-fulfilment', 'Orders Needing Action', 'pending_fulfilment'],
  ['stock-valuation', 'Stock Valuation', 'stock_valuation'],
  ['low-stock', 'Low Stock & Reorder', 'low_stock'],
] as const;

export function reportShortcuts(staff: Staff, region: Region) {
  return shortcuts.filter(([, , permission]) => has(staff,'report.' + permission + '.view')).map(([id,label]) => ({
    id, label, href:url('/desk/reports/' + id,{region}),
  }));
}

const domains = {
  sales: { name:'Sales', color:'sales', icon:ChartNoAxesCombined },
  orders: { name:'Orders and fulfilment', color:'fulfilment', icon:ShoppingBag },
  inventory: { name:'Inventory', color:'inventory', icon:Boxes },
};
const reportDomain = (domain: unknown) => domains[str(domain) as keyof typeof domains] ?? {name:'Operations',color:'money',icon:FileText};
const tone = (value: unknown) => ['success','warning','danger','info','violet'].includes(str(value)) ? 'report-tone-' + value : '';
const numericTypes = ['number','count','money','currency','cost','percent','days','hours'];
const unbrokenColumns = ['period','placedAt','phone','sku','order','status'];
const formatPercentage = (value: number) => reportValue(value,'percent','BDT');

function recordLink(key: string, raw: unknown, auth: Session, region: Region) {
  const parts = str(raw).split('/');
  const id = parts[3];
  if (parts.length !== 4 || parts[0] !== '' || parts[1] !== 'dashboard' || !mongoId(id ?? '')) return undefined;
  if (key === 'order' && parts[2] === 'order-details' && has(auth.staff, 'order.view')) return url('/desk/orders/orders/' + id, {region});
  if (key === 'product' && parts[2] === 'product-details' && has(auth.staff, 'product.view')) return url('/desk/catalog/products/' + id, {region});
}

function ReportMetrics({ kpis, currency }: { kpis: RecordData[]; currency: string }) {
  if (!kpis.length) return null;
  return <div className="report-metrics" style={{'--report-columns': kpis.length > 6 ? 4 : kpis.length} as React.CSSProperties}>
    {kpis.map(kpi => {
      const value = reportNumber(kpi.value);
      const previous = reportNumber(kpi.previous);
      const delta = previous && value !== null ? (value - previous) / Math.abs(previous) : 0;
      const improved = (delta < 0) === (kpi.invert === true);
      const label = str(kpi.label);
      return <article className={'panel overview-card report-metric ' + tone(kpi.tone)} key={str(kpi.key)}>
        <div className="report-metric-heading"><h2>{label}</h2>
          {str(kpi.definition) && <details className="report-definition">
            <summary aria-label={'About ' + label}><Info size={15}/></summary><p>{str(kpi.definition)}</p>
          </details>}
        </div>
        <div className="overview-value"><strong>{reportValue(kpi.value,kpi.type,currency)}</strong>
          {delta !== 0 && <span className={'overview-delta ' + (improved ? 'good' : 'bad')}
            aria-label={formatPercentage(Math.abs(delta)) + (delta > 0 ? ' higher' : ' lower')}>
            {delta > 0 ? '↗' : '↘'} {formatPercentage(Math.abs(delta))}
          </span>}
        </div>
        {previous !== null && <p>Previous period · {reportValue(previous,kpi.type,currency)}</p>}
        {str(kpi.estimated) && <span className="report-status report-tone-warning" title={str(kpi.estimated)}>Estimated</span>}
      </article>;
    })}
  </div>;
}

function ReportChart({ series, currency }: { series: RecordData; currency: string }) {
  const lines = arr(series.lines).map(obj);
  const points = arr(series.points).map(obj);
  if (!lines.length || !points.length) return null;
  const tick = new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',timeZone:'UTC'});
  return <section className="panel report-panel report-trend">
    <h2>Sales trend</h2>
    <TrendChart label="Booked value, delivered sales and net sales by period" lines={lines.map(line => str(line.label))}
      format={value => reportValue(value,'money',currency)}
      points={points.map(point => {
        const key = str(point.key);
        const label = str(point.period) || key;
        return {key,label,tick:key.length === 10 && Number.isFinite(Date.parse(key)) ? tick.format(new Date(key)) : label,
          values:lines.map(line => reportNumber(point[str(line.key)]))};
      })}/>
  </section>;
}

function ReportTable({ table, auth, region, currency, path, query }: {
  table: RecordData; auth: Session; region: Region; currency: string; path: string; query: Record<string,string | undefined>;
}) {
  const columns = arr(table.columns).map(obj);
  const rows = arr(table.rows).map(obj);
  const totals = table.totals ? obj(table.totals) : null;
  const pagination = obj(table.pagination);
  const page = reportNumber(pagination.page);
  const limit = reportNumber(pagination.limit);
  const total = reportNumber(pagination.total);
  const sort = obj(table.sort);
  const name = str(table.title) || (table.id === 'periods' ? 'Sales by period' : str(table.id).replaceAll('-', ' ').replace(/^./,char => char.toUpperCase()));
  const previous = page !== null && page > 1;
  const next = page !== null && limit !== null && total !== null && page * limit < total;
  return <section className="panel report-panel" aria-label={name}>
    <div className="report-table-caption"><h2>{name}</h2>{str(table.description) && <p className="muted">{str(table.description)}</p>}</div>
    {rows.length ? <div className="table-scroll report-table-scroll" tabIndex={0} role="region" aria-label={name + ' table'}>
      <table><thead><tr>{columns.map(col => {
        const key = str(col.key);
        const active = sort.key === key;
        const order = active && sort.order === 'asc' ? 'desc' : 'asc';
        const Icon = active ? sort.order === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown;
        const numeric = numericTypes.includes(str(col.type));
        return <th key={key} scope="col" className={numeric ? 'report-numeric' : undefined}
          aria-sort={active ? sort.order === 'asc' ? 'ascending' : 'descending' : undefined}>
          {col.sortable === true && table.sort ? <Link className="table-sort" href={url(path,{...query,sort:key,order,page:undefined})}
            aria-label={'Sort by ' + str(col.label) + ' ' + (order === 'asc' ? 'ascending' : 'descending')}>
            {str(col.label)}<Icon size={14} aria-hidden="true"/>
          </Link> : str(col.label)}
        </th>;
      })}</tr></thead><tbody>{rows.map((row,index) => <tr key={index}>{columns.map(col => {
        const key = str(col.key);
        const value = reportValue(row[key],col.type,currency);
        const href = recordLink(key,obj(row._links)[key],auth,region);
        const flag = tone(obj(row._tones)[key]);
        const content = href ? <Link className="table-link" href={href}>{value}</Link> : value;
        const cellClass = numericTypes.includes(str(col.type)) ? 'report-numeric' : unbrokenColumns.includes(key) ? 'report-nowrap' : undefined;
        return <td key={key} className={cellClass}>
          {col.image === true ? <div className="overview-product"><ProductThumbnail source={row._image}/>{content}</div>
            : flag ? <span className={'report-status ' + flag}>{content}</span> : content}
        </td>;
      })}</tr>)}</tbody>
      {totals && <tfoot><tr>{columns.map((col,index) => index === 0
        ? <th key={str(col.key)} scope="row">{reportValue(totals[str(col.key)],col.type,currency)}</th>
        : <td key={str(col.key)} className={numericTypes.includes(str(col.type)) ? 'report-numeric' : undefined}>
          {reportValue(totals[str(col.key)],col.type,currency)}</td>)}</tr></tfoot>}
      </table>
    </div> : <Empty detail={str(table.emptyText) || undefined}/>}
    {page !== null && (previous || next) && <div className="pagination">
      <span>Page {page} · {total} records</span><div>
        {previous && <Link className="button secondary" href={url(path,{...query,page:String(page - 1)})}><ArrowLeft size={15}/> Previous</Link>}
        {next && <Link className="button secondary" href={url(path,{...query,page:String(page + 1)})}>Next <ArrowRight size={15}/></Link>}
      </div>
    </div>}
  </section>;
}

export async function Reports({ auth, id, q, region }: { auth: Session; id?: string; q: Query; region: Region }) {
  if (!id) {
    const definitions = arr(await api(url('/analytics/reports', {region}),auth.token)).map(obj).filter(report => reportIds.includes(str(report.id)));
    return <>
      <PageHeading eyebrow="OPERATIONS / ANALYTICS" title="Reports" description="Review sales, fulfilment and inventory reports."/>
      <div className="report-grid">{definitions.map(report => {
        const domain = reportDomain(report.domain);
        return <Link className={'panel report-card overview-' + domain.color} key={str(report.id)} href={url('/desk/reports/' + str(report.id),{region})}>
          <span className="overview-block-icon"><domain.icon size={20}/></span><span className="eyebrow">{domain.name}</span>
          <h2>{str(report.title)}</h2><p>{str(report.description)}</p><span className="card-cta">Open report <ArrowRight size={15}/></span>
        </Link>;
      })}</div>
      {!definitions.length && <Empty title="No report permissions" detail="Ask a workspace administrator for access to a specific report."/>}
    </>;
  }
  if (!reportIds.includes(id)) throw new ApiError(404);
  const path = '/desk/reports/' + id;
  const { period, from, to } = periodRange(q,id === 'sales-summary' ? '30' : 'today');
  const scope = reportQuery({...q,from,to},region);
  const page = param(q,'page');
  const refresh = param(q,'refresh') === '1' ? '1' : undefined;
  const data = obj(await api(url('/analytics/reports/' + id,{...scope,page,refresh}),auth.token));
  const report = obj(data.report);
  const meta = obj(data.meta);
  const domain = reportDomain(report.domain);
  const currency = str(meta.currency) || (region === 'BD' ? 'BDT' : 'USD');
  const params = obj(data.params);
  const filters = arr(data.filters).map(obj).filter(filter => reportFilterKeys.includes(str(filter.key)));
  const locations = report.usesLocations === true && has(auth.staff,'business_locations.view')
    ? await loadLocations(auth,region).catch(() => []) : [];
  const dates = report.usesPeriod === true;
  const query = {...scope, ...Object.fromEntries(filters.map(filter => {
    const key = str(filter.key);
    return [key, str(params[key]) || undefined];
  })), from:dates ? str(meta.from) || from : undefined, to:dates ? str(meta.to) || to : undefined};
  const generatedAt = str(meta.generated_at);
  const asOf = reportTime(generatedAt);
  const previous = reportRange(obj(meta.compare).from,obj(meta.compare).to);
  const basis = str(report.dateBasis);
  const window = reportRange(meta.from,meta.to) || (basis.startsWith('Right now') ? '' : 'Right now');
  const context = [region === 'BD' ? 'Bangladesh' : 'International',currency,window,
    previous && 'Compared with ' + previous,basis].filter(Boolean).join(' · ');

  return <div className={'report-workspace overview-' + domain.color}>
    <header className="report-header">
      <Link className="table-link report-back" href={url('/desk/reports',{region})}><ArrowLeft size={16}/> All reports</Link>
      <div className="report-title"><span className="overview-block-icon"><domain.icon size={22}/></span>
        <div><span className="report-domain">{domain.name}</span><h1>{str(report.title)}</h1></div>
      </div>
      <p className="report-description">{str(report.description)}</p>
      <p className="muted">{context}</p>
      <div className="page-actions report-actions">
        {asOf && <time className="muted" dateTime={generatedAt}>Data as of {asOf} Dhaka</time>}
        <a className="button secondary" href={adminPath(url(path,{...query,page,period:dates ? period : undefined,refresh:'1'}))}><RefreshCw size={15}/> Refresh</a>
        <a className="button secondary" href={adminPath(url('/api/download',{...query,id,format:'csv'}))}><ArrowDownToLine size={16}/> CSV</a>
        <a className="button secondary" href={adminPath(url('/api/download',{...query,id,format:'xlsx'}))}><ArrowDownToLine size={16}/> Excel</a>
      </div>
    </header>
    {(dates || filters.length > 0 || locations.length > 0 || region === 'INTERNATIONAL') &&
      <form key={JSON.stringify([period,query])} action={adminPath(path)} className="panel overview-filters report-filters">
        <input type="hidden" name="region" value={region}/>
        {scope.sort && <input type="hidden" name="sort" value={scope.sort}/>}
        {scope.order && <input type="hidden" name="order" value={scope.order}/>}
        {dates && <PeriodFields period={period} from={query.from} to={query.to}/>}
        <LocationField selected={scope.locations?.split(',') ?? []} locations={locations}/>
        <CurrencyField region={region} currency={currency}/>
        {filters.map(filter => {
          const key = str(filter.key);
          const value = str(params[key]);
          return <label key={key}>{str(filter.label)}{filter.type === 'search'
            ? <input type="search" name={key} maxLength={100} placeholder="Type to search" defaultValue={value}/>
            : <select name={key} defaultValue={value}>{arr(filter.options).map(obj).map(option =>
              <option key={str(option.value)} value={str(option.value)}>{str(option.label)}</option>)}</select>}</label>;
        })}
        {report.compares === true && <ComparisonField compare={scope.compare !== 'none'}/>}
        <div className="page-actions"><button className="button primary">Apply filters</button>
          <Link className="button subtle" href={url(path,{region})}>Reset</Link></div>
      </form>}
    {arr(data.restricted).length > 0 && <p className="notice">Some cost or margin figures are hidden by your permissions.</p>}
    <ReportMetrics kpis={arr(data.kpis).map(obj)} currency={currency}/>
    <ReportChart series={obj(data.series)} currency={currency}/>
    {arr(data.tables).map(obj).map(table => <ReportTable key={str(table.id)} table={table} auth={auth} region={region}
      currency={currency} path={path} query={{...query,period:dates ? period : undefined}}/>)}
    {arr(data.quality).map(obj).map((flag,index) => <div className="notice warn" key={index}><CircleAlert size={17}/>
      <p>{str(flag.message)}{reportNumber(flag.affected) !== null && reportNumber(flag.total) !== null &&
        <> ({String(flag.affected)} of {String(flag.total)})</>}</p></div>)}
  </div>;
}
