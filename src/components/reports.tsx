import Link from 'next/link';
import { ArrowDownToLine, ArrowRight, ChartNoAxesCombined, FileText } from 'lucide-react';
import { api, ApiError, arr, obj, str, url, type Session } from '@/lib/api';
import { printable, reportIds, reportQuery, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { PageHeading, Period } from './dashboard';
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
  const data = obj(await api(url('/analytics/reports/'+id, scope),auth.token));
  const report = obj(data.report);
  const currency = str(obj(data.meta).currency) || 'BDT';
  return <>
    <PageHeading eyebrow="REPORTS / DETAIL" title={str(report.title) || 'Report'} description={str(report.description)}>
      <a className="button secondary" href={adminPath(url('/api/download',{...scope,id,format:'csv'}))}><ArrowDownToLine size={16}/> CSV</a>
      <a className="button primary" href={adminPath(url('/api/download',{...scope,id,format:'xlsx'}))}><ArrowDownToLine size={16}/> Excel</a>
    </PageHeading>
    {report.usesPeriod === true && <div className="panel filter-panel"><Period q={q} region={region} path={'/desk/reports/'+id}/></div>}
    <div className="metric-grid">{arr(data.kpis).map(obj).map(kpi => <article className="panel metric" key={str(kpi.key)}>
      <div className="metric-top"><span className="tile-icon purple"><ChartNoAxesCombined size={18}/></span>{str(kpi.label)}</div>
      <strong>{printable(kpi.value, kpi.type === 'currency' || kpi.type === 'money' ? 'money' : undefined,currency) || '—'}</strong>
      <small>{str(kpi.definition)}</small>
    </article>)}</div>
    {arr(data.tables).map(obj).map(table => {
      const columns = arr(table.columns).map(obj);
      return <Table key={str(table.id)} title={str(table.title)} exportable={false}
        columns={columns.map(col => ({label:str(col.label),fields:str(col.key)}))}
        rows={arr(table.rows).map(obj).map((row,index) => ({ id: String(index), values: columns.map(col =>
          printable(row[str(col.key)], col.type === 'money' || col.type === 'currency' ? 'money' : undefined, currency)) }))}/>;
    })}
    <Link className="button secondary" href={url('/desk/reports',{region})}>Back to reports</Link>
  </>;
}
