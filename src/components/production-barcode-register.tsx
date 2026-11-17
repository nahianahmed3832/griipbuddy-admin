'use client';

import { Barcode, ChevronDown, ChevronsUpDown, Ellipsis, History, Printer, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { adminPath } from '@/lib/paths';
import { barcodeConditions, barcodePattern, barcodeStatuses, productionBarcodePageSizes, type BarcodeRow, type BarcodeVariant } from '@/lib/barcode-data';
import type { Region } from '@/lib/sections';
import { BarcodeImage, BarcodePrint } from './barcode-labels';
import styles from './production-smart-inventory.module.css';

type Filter = Record<'sku' | 'barcode' | 'status' | 'conditions' | 'is_used_barcode', string>;
const blank: Filter = { sku: '', barcode: '', status: '', conditions: '', is_used_barcode: '' };
const base = '/dashboard/barcodes';
const statuses = barcodeStatuses.filter(status => !['ALLOCATED', 'PICKED', 'SHIPPED'].includes(status));

function selectUrl(values: Record<string, string | undefined>, route = base) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value && !(key === 'region' && value === 'BD')) query.set(key, value); });
  return route + (query.size ? '?' + query.toString() : '');
}

function Select({ label, children, value, select }: { label: string; children: ReactNode; value: string; select: (value: string) => void }) {
  return <span className={styles.select}><select aria-label={label} value={value} onChange={event => select(event.currentTarget.value)}>{children}</select>
    <ChevronDown size={16} aria-hidden="true"/></span>;
}

function SkuPicker({ sku, region, canSearch, update }: { sku: string; region: Region; canSearch: boolean; update: (value: string) => void }) {
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<BarcodeVariant[]>([]);
  const [fetching, setFetching] = useState(false);
  const [failed, setFailed] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!canSearch || term.trim().length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setFetching(true);
      setFailed(false);
      try {
        const query = new URLSearchParams({ region, action: 'catalog-variants', q: term.trim() });
        const result = await fetch(adminPath('/api/smart-inventory') + '?' + query, { signal: abort.signal });
        if (!result.ok) throw new Error('The SKU lookup is unavailable.');
        const list = await result.json() as BarcodeVariant[];
        if (!abort.signal.aborted) setMatches(list);
      } catch { if (!abort.signal.aborted) setFailed(true); }
      finally { if (!abort.signal.aborted) setFetching(false); }
    }, 280);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [canSearch, region, term]);

  function choose(value: string) {
    update(value);
    if (details.current) details.current.open = false;
  }

  if (!canSearch) return <input aria-label="SKU" placeholder="Select SKU" value={sku} onChange={event => update(event.currentTarget.value)}/>;
  return <details ref={details} className={styles.skuPicker}>
    <summary aria-label="Select SKU"><span>{sku || 'Select SKU'}</span><ChevronsUpDown size={16}/></summary>
    <div>
      <input aria-label="Search products or SKU" value={term} maxLength={100} placeholder="Search product name or SKU…"
        onChange={event => { setMatches([]); setTerm(event.currentTarget.value); }}/>
      {term.trim().length < 2 ? <p>Type at least 2 characters</p> : fetching ? <p>Searching…</p> :
        failed ? <p>SKU search is unavailable.</p> : matches.length ? matches.map(option =>
          <button type="button" key={option.sku} onClick={() => choose(option.sku)}><strong>{option.name}</strong><small>{option.sku}</small></button>)
          : <p>No matching variants</p>}
      {sku && <button type="button" onClick={() => choose('')}>Clear SKU</button>}
    </div>
  </details>;
}

