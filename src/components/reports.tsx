import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Boxes, ChartNoAxesCombined, CircleAlert,
  ChevronRight, FileText, Info, Minus, RefreshCw, ShoppingBag, TrendingDown, TrendingUp } from 'lucide-react';
import { api, ApiError, arr, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, reportFilterKeys, reportIds, reportQuery, type Query } from '@/lib/data';
import { periodRange } from '@/lib/overview';
import { adminPath } from '@/lib/paths';
import { productionReportValue, reportNumber, reportRange, reportTime, reportValue } from '@/lib/report-format';
import { has, type Region, type Staff } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { ComparisonField, CurrencyField, LocationField, PeriodFields } from './overview-filters';
import { ProductThumbnail } from './product-thumbnail';
import { Empty } from './tables';
import { TrendChart } from './trend-chart';
import { ProductionReportFilters } from './production-report-filters';
import { ProductionReportChart, type ReportPoint } from './production-report-chart';
import { productionReportPeriodRange } from '@/lib/production-report-period';
import { hybridOrderId } from '@/lib/hybrid-orders';
import { hybridReportLocations } from '@/lib/hybrid-orders';
import { canMergeHybridReport, reportWithHybrid } from '@/lib/hybrid-delivery-reports';
import { ReportDownloads } from './report-downloads';
import { OverviewMetricHelp } from './overview-metric-help';
import './production-reports.css';

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
const chartColors = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#0284c7'];
const formatPercentage = (value: number) => reportValue(value,'percent','BDT');

function recordLink(key: string, raw: unknown, auth: Session, region: Region, production?: boolean) {
  const parts = str(raw).split('/');
  const id = parts[3];
  if (parts.length !== 4 || parts[0] !== '' || parts[1] !== 'dashboard') return undefined;
  if ((key === 'order' || key === 'reference') && parts[2] === 'order-details' && hybridOrderId(id) &&
      has(auth.staff, 'order.view') && region === 'BD') {
    return url('/dashboard/order-details/' + id, { region });
  }
  if (!mongoId(id ?? '')) return undefined;
  if (key === 'order' && parts[2] === 'order-details' && has(auth.staff, 'order.view')) return url((production ? '/dashboard/order-details/' : '/desk/orders/orders/') + id, {region});
  if (key === 'product' && parts[2] === 'product-details' && has(auth.staff, 'product.view')) return url((production ? '/dashboard/product-details/' : '/desk/catalog/products/') + id, {region});
}

const reportDisplayValue = (value: unknown, type: unknown, currency: string, production?: boolean) =>
  production ? productionReportValue(value, type, currency) : reportValue(value, type, currency);
const reportCount = new Intl.NumberFormat('en-IN');

function ReportMetrics({ kpis, currency, production, showChange }: {
  kpis: RecordData[]; currency: string; production?: boolean; showChange: boolean;
}) {
  if (!kpis.length) return null;
  return <div className="report-metrics" data-count={kpis.length} style={{'--report-columns': kpis.length > 6 ? 4 : kpis.length} as React.CSSProperties}>
    {kpis.map(kpi => {
      const value = reportNumber(kpi.value);
      const previous = reportNumber(kpi.previous);
      const delta = previous && value !== null ? (value - previous) / Math.abs(previous) : null;
      const improved = delta !== null && (delta > 0) !== (kpi.invert === true);
      const stable = delta !== null && Math.abs(delta) < 0.0005;
      const DeltaIcon = stable ? Minus : (delta ?? 0) > 0 ? TrendingUp : TrendingDown;
      const showPrevious = previous !== null && (!production || showChange);
      const hasDelta = delta !== null && (production ? showPrevious && kpi.type !== 'percent' : delta !== 0);
      const label = str(kpi.label);
      const definition = str(kpi.definition);
      return <article className={'panel overview-card report-metric ' + tone(kpi.tone)} key={str(kpi.key)}>
        <div className="report-metric-heading"><h2>{label}</h2>
          {definition && (production ? <OverviewMetricHelp title={label} definition={definition}/> :
            <details className="report-definition"><summary aria-label={'About ' + label}><Info size={15}/></summary><p>{definition}</p></details>)}
        </div>
        <div className="overview-value"><strong>{reportDisplayValue(kpi.value, kpi.type, currency, production)}</strong>
          {hasDelta && <span className={'overview-delta ' + (production && stable ? 'neutral' : improved ? 'good' : 'bad')}
            aria-label={production && stable ? 'No change' : formatPercentage(Math.abs(delta)) + (delta > 0 ? ' higher' : ' lower')}>
            {production ? <DeltaIcon size={14} aria-hidden="true"/> : delta > 0 ? '↗' : '↘'}
            {reportDisplayValue(Math.abs(delta), 'percent', currency, production)}
          </span>}
        </div>
        {showPrevious && <p>Previous period{production ? ': ' : ' · '}{reportDisplayValue(previous, kpi.type, currency, production)}</p>}
        {str(kpi.estimated) && <span className="report-status report-tone-warning" title={str(kpi.estimated)}>Estimated</span>}
      </article>;
    })}
  </div>;
}

