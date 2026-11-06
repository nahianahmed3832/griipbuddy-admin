'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, Clipboard, Search, X } from 'lucide-react';
import type { Column } from '@/lib/sections';
import type { ViewRow } from '@/lib/data';
import { Handover, type HandoverOptions } from './handover';

const csvCell = (value: string) => {
  const escaped = /^[\s\u200B\uFEFF]*[=+@-]|^[\r\n\t]/.test(value) ? "'" + value : value;
  return '"' + escaped.replaceAll('"', '""') + '"';
};
export function Badge({ value }: { value: string }) {
  const state = value.toUpperCase().replaceAll(' ','_');
  const tone = /^(ACTIVE|PUBLISHED|DELIVERED|IN_STOCK|PAID|APPROVED|ENABLED)$/.test(state) ? 'green'
    : /^(CANCELLED|CANCELED|INACTIVE|FAILED|DISABLED|REJECTED)$/.test(state) ? 'red'
      : /PENDING|REVIEW|AWAITING|TRANSIT|ASSIGNED/.test(state) ? 'amber' : 'purple';
  return <span className={'badge '+tone}><span/>{value.toLowerCase().replaceAll('_',' ').replace(/^./, v => v.toUpperCase())}</span>;
}
export function Empty({ title = 'No records in this view', detail = 'Try another filter or operating region.' }: { title?: string; detail?: string }) {
  return <div className="empty"><span className="empty-icon"><Search size={21}/></span><h3>{title}</h3><p>{detail}</p></div>;
}

export function Table({ columns, rows, title, page, total, previous, next, empty, exportable = true, handover }: {
  columns: Column[]; rows: ViewRow[]; title: string; page?: number; total?: number; previous?: string; next?: string; empty?: string; exportable?: boolean; handover?: HandoverOptions;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const selectedRows = rows.filter(row => selected.includes(row.id));
  const all = rows.length > 0 && selectedRows.length === rows.length;
  const some = selectedRows.length > 0;
  function toggle(id: string) { setSelected(keys => keys.includes(id) ? keys.filter(key => key !== id) : [...keys, id]); }
  function download() {
    const lines = [columns.map(col => col.label), ...(some ? selectedRows : rows).map(row => row.values)];
    const href = URL.createObjectURL(new Blob(['\uFEFF'+lines.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (some ? '-selected.csv' : '-page.csv');
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <section className="panel data-panel" aria-label={title}>
    <div className="panel-header"><div><h2>{title}</h2><p>{total !== undefined ? total + ' matching records' : rows.length + ' records on this page'}</p></div>
      {exportable && !!rows.length && <button className="button secondary" onClick={download}><ArrowDownToLine size={16}/> {some ? 'Export selected' : 'Export page'}</button>}
    </div>
    {some && <div className="bulk-bar"><strong>{selectedRows.length} selected</strong>
      <button className="button subtle" onClick={async () => { try {
        await navigator.clipboard.writeText(selectedRows.map(r => r.values[0] || r.id).join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1200);
      } catch { setCopied(false); } }}>{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? 'Copied' : 'Copy references'}</button>
      <button className="button subtle" onClick={() => setSelected([])}><X size={15}/> Clear</button>
    </div>}
    {handover && <div className="bulk-bar"><Handover orderIds={selectedRows.map(row => row.id)} options={handover} clear={() => setSelected([])}/></div>}
    {rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label={title + ' table'}>
      <table><thead><tr>{exportable && <th scope="col" className="select-col"><input type="checkbox" checked={all} aria-label="Select all visible records" onChange={() => setSelected(all ? [] : rows.map(r => r.id))}/></th>}
        {columns.map(col => <th key={col.label} scope="col">{col.label}</th>)}{rows.some(r => r.href || r.legacy) && <th scope="col">Actions</th>}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          {exportable && <td className="select-col"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={'Select ' + (row.values[0] || row.id)}/></td>}
          {row.values.map((value,i) => <td key={columns[i].label} className={i === 0 ? 'primary-cell' : ''}>
            {i === 0 && row.href ? <Link className="table-link" href={row.href}>{value || 'View record'}</Link>
              : value && columns[i].kind === 'badge' ? <Badge value={value}/> : value || <span className="dim">—</span>}</td>)}
          {rows.some(r => r.href || r.legacy) && <td>{row.legacy && <a className="table-link inline" href={row.legacy} target="_blank" rel="noreferrer">Workflow <ArrowUpRight size={14}/></a>}</td>}
        </tr>)}</tbody>
      </table>
    </div> : <Empty detail={empty}/>}
    {page !== undefined && <div className="pagination"><span>Page {page}</span><div>
      {previous ? <Link className="button secondary" href={previous}><ArrowLeft size={15}/> Previous</Link> : <button disabled className="button secondary"><ArrowLeft size={15}/> Previous</button>}
      {next ? <Link className="button secondary" href={next}>Next <ArrowRight size={15}/></Link> : <button disabled className="button secondary">Next <ArrowRight size={15}/></button>}
    </div></div>}
  </section>;
}
