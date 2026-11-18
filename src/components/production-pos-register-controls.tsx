'use client';

import { ChevronDown, File, FileSpreadsheet, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { adminPath } from '@/lib/paths';
import { posColumns, posMoney, posRegisterPath, type PosColumn, type PosRange, type PosRegisterRow } from '@/lib/pos';
import type { PosReturnDetails } from '@/lib/production-pos';
import { ProductionDateRange } from './production-date-range';
import styles from './production-pos-register.module.css';

export function PosRegisterFilterForm({ children, path = posRegisterPath, className = styles.controls }: {
  children: ReactNode; path?: string; className?: string;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function filter(form: HTMLFormElement) {
    clearTimeout(timer.current);
    if (!form.checkValidity()) return;
    const values = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === 'string' && value) values.set(key, value);
    router.replace(path + (values.size ? '?' + values : ''), { scroll: false });
  }
  return <form action={adminPath(path)} className={className} onChange={event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || !target.name) return;
    const form = event.currentTarget;
    clearTimeout(timer.current);
    if (target instanceof HTMLInputElement && target.type === 'search') timer.current = setTimeout(() => filter(form), 270);
    else filter(form);
  }} onSubmit={event => { event.preventDefault(); filter(event.currentTarget); }}>{children}</form>;
}

export function PosRangeFilter({ from, to, range, today }: { from: string; to: string; range: PosRange; today: string }) {
  const selection = useRef<HTMLInputElement>(null);
  const start = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLInputElement>(null);
  return <>
    <input type="hidden" name="selectedOption" defaultValue={range} ref={selection}/>
    <input type="hidden" name="from" defaultValue={range === 'Custom Range' ? from : ''} ref={start}/>
    <input type="hidden" name="to" defaultValue={range === 'Custom Range' ? to : ''} ref={end}/>
    <ProductionDateRange today={today} from={from} to={to} range={range} onChange={(preset, from, to) => {
      if (!selection.current || !start.current || !end.current) return;
      selection.current.value = preset;
      start.current.value = preset === 'Custom Range' ? from : '';
      end.current.value = preset === 'Custom Range' ? to : '';
      selection.current.form?.requestSubmit();
    }}/>
  </>;
}

type Dialog = { row: PosRegisterRow; action: 'return' | 'delete'; detail?: PosReturnDetails };