function ReportChart({ series, currency, production }: { series: RecordData; currency: string; production?: boolean }) {
  const lines = arr(series.lines).map(obj);
  const points = arr(series.points).map(obj);
  if (!lines.length || !points.length || (production && points.length < 2)) return null;
  if (production) {
    const seriesLines = lines.map((line, index) => ({ key: str(line.key), label: str(line.label), color: chartColors[index % chartColors.length] }));
    const seriesPoints = points.map(point => ({
      ...Object.fromEntries(seriesLines.map(line => [line.key, reportNumber(point[line.key])])),
      key: str(point.key),
    } satisfies ReportPoint));
    return <section className="panel report-panel report-trend">
      <ProductionReportChart points={seriesPoints} lines={seriesLines} unit={str(series.unit)} currency={currency}
        valueType={str(lines[0].type) || 'number'}/>
    </section>;
  }
  const tick = new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',timeZone:'UTC'});
  return <section className="panel report-panel report-trend">
    {!production && <h2>Sales trend</h2>}
    <TrendChart label="Booked value, delivered sales and net sales by period" showZero={production} lines={lines.map(line => str(line.label))}
      format={value => reportValue(value,'money',currency)}
      points={points.map(point => {
        const key = str(point.key);
        const label = str(point.period) || key;
        return {key,label,tick:key.length === 10 && Number.isFinite(Date.parse(key)) ? tick.format(new Date(key)) : label,
          values:lines.map(line => reportNumber(point[str(line.key)]))};
      })}/>
  </section>;
}

