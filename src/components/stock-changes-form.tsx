'use client';

import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { isStockTransfer, stockChangeHistory, stockChangeSource, type StockChangeLocation, type StockChangeMode,
  type StockChangeProduct } from '@/lib/stock-changes';
import styles from './stock-changes.module.css';

type Line = StockChangeProduct & { quantity: string; note: string };
type ExpenseLine = { id: number; type: string; amount: string; note: string };

const subscribe = () => () => undefined;
const activeClient = () => true;
const inactiveServer = () => false;

function endpoint(mode: StockChangeMode, region: Region, query: Record<string, string> = {}) {
  return adminPath('/api/stock-changes?' + new URLSearchParams({ mode, region, ...query }));
}

export function StockChangesForm({ locations, region, mode, productionOutlet = false, initialOutlet = '' }: {
  locations: StockChangeLocation[]; region: Region; mode: StockChangeMode; productionOutlet?: boolean; initialOutlet?: string;
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, activeClient, inactiveServer);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(initialOutlet);
  const [action, setAction] = useState('ADDITION');
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<StockChangeProduct[] | null>(null);
  const [items, setItems] = useState<Line[]>([]);
  const [outletVariants, setOutletVariants] = useState<StockChangeProduct[]>([]);
  const [expenses, setExpenses] = useState<ExpenseLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean }>();
  const expenseNumber = useRef(0);
  const attempt = useRef<{ key: string; body: string } | undefined>(undefined);
  const transfer = isStockTransfer(mode);
  const sourceType = stockChangeSource(mode);
  const sourceLocations = locations.filter(location => !sourceType || location.type === sourceType);
  const destinations = locations.filter(location => location.id !== from && (mode !== 'outlet-update' || location.type === 'OUTLET'));
  const canSearch = Boolean(from && (!productionOutlet || to));

  function selectSource(location: string) {
    setFrom(location);
    if (location === to) setTo('');
    setItems([]);
    setOutletVariants([]);
    setResults(null);
    setFeedback(undefined);
  }
  async function search() {
    if (!canSearch || !query.trim() || searching) return;
    setSearching(true);
    setResults(null);
    setFeedback(undefined);
    try {
      const response = await fetch(endpoint(mode, region, { location: from, q: query.trim() }), { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.text()).slice(0, 400));
      setResults(await response.json() as StockChangeProduct[]);
    } catch (err) {
      setFeedback({ message: err instanceof Error && err.message ? err.message : 'Could not search for products.', error: true });
    } finally {
      setSearching(false);
    }
  }
  function pick(product: StockChangeProduct) {
    setItems(current => current.some(row => row.variant === product.variant) ? current : [...current, { ...product, quantity: '1', note: '' }]);
    if (!transfer && product.regularPrice === undefined) {
      void fetch(endpoint(mode, region, { location: from, product: product.product }), { cache: 'no-store' }).then(async response => {
        if (!response.ok) return;
        const variants = await response.json() as StockChangeProduct[];
        const regularPrice = variants.find(row => row.variant === product.variant)?.regularPrice;
        if (regularPrice !== undefined) setItems(rows => rows.map(row => row.variant === product.variant ? { ...row, regularPrice } : row));
      }).catch(() => undefined);
    }
  }
  async function selectOutletProduct(product: StockChangeProduct) {
    if (searching) return;
    setSearching(true); setFeedback(undefined);
    try {
      const response = await fetch(endpoint(mode, region, { location: from, product: product.product }), { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.text()).slice(0, 400));
      setOutletVariants(await response.json() as StockChangeProduct[]);
      setQuery(product.name);
      setResults(null);
      setItems([]);
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Could not load variants.', error: true });
    } finally { setSearching(false); }
  }
  function editItem(variant: string, values: Partial<Pick<Line, 'quantity' | 'note'>>) {
    setItems(current => current.map(item => item.variant === variant ? { ...item, ...values } : item));
  }
  function editExpense(id: number, values: Partial<Omit<ExpenseLine, 'id'>>) {
    setExpenses(current => current.map(expense => expense.id === id ? { ...expense, ...values } : expense));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !items.length) return;
    setSaving(true);
    setFeedback(undefined);
    const lines = items.map(({ product, variant, quantity, note }) => ({
      product, variant, qty: Number(quantity), ...(!transfer && note.trim() && { note: note.trim() }),
    }));
    const values = transfer
      ? { from, to, items: lines, expenses: expenses.map(({ type, amount, note }) => ({ type: type.trim(), amount: Number(amount), note: note.trim() })) }
      : { from, action, reason: reason.trim(), items: lines };
    const body = JSON.stringify(values);
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    try {
      const response = await fetch(endpoint(mode, region), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, key: attempt.current.key }),
      });
      if (!response.ok) throw new Error((await response.text()).slice(0, 400));
      const saved = await response.json() as { id?: string };
      if (!saved.id) throw new Error('The inventory service did not confirm this change. Check the history.');
      setItems([]);
      setOutletVariants([]);
      setExpenses([]);
      setResults(null);
      setReason('');
      setFeedback({ message: transfer ? 'Stock transfer recorded.' : 'Stock adjustment recorded.', error: false });
      attempt.current = undefined;
      if (productionOutlet) router.push('/dashboard/inventory/view/outlet?' + new URLSearchParams({ outlet_id: to, region }));
      else router.refresh();
    } catch (err) {
      setFeedback({ message: err instanceof Error && err.message ? err.message : 'Could not record the stock change.', error: true });
    } finally {
      setSaving(false);
    }
  }
  const maximum = (row: Line) => transfer || action === 'DEDUCTION' ? Math.max(0, row.available) : 100_000;
  const searchResults = productionOutlet && results ? [...new Map(results.map(row => [row.product, row])).values()] : results;
  return <form className={styles.form} onSubmit={submit}>
    <fieldset className="panel padded" disabled={saving || !ready}>
      <legend>{transfer ? 'Locations' : 'Location and adjustment'}</legend>
      <div className={styles.fields}>
        <label>{productionOutlet ? 'Select Warehouse' : transfer ? 'From location' : 'Business location'}
          <select required value={from} onChange={event => selectSource(event.target.value)} disabled={searching}>
            <option value="">{sourceLocations.length ? 'Choose a location' : 'No active locations'}</option>
            {sourceLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        {transfer ? <label>{productionOutlet ? 'Select Outlet' : 'To location'}
          <select required value={to} onChange={event => setTo(event.target.value)}>
            <option value="">{destinations.length ? 'Choose a destination' : 'No active destinations'}</option>
            {destinations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label> : <>
          <label>Adjustment type<select value={action} onChange={event => setAction(event.target.value)}>
            <option value="ADDITION">Addition</option><option value="DEDUCTION">Deduction</option>
          </select></label>
          <label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={800} required /></label>
        </>}
      </div>
    </fieldset>
    <fieldset className="panel padded" disabled={saving || !ready}>
      <legend>{productionOutlet ? 'Transfer Inventory to Outlet' : 'Products'}</legend>
      <div className={styles.fields}>
        <label>Search product or SKU<input value={query} maxLength={100} disabled={!canSearch || searching}
          onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); void search(); }
          }} placeholder="Product name, SKU, or barcode" /></label>
        <button type="button" className="button secondary" disabled={!canSearch || !query.trim() || searching} onClick={() => void search()}>
          {searching ? 'Searching…' : 'Find products'}</button>
      </div>
      {results?.length === 0 && <p>No products match at this location.</p>}
      {!!searchResults?.length && <ul className={styles.results} aria-label="Matching products">{searchResults.map((product, index) => <li key={product.variant + index}>
        <span>{product.name}{!productionOutlet && <> · <strong>{product.sku}</strong> · {product.available} on hand</>}</span>
        <button type="button" className="button secondary" disabled={searching || !productionOutlet && (items.length >= 50 || items.some(row => row.variant === product.variant))}
          onClick={() => productionOutlet ? void selectOutletProduct(product) : pick(product)}>{productionOutlet ? 'Select ' + product.name : 'Add ' + product.sku}</button>
      </li>)}</ul>}
      {productionOutlet && outletVariants.length > 0 && <div className="table-scroll" role="region" aria-label="Product variants" tabIndex={0}>
        <table><thead><tr><th scope="col">Select</th><th scope="col">Product Variant</th><th scope="col">In Warehouse</th><th scope="col">Quantity to Transfer</th></tr></thead>
          <tbody>{outletVariants.map(row => {
            const selected = items.find(item => item.variant === row.variant);
            return <tr key={row.variant}>
              <td><input type="checkbox" checked={Boolean(selected)} aria-label={'Select ' + row.sku}
                disabled={!selected && (row.available < 1 || items.length >= 50)} onChange={event => {
                  if (event.target.checked) pick(row);
                  else setItems(rows => rows.filter(item => item.variant !== row.variant));
                }}/></td>
              <td>{row.sku}</td><td>{row.available}</td>
              <td><input type="number" aria-label={'Quantity for ' + row.sku} min="1" max={row.available} step="1" value={selected?.quantity ?? ''}
                disabled={!selected} required={Boolean(selected)} onChange={event => editItem(row.variant, { quantity: event.target.value })}/></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {!productionOutlet && !!items.length && <div className="table-scroll" role="region" aria-label="Products to update" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Product</th><th scope="col">{productionOutlet ? 'In Warehouse' : 'On hand'}</th>
            <th scope="col">{productionOutlet ? 'Quantity to Transfer' : 'Quantity'}</th>
            {!transfer && <><th scope="col">Regular Price</th><th scope="col">Line note</th></>}<th scope="col">Remove</th></tr></thead>
          <tbody>{items.map(row => <tr key={row.variant}>
            <td>{row.name}<br />{row.sku}</td><td>{row.available}</td>
            <td><input aria-label={'Quantity for ' + row.sku} type="number" value={row.quantity} min="1" max={maximum(row)} step="1"
              onChange={event => editItem(row.variant, { quantity: event.target.value })} required /></td>
            {!transfer && <><td>{row.regularPrice !== undefined ? (region === 'BD' ? '৳' : '') + row.regularPrice.toLocaleString('en') : '—'}</td>
              <td><input aria-label={'Note for ' + row.sku} value={row.note} maxLength={500} onChange={event => editItem(row.variant, { note: event.target.value })} /></td></>}
            <td><button className="button subtle" type="button" onClick={() => setItems(current => current.filter(item => item.variant !== row.variant))}>Remove {row.sku}</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </fieldset>
    {transfer && !productionOutlet && <fieldset className="panel padded" disabled={saving || !ready}>
      <legend>Additional Expenses</legend>
      {expenses.map((row, index) => <div key={row.id} className={styles.fields}>
        <label>Expense type {index + 1}<input value={row.type} onChange={event => editExpense(row.id, { type: event.target.value })} required maxLength={120} /></label>
        <label>Expense amount {index + 1}<input type="number" value={row.amount} onChange={event => editExpense(row.id, { amount: event.target.value })}
          required min="0" max="10000000" step="0.01" /></label>
        <label>Expense note {index + 1}<input value={row.note} onChange={event => editExpense(row.id, { note: event.target.value })} maxLength={500} /></label>
        <button type="button" className="button subtle" onClick={() => setExpenses(current => current.filter(expense => expense.id !== row.id))}>
          Remove expense {index + 1}</button>
      </div>)}
      <button type="button" className="button secondary" disabled={expenses.length >= 20} onClick={() => {
        const id = expenseNumber.current++;
        setExpenses(current => [...current, { id, type: '', amount: '', note: '' }]);
      }}>Add Expense</button>
    </fieldset>}
    <div className={styles.fields}>
      <button className="button primary" disabled={!ready || saving || searching || !from || (transfer && !to) || !items.length}>
        {productionOutlet ? saving ? 'Updating' : 'Confirm Update' : saving ? 'Recording…' :
          transfer ? 'Record stock transfer' : 'Record stock adjustment'}
      </button>
      <Link className="button subtle" href={stockChangeHistory(mode, region)}>Cancel</Link>
    </div>
    {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
  </form>;
}
