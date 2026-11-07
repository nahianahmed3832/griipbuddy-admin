import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, ChartNoAxesCombined, FileText } from 'lucide-react';
import { api, ApiError, arr, obj, str, url, type Session } from '@/lib/api';
import { param, printable, reportFilterKeys, reportIds, reportQuery, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { Empty, Table } from './tables';

export async function Reports({ auth, id, q, region }: { auth: Session; id?: string; q: Query; region: Region }) {
  const scope = reportQuery(q,region);
  if (!id) {
    const definitions = arr(await api(url('/analytics/reports', { region }),auth.token)).map(obj);
    return <>
      <PageHeading eyebrow="OPERATIONS / ANALYTICS" title="Reports" description="Review official sales, fulfilment and inventory reports for your permissions."/>
      <div className="report-grid">{definitions.filter(report => reportIds.includes(str(report.id))).map(report =>
        <Link className="panel report-card" key={str(report.id)} href={url('/desk/reports/'+str(report.id), {region})}>
          <span className="tile-icon purple"><FileText size={19}/></span><span className="eyebrow">{str(report.domain)}</span>
          <h2>{str(report.title)}</h2><p>{str(report.description)}</p><span className="card-cta">Open report <ArrowRight size={15}/></span>
        </Link>)}</div>
      {!definitions.length && <Empty title="No report permissions" detail="Ask a workspace administrator for access to a specific report."/>}
    </>;
  }
  if (!reportIds.includes(id)) throw new ApiError(404);
  const path = '/desk/reports/' + id;
  const page = Math.min(1000000, Math.max(1, Number.parseInt(param(q,'page') ?? '', 10) || 1));
  const data = obj(await api(url('/analytics/reports/'+id, { ...scope, page: String(page) }),auth.token));
  const report = obj(data.report);
  const meta = obj(data.meta);
  const currency = str(meta.currency) || 'BDT';
  const filters = arr(data.filters).map(obj).filter(filter => reportFilterKeys.includes(str(filter.key)));
  const quality = arr(data.quality).map(obj).map(flag => str(flag.message)).filter(Boolean);
  const period = report.usesPeriod === true;
  return <>
    <PageHeading eyebrow="REPORTS / DETAIL" title={str(report.title) || 'Report'} description={str(report.description)}>
      <a className="button secondary" href={adminPath(url('/api/download',{...scope,id,format:'csv'}))}><ArrowDownToLine size={16}/> CSV</a>
      <a className="button primary" href={adminPath(url('/api/download',{...scope,id,format:'xlsx'}))}><ArrowDownToLine size={16}/> Excel</a>
    </PageHeading>
    {(period || filters.length > 0) && <form action={adminPath(path)} className="panel filters">
      <input type="hidden" name="region" value={region}/>
      {scope.locations && <input type="hidden" name="locations" value={scope.locations}/>}
      {period && <><label className="filter-label">From<input type="date" name="from" defaultValue={scope.from}/></label>
        <label className="filter-label">To<input type="date" name="to" defaultValue={scope.to}/></label></>}
      {report.compares === true && <label className="filter-label">Compare<select name="compare" defaultValue={scope.compare ?? ''}>
        <option value="">Previous period</option><option value="none">No comparison</option></select></label>}
      {filters.map(filter => {
        const key = str(filter.key);
        const value = str(obj(data.params)[key]);
        return <label className="filter-label" key={key}>{str(filter.label)}{filter.type === 'search'
          ? <input type="search" name={key} maxLength={100} defaultValue={value}/>
          : <select name={key} defaultValue={value}>{arr(filter.options).map(obj).map(option =>
            <option key={str(option.value)} value={str(option.value)}>{str(option.label)}</option>)}</select>}</label>;
      })}
      <button className="button primary">Apply filters</button><Link className="button subtle" href={url(path,{region})}>Reset</Link>
    </form>}
    <div className="report-context muted">
      {str(meta.from) && str(meta.to) && <p><strong>{str(meta.from)} to {str(meta.to)}</strong> · {str(meta.timezone)} · {currency}</p>}
      {str(report.dateBasis) && <p>{str(report.dateBasis)}</p>}
      {arr(data.restricted).length > 0 && <p>Some cost or margin figures are hidden by your permissions.</p>}
    </div>
    {quality.length > 0 && <div className="notice warn"><ul>{quality.map(message => <li key={message}>{message}</li>)}</ul></div>}
    <div className="metric-grid">{arr(data.kpis).map(obj).map(kpi => <article className="panel metric" key={str(kpi.key)}>
      <div className="metric-top"><span className="tile-icon purple"><ChartNoAxesCombined size={18}/></span>{str(kpi.label)}</div>
      <strong>{printable(kpi.value, kpi.type === 'currency' || kpi.type === 'money' ? 'money' : undefined,currency) || '—'}</strong>
      <small>{str(kpi.definition)}</small>
    </article>)}</div>
    {arr(data.tables).map(obj).map(table => {
      const columns = arr(table.columns).map(obj);
      const pagination = obj(table.pagination);
      const total = typeof pagination.total === 'number' ? pagination.total : undefined;
      const next = total !== undefined && typeof pagination.limit === 'number' && page * pagination.limit < total;
      return <Table key={str(table.id)} title={str(table.title)} exportable={false}
        page={total === undefined ? undefined : page} total={total}
        previous={total !== undefined && page > 1 ? url(path,{...scope,page:String(page-1)}) : undefined}
        next={next ? url(path,{...scope,page:String(page+1)}) : undefined}
        columns={columns.map(col => ({label:str(col.label),fields:str(col.key)}))}
        rows={arr(table.rows).map(obj).map((row,index) => ({ id: String(index), values: columns.map(col =>
          printable(row[str(col.key)], col.type === 'money' || col.type === 'currency' ? 'money' : undefined, currency)) }))}/>;
    })}
    <Link className="button secondary" href={url('/desk/reports',{region})}>Back to reports</Link>
  </>;
}