function ReportTable({ table, auth, region, currency, path, query, production }: {
  table: RecordData; auth: Session; region: Region; currency: string; path: string; query: Record<string,string | undefined>; production?: boolean;
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
    {(!production || str(table.title) || str(table.description)) && <div className="report-table-caption">
      {(!production || str(table.title)) && <h2>{name}</h2>}
      {str(table.description) && <p className="muted">{str(table.description)}</p>}
    </div>}
    {rows.length || production ? <div className="table-scroll report-table-scroll" tabIndex={0} role="region" aria-label={name + ' table'}>
      <table><thead><tr>{columns.map(col => {
        const key = str(col.key);
        const active = sort.key === key;
        const numeric = numericTypes.includes(str(col.type));
        const order = active ? sort.order === 'asc' ? 'desc' : 'asc' : production && numeric ? 'desc' : 'asc';
        const Icon = active ? sort.order === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown;
        return <th key={key} scope="col" className={numeric ? 'report-numeric' : undefined}
          aria-sort={active ? sort.order === 'asc' ? 'ascending' : 'descending' : undefined}>
          {col.sortable === true && table.sort && (!production || page !== null) ? <Link className="table-sort" href={url(path,{...query,sort:key,order,page:undefined})}
            aria-label={'Sort by ' + str(col.label) + ' ' + (order === 'asc' ? 'ascending' : 'descending')}>
            {str(col.label)}<Icon size={14} aria-hidden="true"/>
          </Link> : str(col.label)}
        </th>;
      })}</tr></thead><tbody>{rows.map((row,index) => <tr key={index}>{columns.map(col => {
        const key = str(col.key);
        const value = reportDisplayValue(row[key], col.type, currency, production);
        const href = recordLink(key,obj(row._links)[key],auth,region,production);
        const flag = (!production || value !== '—') ? tone(obj(row._tones)[key]) : '';
        const status = flag ? <span className={'report-status ' + flag}>{value}</span> : value;
        const content = href ? <Link className="table-link" href={href}>{status}</Link> : status;
        const cellClass = [
          numericTypes.includes(str(col.type)) ? 'report-numeric' : production || unbrokenColumns.includes(key) ? 'report-nowrap' : '',
          production && col.image === true ? 'report-image-cell' : production && col.type === 'text' && !unbrokenColumns.includes(key) ? 'report-text-cell' : '',
        ].filter(Boolean).join(' ');
        return <td key={key} className={cellClass} title={production && col.type === 'text' ? str(row[key]) : undefined}>
          {col.image === true ? <div className="overview-product"><ProductThumbnail source={row._image}/><span>{content}</span></div> : content}
        </td>;
      })}</tr>)}
        {production && !rows.length && <tr><td className="production-report-table-empty" colSpan={Math.max(1, columns.length)}>
          {str(table.emptyText) || 'No records in this view'}
        </td></tr>}
      </tbody>
      {totals && (!production || rows.length > 0) && <tfoot><tr>{columns.map((col, index) => {
        const key = str(col.key);
        const value = production && totals[key] === undefined ? '' : reportDisplayValue(totals[key], col.type, currency, production);
        return index === 0 ? <th key={key} scope="row">{value}</th>
          : <td key={key} className={numericTypes.includes(str(col.type)) ? 'report-numeric' : undefined}>{value}</td>;
      })}</tr></tfoot>}
      </table>
    </div> : <Empty detail={str(table.emptyText) || undefined}/>}
    {page !== null && (production ? total !== null && limit !== null && total > 0 : previous || next) && <div className="pagination">
      <span>{production && limit !== null && total !== null
        ? reportCount.format((page - 1) * limit + 1) + '–' + reportCount.format(Math.min(page * limit, total)) + ' of ' + reportCount.format(total) + (totals ? ' · totals cover every row' : '')
        : 'Page ' + page + ' · ' + total + ' records'}</span>
      {(previous || next) && <div>
        {previous ? <Link className="button secondary" href={url(path,{...query,page:String(page - 1)})}><ArrowLeft size={15}/> Previous</Link>
          : production && <button className="button secondary" disabled><ArrowLeft size={15}/> Previous</button>}
        {production && total !== null && limit !== null && <span>Page {reportCount.format(page)} of {reportCount.format(Math.ceil(total / limit))}</span>}
        {next ? <Link className="button secondary" href={url(path,{...query,page:String(page + 1)})}>Next <ArrowRight size={15}/></Link>
          : production && <button className="button secondary" disabled>Next <ArrowRight size={15}/></button>}
      </div>}
    </div>}
  </section>;
}

type ReportProps = {
  auth: Session; id?: string; q: Query; region: Region; production?: boolean;
};

export async function Reports(props: ReportProps) {
  if (!props.production) return ReportContent(props);
  return <Suspense key={JSON.stringify([props.region, props.id, props.q])} fallback={
    <div className="panel padded production-report-loading" role="status" aria-busy="true">
      <RefreshCw size={18} aria-hidden="true"/>{props.id ? 'Loading report…' : 'Loading reports…'}
    </div>
  }><ProductionReportContent {...props}/></Suspense>;
}

async function ProductionReportContent(props: ReportProps) {
  try {
    return await ReportContent(props);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 404) notFound();
    if (error.status === 401 || error.status === 403) return <Empty title="Access restricted" detail="Your account does not have access to this report."/>;
    const path = '/dashboard/reports' + (props.id ? '/' + props.id : '');
    if (error.status === 400) return <section className="panel padded stack-form" role="alert">
      <p>These report filters could not be applied.</p>
      <Link className="button secondary" href={url(path, { region: props.region })}>Reset filters</Link>
    </section>;
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(props.q)) {
      for (const entry of Array.isArray(value) ? value : [value]) if (entry !== undefined) query.append(name, entry);
    }
    query.set('region', props.region);
    query.set('refresh', '1');
    query.set('attempt', String(Date.now()));
    return <section className="panel padded stack-form" role="alert">
      <p>{props.id ? 'Could not load this report.' : 'Could not load reports.'}</p>
      <Link className="button secondary" href={path + '?' + query}>Retry</Link>
    </section>;
  }
}