export function PosRegisterTable({ rows, total, active, page, size, canSeeCost, canSeeProfit, canEdit, canDelete }: {
  rows: PosRegisterRow[]; total: number; active: Record<string, string>; page: number; size: number; canSeeCost: boolean;
  canSeeProfit: boolean; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PosColumn[]>(posColumns.slice(0, 14).map(([key]) => key));
  const [dialog, setDialog] = useState<Dialog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const columns = posColumns.filter(([key]) => (key !== 'cost' || canSeeCost) && (key !== 'profit' || canSeeProfit));
  const shown = columns.filter(([key]) => selected.includes(key));
  const actions = canEdit || canDelete;
  const route = (params: Record<string, string>, path = posRegisterPath) => adminPath(path) + '?' +
    new URLSearchParams(Object.entries({ ...active, ...params }).filter(([, value]) => value)).toString();
  async function show(row: PosRegisterRow, action: Dialog['action']) {
    setError('');
    if (action === 'delete') return setDialog({ row, action });
    try {
      const response = await fetch(adminPath('/api/pos') + '?' + new URLSearchParams({ id: row.id, action }));
      if (!response.ok) throw Error(await response.text());
      setDialog({ row, action, detail: await response.json() });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The sale could not be loaded.'); }
  }
  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || busy) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const values = {
      items: dialog.detail?.lines.map(line => ({ barcode: line.barcode, quantity: Number(data.get(line.barcode)) })).filter(line => line.quantity > 0),
      type: data.get('type'), discount: data.get('discount'), paid: data.get('paid'),
    };
    try {
      const response = await fetch(adminPath('/api/pos'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dialog.row.id, action: dialog.action, values }),
      });
      if (!response.ok) throw Error(await response.text());
      setDialog(undefined);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The sale update was interrupted.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className={styles.exports}>
      {(['xlsx', 'pdf'] as const).map((action) => {
        const Icon = action === 'xlsx' ? FileSpreadsheet : File;
        const name = action === 'xlsx' ? 'Download Excel' : 'Download PDF';
        return total ? <a key={action} className={action === 'pdf' ? styles.primary : styles.secondary}
          href={route({ action }, '/api/pos')}><Icon size={15}/>{name}</a>
          : <button key={action} className={styles.secondary} disabled><Icon size={15}/>{name}</button>;
      })}
    </div>
    {error && !dialog && <p role="alert">{error}</p>}
    <div className={styles.sheet}>
      <div className={styles.columns}><details><summary>Select Fields <ChevronDown size={15}/></summary><div>
        {columns.map(([key, label]) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() =>
          setSelected(value => value.includes(key) ? value.filter(item => item !== key) : [...value, key])}/>{label}</label>)}
      </div></details></div>
      <div className={styles.table}><table>
        <thead><tr>{actions && <th>Actions</th>}{shown.map(([key, label]) => <th key={key} data-column={key}>{label}</th>)}</tr></thead>
        <tbody>{rows.length ? rows.map(row => <tr key={row.id}>
          {actions && <td><details className={styles.rowMenu}><summary aria-label={'Actions for sale ' + row.serial}><MoreHorizontal size={18}/></summary>
            <div>
              {canEdit && <a href={adminPath('/dashboard/pos/edit/' + row.id)}><Pencil size={14}/> Edit</a>}
              {canEdit && <button onClick={() => void show(row, 'return')}><RotateCcw size={14}/> Sale Return</button>}
              {canDelete && <button className={styles.dangerText} onClick={() => void show(row, 'delete')}><Trash2 size={14}/> Delete</button>}
            </div></details></td>}
          {shown.map(([key]) => <td key={key} data-column={key}>{key === 'status' ? <span className={styles.badge}>{row.cells.status}</span> :
            (row.cells[key] || '-').split('\n').map((line, index) => <span key={index} className={key === 'invoice' && index > 0 ? styles.invoice : undefined}>{line}</span>)}</td>)}
        </tr>) : <tr><td className={styles.empty} colSpan={Math.max(1, shown.length + Number(actions))}>No sales found.</td></tr>}</tbody>
      </table></div>
    </div>
    <div className={styles.pagination}>
      <select value={size} aria-label="Sales per page" onChange={event => router.push(route({ size: event.target.value }).slice(adminPath('').length))}>
        {[20, 40, 60, 80, 100].map(value => <option key={value}>{value}</option>)}
      </select>
      <span>{rows.length ? (page - 1) * size + 1 : 0} – {Math.min(page * size, total)} of {total}</span>
      <div>{[[page - 1, 'Previous', page === 1], [page + 1, 'Next', page * size >= total]].map(([target, name, disabled]) => disabled
        ? <button key={String(name)} className={styles.primary} disabled>{name}</button>
        : <a key={String(name)} className={styles.primary} href={route({ page: String(target) })}>{name}</a>)}</div>
    </div>
    {dialog && <dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setDialog(undefined)} className={styles.dialog}>
      <form onSubmit={commit}>
        <h2>{dialog.action === 'delete' ? 'Delete Sale' : 'Sale Return'}</h2>
        {dialog.detail ? <>
          <div className={styles.returnTable}><table><thead><tr>{['Item', 'Sale Price', 'Regular Price', 'Original Qty', 'Return Qty'].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{dialog.detail.lines.map(line => <tr key={line.barcode}><td>{line.sku}{line.attributes && ' (' + line.attributes + ')'}</td>
              <td>{posMoney(line.salePrice)}</td><td>{posMoney(line.regularPrice)}</td><td>{line.quantity}</td>
              <td><input name={line.barcode} type="number" min={0} max={line.quantity} defaultValue={line.quantity} aria-label={'Return quantity for ' + line.sku}/></td></tr>)}</tbody>
          </table></div>
          <div className={styles.returnFields}>
            <label>Discount Type<select name="type" defaultValue={dialog.detail.discountType}><option value="FLAT">Flat</option><option value="PERCENTAGE">Percentage</option></select></label>
            <label>Discount Value<input name="discount" type="number" min="0" step="0.01" defaultValue={dialog.detail.discountValue}/></label>
            <label>Paid Amount<input name="paid" type="number" min="0" max={dialog.detail.paid} step="0.01" defaultValue={dialog.detail.paid}/></label>
          </div>
        </> : <p>Delete sale #{dialog.row.serial}?</p>}
        {error && <p role="alert">{error}</p>}
        <div className={styles.dialogFooter}><button type="button" className={styles.secondary} onClick={() => setDialog(undefined)}>Cancel</button>
          <button className={dialog.action === 'delete' ? styles.danger : styles.primary} disabled={busy || (dialog.detail?.lines.length === 0)}>
            {dialog.action === 'delete' ? 'Delete Sale' : 'Return'}</button></div>
      </form>
    </dialog>}
  </>;
}
