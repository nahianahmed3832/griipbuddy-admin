'use client';

import { CalendarDays, Copy, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { PurchaseEditLine, PurchaseEditRecord, PurchaseExtra } from '@/lib/purchase-edit';
import type { Region } from '@/lib/sections';
import type { BarcodeVariant } from '@/lib/barcode-data';
import { productionPurchasePath, purchaseQueryPath } from '@/lib/production-purchase-query';
import styles from './production-purchases.module.css';

type Choice = { value: string; label: string };
const newExpense: PurchaseExtra = { type: '', amount: '', note: '' };
const purchaseFields = [{ key: 'quantity', label: 'Quantity' }, { key: 'cost', label: 'Unit cost' }, { key: 'discount', label: 'Discount' }, { key: 'tax', label: 'Tax' }] as const;
const skuRoot = (sku: string) => sku.trim().split('-')[0].toUpperCase();

export function PurchaseRecordForm({ record, suppliers, locations, region, production = false }: {
  record: PurchaseEditRecord; suppliers: Choice[]; locations: Choice[]; region: Region; production?: boolean;
}) {
  const router = useRouter();
  const pending = useRef(false);
  const nextKey = useRef(record.lines.length + record.expenses.length);
  const [lines, setLines] = useState(record.lines.map((line, key) => ({ ...line, key })));
  const [expenses, setExpenses] = useState(record.expenses.map((expense, index) => ({ ...expense, key: record.lines.length + index })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [date, setDate] = useState(record.date);
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<BarcodeVariant[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const disabled = busy || !ready;
  const received = record.status === 'received';
  const endpoint = adminPath('/api/purchases/record?' + new URLSearchParams({ id: record.id, region }));
  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    const search = term.trim();
    if (search.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(endpoint + '&q=' + encodeURIComponent(search), { signal: controller.signal });
        if (!response.ok) throw new Error('Product search is unavailable.');
        const result = await response.json() as BarcodeVariant[];
        if (!controller.signal.aborted) setMatches(result);
      } catch {
        if (!controller.signal.aborted) setSearchError('Product search is unavailable.');
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, term]);

  function changeSearch(value: string) {
    setTerm(value);
    setMatches(null);
    setSearchError('');
  }
  function selectProduct(option: BarcodeVariant) {
    const key = nextKey.current++;
    const line: PurchaseEditLine = {
      variant: '', title: option.name, sku: option.sku, quantity: '1', cost: '0', discount: '0', tax: '0',
    };
    setLines(rows => rows.length < 50 && !rows.some(row => row.sku === option.sku) ? [...rows, { ...line, key }] : rows);
    changeSearch('');
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...Object.fromEntries(form),
          revision: record.revision, lines, expenses, location: received ? record.location : form.get('location'),
          status: received ? record.status : form.get('status') }),
      });
      if (!response.ok) throw new Error((await response.text()).slice(0, 320) || 'The purchase could not be saved.');
      router.replace(production ? purchaseQueryPath(productionPurchasePath, { region }) : '/desk/inventory/purchases/' + record.id + '?region=' + region);
      router.refresh();
    } catch (failure) {
      setError(failure instanceof TypeError ? 'The connection was interrupted. Check the purchase before retrying.' :
        failure instanceof Error ? failure.message : 'The purchase could not be saved.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const fields = production ? purchaseFields.filter(field => field.key !== 'tax') : purchaseFields;
  const addExpense = <button type="button" className="button secondary" disabled={expenses.length >= 20 || disabled} onClick={() => {
    const key = nextKey.current++;
    setExpenses(rows => [...rows, { ...newExpense, key }]);
  }}><Plus size={16}/> {production ? 'Add Expense' : 'Add expense'}</button>;
  return <form onSubmit={save} className={'panel padded stack-form ' + (production ? styles.purchaseEdit : '')}><fieldset className="supplier-fields" disabled={disabled}>
    <label className="filter-label">Supplier<select name="supplier" required defaultValue={record.supplier}>{suppliers.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    <label className="filter-label">{production ? 'Business Location' : 'Business location'}<select name="location" required defaultValue={record.location} disabled={received}>{locations.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
    {production ? <label className="filter-label">Purchase Date<span className={styles.purchaseDay}>
      <span>{date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z')) : 'Pick a date'}</span><CalendarDays size={16}/>
      <input type="date" name="date" required value={date} onChange={event => setDate(event.target.value)}/></span></label>
      : <label className="filter-label">Purchase date<input type="date" name="date" required defaultValue={record.date}/></label>}
    {production ? <><input type="hidden" name="status" value={record.status}/><input type="hidden" name="note" value={record.note}/>
      <input type="hidden" name="attachments" value={record.attachments}/></> : <>
    <label className="filter-label">Status<select name="status" required defaultValue={record.status} disabled={received}>
      {(received ? ['received'] : ['draft', 'ordered', 'cancelled']).map(status => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
    </select></label>
    <label className="filter-label">Purchase notes<textarea name="note" maxLength={1000} rows={3} defaultValue={record.note}/></label>
    <label className="filter-label">Attachment links<textarea name="attachments" maxLength={5000} rows={3} defaultValue={record.attachments}/></label>
    </>}
  </fieldset>
    <section className="purchase-rate-lines" aria-label="Purchase items">
      <label className="filter-label">Search for Products<input type="search" value={term} maxLength={100}
        placeholder="Search by a product name or sku" disabled={disabled || lines.length >= 50}
        onChange={event => changeSearch(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }}/></label>
      {searchError && <p role="alert">{searchError}</p>}
      {term.trim().length >= 2 && !matches && !searchError && <p role="status">Searching…</p>}
      {matches?.length === 0 && <p role="status">No product found! Try different keywords.</p>}
      {!!matches?.length && <ul aria-label="Matching products">{matches.map(option => <li key={option.sku}>
        <button type="button" className="button secondary" disabled={disabled || lines.some(line => line.sku === option.sku)}
          onClick={() => selectProduct(option)}>{option.name} · {option.sku}{option.options && ' · ' + option.options}</button>
      </li>)}</ul>}
      <h2>Selected Items</h2>
      {received && !production && <p className="muted">Changing quantities changes recorded stock. Units already reserved or sold cannot be removed.</p>}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Purchase item table"><table>
        <thead><tr><th scope="col">{production ? 'Product' : 'SKU'}</th>{fields.map(field => <th key={field.key} scope="col">{production ? field.key === 'quantity' ? 'Qty' : field.key === 'cost' ? 'Unit Cost' : field.label : field.label}</th>)}<th scope="col">{production ? 'Action' : 'Remove'}</th></tr></thead>
        <tbody>{lines.map((line, index) => <tr key={line.key}><td><code>{line.sku}</code><br/><small>{line.title}</small></td>
          {fields.map(({ key, label }) => <td key={key}><input aria-label={label + ' for item ' + (index + 1)} required disabled={disabled}
            inputMode={key === 'quantity' ? 'numeric' : 'decimal'} pattern={key === 'quantity' ? '[0-9]{1,6}' : '[0-9]{1,8}(\.[0-9]{1,2})?'} value={line[key]}
            onChange={event => setLines(rows => rows.map(row => row.key === line.key ? { ...row, [key]: event.target.value } : row))}/>
            {index === 0 && lines.length > 1 && (key === 'cost' || key === 'discount') && <button type="button" className="icon-button"
              disabled={disabled} aria-label={'Apply ' + label.toLowerCase() + ' to matching SKUs'} onClick={() => {
                const root = skuRoot(line.sku);
                setLines(rows => rows.map(row => skuRoot(row.sku) === root ? { ...row, [key]: line[key] } : row));
              }}><Copy size={16}/></button>}
          </td>)}
          <td><button type="button" className="icon-button" disabled={lines.length < 2 || disabled} aria-label={'Remove item ' + (index + 1)}
            onClick={() => setLines(rows => rows.filter(row => row.key !== line.key))}><Trash2 size={16}/></button></td>
        </tr>)}</tbody></table></div>
    </section>
    <section className="stack-form" aria-label="Applied expenses"><header className={styles.expenseEditHeader}>
        <h2>{production ? 'Additional Expenses' : 'Applied expenses'}</h2>{production && addExpense}
      </header>
      {expenses.map((expense, index) => <fieldset className="supplier-fields" disabled={disabled} key={expense.key}>
        <label className="filter-label">{production ? 'Expense Type' : 'Expense ' + (index + 1) + ' type'}<input maxLength={100} required value={expense.type}
          placeholder={production ? 'e.g., Shipping, Tax, Handling' : undefined}
          onChange={event => setExpenses(rows => rows.map(row => row.key === expense.key ? { ...row, type: event.target.value } : row))}/></label>
        <label className="filter-label">{production ? 'Amount' : 'Expense ' + (index + 1) + ' amount'}<input required inputMode="decimal" pattern="[0-9]{1,8}(\.[0-9]{1,2})?" value={expense.amount}
          onChange={event => setExpenses(rows => rows.map(row => row.key === expense.key ? { ...row, amount: event.target.value } : row))}/></label>
        <label className="filter-label">{production ? 'Note' : 'Expense ' + (index + 1) + ' note'}<input maxLength={500} value={expense.note} placeholder={production ? 'Optional note' : undefined}
          onChange={event => setExpenses(rows => rows.map(row => row.key === expense.key ? { ...row, note: event.target.value } : row))}/></label>
        <button type="button" className="button secondary" onClick={() => setExpenses(rows => rows.filter(row => row.key !== expense.key))}>Remove expense {index + 1}</button>
      </fieldset>)}
      {!production && <div>{addExpense}</div>}
    </section>
    {error && <p className="notice warn" role="alert">{error}</p>}
    <div className="page-actions"><button className="button primary" disabled={disabled}>{production ? busy ? 'Editing Purchase' : 'Edit Purchase' : busy ? 'Saving…' : 'Save purchase'}</button></div>
  </form>;
}