async function ReportContent({ auth, id, q, region, production = false }: ReportProps) {
  const reportBase = production ? '/dashboard/reports' : '/desk/reports';
  if (!id) {
    const definitions = arr(await api(url('/analytics/reports', {region}),auth.token)).map(obj).filter(report => reportIds.includes(str(report.id)));
    if (production) return <div className="production-report-center">
      <header><h1>Reports</h1><p>{region === 'BD' ? 'Bangladesh' : 'International'} · Every report can be filtered, sorted and exported to CSV or Excel. Dates are {region === 'BD' ? 'Bangladesh time' : 'UTC'}.</p></header>
      {Object.entries(domains).map(([key, domain]) => {
        const available = definitions.filter(report => report.domain === key);
        if (!available.length) return null;
        return <section className={'production-report-category overview-' + domain.color} key={key}>
          <h2><span className="overview-block-icon"><domain.icon size={18}/></span>{domain.name}<small>({available.length})</small></h2>
          <div className="production-report-cards">{available.map(report => <Link
            className="panel report-card" key={str(report.id)} href={url(reportBase + '/' + str(report.id), { region })}>
            <div className="production-report-card-description"><h3>{str(report.title)}</h3><p>{str(report.description)}</p></div>
            <div className="production-report-card-footer"><p>{str(report.dateBasis)}</p><span>Open <ChevronRight size={16}/></span></div>
          </Link>)}</div>
        </section>;
      })}
      {(has(auth.staff, 'stock.view') || (region === 'BD' && has(auth.staff, 'expense.view'))) &&
        <section className="production-report-other"><h2>Other reports</h2><div className="page-actions">
          {has(auth.staff, 'stock.view') && <Link className="button secondary" href={url('/dashboard/check-outlet-stocks', {region})}>Stocks report by location</Link>}
          {region === 'BD' && has(auth.staff, 'expense.view') && <Link className="button secondary" href="/dashboard/expense-report">Expense report</Link>}
        </div></section>}
      {!definitions.length && <Empty title="No report permissions" detail="Ask a workspace administrator for access to a specific report."/>}
    </div>;
    return <>
      <PageHeading eyebrow="OPERATIONS / ANALYTICS" title="Reports" description="Review sales, fulfilment and inventory reports."/>
      {Object.entries(domains).map(([key, domain]) => {
        const reports = definitions.filter(entry => entry.domain === key);
        if (!reports.length) return null;
        return <section className="stack-form" key={key} aria-label={domain.name}>
          <h2>{domain.name}</h2>
          <div className="report-grid">{reports.map(report =>
            <Link className={'panel report-card overview-' + domain.color} key={str(report.id)} href={url('/desk/reports/' + str(report.id),{region})}>
              <span className="overview-block-icon"><domain.icon size={20}/></span>
              <h3>{str(report.title)}</h3><p>{str(report.description)}</p><span className="card-cta">Open report <ArrowRight size={15}/></span>
            </Link>)}</div>
        </section>;
      })}
      {(has(auth.staff, 'stock.view') || (region === 'BD' && has(auth.staff, 'expense.view'))) && <section className="panel padded stack-form">
        <h2>Other reports</h2><div className="page-actions">
          {has(auth.staff, 'stock.view') && <Link className="button secondary" href={url('/desk/inventory/stock', {region})}>Stocks report by location</Link>}
          {region === 'BD' && has(auth.staff, 'expense.view') && <Link className="button secondary" href="/desk/payments/expense-report">Expense report</Link>}
        </div>
      </section>}
      {!definitions.length && <Empty title="No report permissions" detail="Ask a workspace administrator for access to a specific report."/>}
    </>;
  }
  if (!reportIds.includes(id)) throw new ApiError(404);
  const path = reportBase + '/' + id;
  const { period, from, to } = production ? productionReportPeriodRange(q) : periodRange(q, id === 'sales-summary' ? '30' : 'today');
  const scope = { ...reportQuery({...q,from,to},region), ...(production && param(q, 'order') === 'desc' && { order: 'desc' }) };
  const page = param(q,'page');
  const limit = production ? param(q,'limit') : undefined;
  const refresh = param(q,'refresh') === '1' ? '1' : undefined;
  const hybridMerge = canMergeHybridReport(id, auth, region) ? '1' : undefined;
  if (hybridMerge) scope.locations = hybridReportLocations(auth, scope.locations);
  const native = obj(await api(url('/analytics/reports/' + id,{...scope,page,limit,refresh,hybridMerge}),auth.token));
  const data = hybridMerge ? await reportWithHybrid(id, native, auth, region, scope.locations) : native;
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
  const context = [region === 'BD' ? 'Bangladesh' : 'International',currency,production && !dates ? '' : window,
    previous && (production ? 'compared with ' : 'Compared with ') + previous,basis].filter(Boolean).join(' · ');

  const filterInputs = <>
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
  </>;
  const filterKey = JSON.stringify([period, query]);
  const tableEntries = arr(data.tables).map(obj);
  const restricted = arr(data.restricted).map(str);
  const restrictedText = restricted.includes('cost') && restricted.includes('profit')
    ? 'Purchase price and profit figures are hidden for your role.'
    : restricted.includes('cost') ? 'Purchase price figures are hidden for your role.' : 'Profit and margin figures are hidden for your role.';
  const quality = arr(data.quality).map(obj);
  return <div className={'report-workspace overview-' + domain.color + (production ? ' production-report-page' : '')}>
    <header className="report-header">
      <div className="report-header-copy">
      <Link className="table-link report-back" href={url(reportBase,{region})}><ArrowLeft size={production ? 14 : 16}/> All reports</Link>
      <div className="report-title"><span className="overview-block-icon"><domain.icon size={production ? 20 : 22}/></span>
        <div><span className="report-domain">{domain.name}</span><h1>{str(report.title)}</h1></div>
      </div>
      <p className="report-description">{str(report.description)}</p>
      <p className="muted">{context}</p>
      </div>
      <div className="page-actions report-actions">
        {asOf && <time className="muted" dateTime={generatedAt}>Data as of {asOf}{!production && ' Dhaka'}</time>}
        <a className="button secondary" href={adminPath(url(path,{...query,page,limit,period:dates ? period : undefined,refresh:'1'}))}><RefreshCw size={15}/> Refresh</a>
        {production ? <ReportDownloads csv={adminPath(url('/api/download',{...query,id,format:'csv'}))}
          xlsx={adminPath(url('/api/download',{...query,id,format:'xlsx'}))}/> : <>
          <a className="button secondary" href={adminPath(url('/api/download',{...query,id,format:'csv'}))}><ArrowDownToLine size={16}/> CSV</a>
          <a className="button secondary" href={adminPath(url('/api/download',{...query,id,format:'xlsx'}))}><ArrowDownToLine size={16}/> Excel</a>
        </>}
      </div>
    </header>
    {production ? <ProductionReportFilters path={path} region={region} period={period} from={from} to={to}
      usesPeriod={dates} usesLocations={report.usesLocations === true} locations={locations} selectedLocations={scope.locations?.split(',') ?? []}
      compares={report.compares === true} compare={scope.compare !== 'none'} currency={currency}
      values={Object.fromEntries(filters.map(filter => [str(filter.key), param(q, str(filter.key)) ?? str(params[str(filter.key)])]))}
      filters={filters.map(filter => ({ key: str(filter.key), label: str(filter.label), type: str(filter.type),
        options: arr(filter.options).map(obj).map(option => ({ value: str(option.value), label: str(option.label) })),
        fallback: str(filter.default),
      }))}/> : (dates || filters.length > 0 || locations.length > 0 || region === 'INTERNATIONAL') &&
      <form key={filterKey} action={adminPath(path)} className="panel overview-filters report-filters">
        {filterInputs}
        <div className="page-actions"><button className="button primary">Apply filters</button>
          <Link className="button subtle" href={url(path,{region})}>Reset</Link></div>
      </form>}
    {!production && restricted.length > 0 && <p className="notice">Some cost or margin figures are hidden by your permissions.</p>}
    <ReportMetrics kpis={arr(data.kpis).map(obj)} currency={currency} production={production} showChange={Boolean(meta.compare)}/>
    <ReportChart series={obj(data.series)} currency={currency} production={production}/>
    {tableEntries.map(table => <ReportTable key={str(table.id)} table={table} auth={auth} region={region}
      currency={currency} path={path} query={{...query,limit,period:dates ? period : undefined}} production={production}/>)}
    {production && restricted.length > 0 && <p className="production-report-restricted"><Info size={14}/>{restrictedText}</p>}
    {production && quality.length > 0 && <div className="production-report-quality">{quality.map((flag, index) =>
      <p key={str(flag.code) || index}><CircleAlert size={14}/><span>{str(flag.message)}
        {Number(flag.total) > 0 && <> ({reportCount.format(Number(flag.affected))} of {reportCount.format(Number(flag.total))})</>}</span></p>
    )}</div>}
    {!production && quality.map((flag,index) => <div className="notice warn" key={index}><CircleAlert size={17}/>
      <p>{str(flag.message)}{reportNumber(flag.affected) !== null && reportNumber(flag.total) !== null &&
        <> ({String(flag.affected)} of {String(flag.total)})</>}</p></div>)}
  </div>;
}
