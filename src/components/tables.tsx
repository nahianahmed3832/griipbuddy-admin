'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ArrowUpRight, Check, Clipboard, Search, X } from 'lucide-react';
import type { Column } from '@/lib/sections';
import type { ViewRow } from '@/lib/data';
import { Handover, type HandoverOptions } from './handover';

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
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
  const [interactive, setInteractive] = useState(false);
  useEffect(() => { setInteractive(true); }, []);
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [sort, setSort] = useState<{ column: number; ascending: boolean }>();
  const visible = sort ? [...rows].sort((a,b) => {
    const first = a.values[sort.column];
    const second = b.values[sort.column];
    if (!first || !second) return Number(!first) - Number(!second);
    const firstNumber = a.numeric?.[sort.column];
    const secondNumber = b.numeric?.[sort.column];
    const comparison = typeof firstNumber === 'number' && typeof secondNumber === 'number'
      ? firstNumber - secondNumber : collator.compare(first, second);
    return sort.ascending ? comparison : -comparison;
  }) : rows;
  const selectedRows = visible.filter(row => selected.includes(row.id));
  const all = rows.length > 0 && selectedRows.length === rows.length;
  const some = selectedRows.length > 0;
  const workflows = rows.some(row => row.legacy);
  function toggle(id: string) { setSelected(keys => keys.includes(id) ? keys.filter(key => key !== id) : [...keys, id]); }
  function download() {
    const lines = [columns.map(col => col.label), ...(some ? selectedRows : visible).map(row => row.values)];
    const href = URL.createObjectURL(new Blob(['\uFEFF'+lines.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + (some ? '-selected.csv' : '-page.csv');
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return <section className="panel data-panel" aria-label={title}>
    <div className="panel-header"><div><h2>{title}</h2><p>{total !== undefined ? total + ' matching records' : rows.length + ' records on this page'}</p></div>
      {exportable && !!rows.length && <button className="button secondary" disabled={!interactive} onClick={download}><ArrowDownToLine size={16}/> {some ? 'Export selected' : 'Export page'}</button>}
    </div>
    {some && <div className="bulk-bar"><strong>{selectedRows.length} selected</strong>
      <button className="button subtle" onClick={async () => { try {
        await navigator.clipboard.writeText(selectedRows.map(r => r.values[0] || r.id).join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1200);
      } catch { setCopied(false); } }}>{copied ? <Check size={15}/> : <Clipboard size={15}/>} {copied ? 'Copied' : 'Copy references'}</button>
      <button className="button subtle" onClick={() => setSelected([])}><X size={15}/> Clear</button>
    </div>}
    {handover && <div className="bulk-bar"><Handover orderIds={selectedRows.map(row => row.id)} options={handover} clear={() => setSelected([])}/></div>}
    {rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label={title + ' table'}>
      <table><thead><tr>{exportable && <th scope="col" className="select-col"><input type="checkbox" disabled={!interactive} checked={all} aria-label="Select all visible records"
        ref={node => { if (node) node.indeterminate = some && !all; }} onChange={() => setSelected(all ? [] : rows.map(r => r.id))}/></th>}
        {columns.map((col,index) => {
          const active = sort?.column === index;
          const Icon = active ? sort.ascending ? ArrowUp : ArrowDown : ArrowUpDown;
          return <th key={col.label} scope="col" aria-sort={active ? sort.ascending ? 'ascending' : 'descending' : undefined}>
            {exportable ? <button className="table-sort" type="button" disabled={!interactive} title={'Sort this page by ' + col.label}
              onClick={() => setSort({column:index,ascending:!active || !sort.ascending})}>
              {col.label}<Icon aria-hidden="true" size={12}/>
            </button> : col.label}
          </th>;
        })}{workflows && <th scope="col">Workflow</th>}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.id} data-selected={selected.includes(row.id) || undefined}>
          {exportable && <td className="select-col"><input type="checkbox" disabled={!interactive} checked={selected.includes(row.id)} onChange={() => toggle(row.id)} aria-label={'Select ' + (row.values[0] || row.id)}/></td>}
          {row.values.map((value,i) => <td key={columns[i].label} className={i === 0 ? 'primary-cell' : ''}>
            {i === 0 && row.href ? <Link className="table-link" href={row.href}>{value || 'View record'}</Link>
              : value && columns[i].kind === 'badge' ? <Badge value={value}/> : value || <span className="dim">—</span>}</td>)}
          {workflows && <td>{row.legacy && <a className="table-link inline" href={row.legacy} target="_blank" rel="noreferrer">Open workflow <ArrowUpRight size={14}/></a>}</td>}
        </tr>)}</tbody>
      </table>
    </div> : <Empty detail={empty}/>}
    {page !== undefined && <div className="pagination"><span>Page {page}</span><div>
      {previous ? <Link className="button secondary" href={previous}><ArrowLeft size={15}/> Previous</Link> : <button disabled className="button secondary"><ArrowLeft size={15}/> Previous</button>}
      {next ? <Link className="button secondary" href={next}>Next <ArrowRight size={15}/></Link> : <button disabled className="button secondary">Next <ArrowRight size={15}/></button>}
    </div></div>}
  </section>;
}