export function ProductionBarcodeRegister({ rows, region, canSearch, applied, page, limit, total }: {
  rows: BarcodeRow[]; region: Region; canSearch: boolean; applied: Filter; page: number; limit: number; total: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(applied);
  const [selected, setSelected] = useState<string[]>([]);
  const [print, setPrint] = useState<BarcodeRow[]>([]);
  const valid = rows.filter(row => barcodePattern.test(row.barcode));
  const checked = valid.filter(row => selected.includes(row.barcode));
  const every = valid.length > 0 && checked.length === valid.length;
  const pageHref = (offset: number) => selectUrl({ ...applied, region, limit: limit === 50 ? undefined : String(limit), page: offset > 1 ? String(offset) : undefined });
  function apply(filters: Filter, pageLimit = limit) {
    setDraft(filters);
    setSelected([]);
    router.replace(selectUrl({ ...filters, region, limit: pageLimit === 50 ? undefined : String(pageLimit) }), { scroll: false });
  }
  function toggle(barcode: string) {
    setSelected(previous => previous.includes(barcode) ? previous.filter(value => value !== barcode) : [...previous, barcode]);
  }
  return <section className={styles.register}>
    <h1>Barcode List ({total})</h1>
    <form className={styles.registerFilters} onSubmit={event => { event.preventDefault(); apply(draft); }}>
      <div className={styles.fields}>
        <div className={styles.field}><span>SKU</span><SkuPicker sku={draft.sku} region={region} canSearch={canSearch} update={sku => setDraft(value => ({ ...value, sku }))} /></div>
        <label className={styles.field}>Used Barcode
          <Select label="Used Barcode" value={draft.is_used_barcode} select={is_used_barcode => setDraft(value => ({ ...value, is_used_barcode }))}>
            <option value="">All</option><option value="true">Barcode Used</option><option value="false">Not Used</option>
          </Select>
        </label>
        <label className={styles.field}>Status
          <Select label="Status" value={draft.status} select={status => setDraft(value => ({ ...value, status }))}>
            <option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{status}</option>)}
          </Select>
        </label>
        <label className={styles.field}>Conditions
          <Select label="Conditions" value={draft.conditions} select={conditions => setDraft(value => ({ ...value, conditions }))}>
            <option value="">All conditions</option>{barcodeConditions.map(condition => <option key={condition} value={condition}>{condition}</option>)}
          </Select>
        </label>
      </div>
      <div className={styles.controls}>
        <button title="Search" className={styles.searchButton} aria-label="Search"><Search size={16}/></button>
        <button type="button" onClick={() => apply(blank)}><RotateCcw size={16}/> Clear Search</button>
        <button type="button" disabled={!valid.length} onClick={() => setPrint(checked.length ? checked : valid)}><Printer size={16}/> Print{checked.length ? ` (${checked.length})` : ''}</button>
      </div>
    </form>
    <div className={styles.barcodeTable} role="region" aria-label="Barcodes table" tabIndex={0}><table>
      <thead><tr>
        <th scope="col"><input type="checkbox" aria-label="Select all barcodes on this page" checked={every}
          disabled={!valid.length} onChange={() => setSelected(every ? [] : valid.map(row => row.barcode))}/></th>
        {['Action','SKU','Barcode','Status','Condition','Barcode Image','Generated At'].map(label => <th scope="col" key={label}>{label}</th>)}
      </tr></thead>
      <tbody>{rows.length ? rows.map(row => <tr key={row.barcode}>
        <td><input type="checkbox" aria-label={'Select barcode ' + row.barcode} disabled={!barcodePattern.test(row.barcode)}
          checked={selected.includes(row.barcode)} onChange={() => toggle(row.barcode)}/></td>
        <td>{barcodePattern.test(row.barcode) && <details className={styles.rowMenu}>
          <summary aria-label={'Actions for ' + row.barcode}><Ellipsis size={16}/></summary>
          <div>
            <Link href={selectUrl({ ...applied, region, barcode: row.barcode, limit: limit === 50 ? undefined : String(limit) })} scroll={false}><History size={15}/> View history</Link>
            <button type="button" onClick={() => setPrint([row])}><Printer size={15}/> Print label</button>
          </div>
        </details>}</td>
        <td>{row.sku}</td><td><code>{row.barcode}</code></td>
        <td>{row.status && <span className={styles.barcodeStatus} data-status={row.status}>{row.status}</span>}</td><td>{row.condition}</td>
        <td>{barcodePattern.test(row.barcode) ? <BarcodeImage code={row.barcode}/> : '—'}</td>
        <td>{row.createdAt ? new Date(row.createdAt).toLocaleString('en-US', { timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC' }) : '—'}</td>
      </tr>) : <tr><td colSpan={8} className={styles.emptyTable}>No barcodes found</td></tr>}</tbody>
    </table></div>
    <nav className={styles.barcodePages} aria-label="Barcode pages">
      <Select label="Barcodes per page" value={String(limit)} select={value => apply(applied, Number(value))}>
        {productionBarcodePageSizes.map(size => <option key={size} value={size}>{size}</option>)}
      </Select>
      <span>{total ? (page - 1) * limit + 1 : 0} – {Math.min(total, page * limit)} of {total}</span>
      <div>
        {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <button disabled>Previous</button>}
        {page * limit < total ? <Link href={pageHref(page + 1)}>Next</Link> : <button disabled>Next</button>}
      </div>
    </nav>
    {!!print.length && <BarcodePrint labels={print} close={() => setPrint([])}/>}
  </section>;
}

export function BarcodeLogField({ code }: { code: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <div className={styles.scanField}>
    <label htmlFor="production-barcode-log"><Barcode size={16}/> Click input to activate scanner or type manually</label>
    <div><input ref={ref} name="barcode" id="production-barcode-log" placeholder="Scan or type barcode" maxLength={60}
      defaultValue={code} autoComplete="off" required /><button>Load</button></div>
  </div>;
}
