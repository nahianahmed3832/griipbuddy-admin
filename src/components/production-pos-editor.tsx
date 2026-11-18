'use client';

import { ArrowLeft, CalendarDays, Plus, Printer, Scan, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { dateLabel, posDiscountMinor, posLineTotal, posMethods, posMoney, posRegisterPath, posTimeZone,
  type PosDiscount, type PosItem, type PosLine, type PosReceipt } from '@/lib/pos';
import type { SaleDraft } from './pos-editor';
import styles from './production-pos-editor.module.css';

type Choice = { value: string; label: string };
type Customer = { phone: string; name: string };
type ProductionSaleDraft = Omit<SaleDraft, 'lines'> & { serial: string; day: string; customerName: string; lines: PosLine[] };
type SaleTotals = { subtotal: number; itemDiscount: number; discount: number; total: number };
const receiptDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: posTimeZone, hour12: true });

function SaleReceipt({ receipt }: { receipt: PosReceipt }) {
  return <section id="invoice-print-area" className={styles.receipt}>
    <header>
      <Image src={adminPath('/production-admin/griipbuddy-wordmark.png')} alt="GriipBuddy" width={110} height={22} unoptimized loading="eager"/>
      {receipt.location && <strong>{receipt.location}</strong>}
      {receipt.address && <p>{receipt.address}</p>}
      {receipt.contact && <p>Contact: {receipt.contact}</p>}
    </header>
    <h2>INVOICE</h2>
    <dl>{[['Sale Id', '#' + receipt.serial], ['Date', receipt.date && receiptDate.format(new Date(receipt.date))],
      ['Customer', [receipt.customer, receipt.phone].filter(Boolean).join(' ')]].map(([label, value]) =>
      <div key={label}><dt>{label}:</dt><dd>{value}</dd></div>)}</dl>
    <table><thead><tr><th scope="col">Items</th><th scope="col">Qty</th><th scope="col">Price</th></tr></thead>
      <tbody>{receipt.lines.map(line => <tr key={line.sku}>
        <td>{line.sku}{line.attributes && ' (Size: ' + line.attributes + ')'}</td><td>{line.quantity}</td><td>{posMoney(line.price)} Tk</td>
      </tr>)}</tbody></table>
    <dl>{[['Sub Total', receipt.subtotal], ['Discount', receipt.discount], ['Total', receipt.total],
      [receipt.method || 'Paid', receipt.paid], ['Total Paid', receipt.paid]].map(([label, value]) =>
      <div key={label}><dt>{label}:</dt><dd>{posMoney(Number(value))} Tk</dd></div>)}</dl>
  </section>;
}

async function posGet<T>(values: Record<string, string>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(adminPath('/api/pos') + '?' + new URLSearchParams(values), { signal });
  if (!response.ok) throw Error(await response.text());
  return response.json();
}

function DiscountSelect({ discount, onChange, label }: { discount: PosDiscount; onChange: (value: PosDiscount) => void; label: string }) {
  return <select aria-label={label} value={discount.type} onChange={event => onChange({ ...discount, type: event.target.value })}>
    <option value="FLAT">Flat</option><option value="PERCENTAGE">Percentage</option>
  </select>;
}

function DiscountToggle({ discount, onChange, label }: { discount: PosDiscount; onChange: (value: PosDiscount) => void; label: string }) {
  return <span className={styles.discountToggle}>
    <input type="checkbox" role="switch" aria-label={label} checked={discount.type === 'PERCENTAGE'}
      onChange={event => onChange({ ...discount, type: event.currentTarget.checked ? 'PERCENTAGE' : 'FLAT' })}/>
    {discount.type === 'PERCENTAGE' ? 'Percentage' : 'TK'}
  </span>;
}

export function ProductionPosEditor({ draft, locations, canSearchCustomers, canCreateCustomer }: {
  draft: ProductionSaleDraft; locations: Choice[]; canSearchCustomers: boolean; canCreateCustomer: boolean;
}) {
  const router = useRouter();
  const [location, setLocation] = useState(draft.location);
  const [lines, setLines] = useState(draft.lines);
  const [overall, setOverall] = useState(draft.id ? draft.discount : { ...draft.discount, value: '' });
  const [saleDate, setSaleDate] = useState(draft.day);
  const [method, setMethod] = useState(draft.paymentMethod);
  const [paid, setPaid] = useState(draft.id ? draft.paid : '');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [phone, setPhone] = useState(draft.customer);
  const [customerName, setCustomerName] = useState(draft.customerName);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);
  const [newName, setNewName] = useState('');
  const [searchedPhone, setSearchedPhone] = useState('');
  const [matches, setMatches] = useState<PosItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<PosReceipt>();
  const writeId = useRef('');
  const barcodeInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (!location || search.trim().length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await posGet<PosItem[]>({ action: 'products', location, q: search.trim() }, abort.signal);
        setMatches(result);
      } catch {
        if (!abort.signal.aborted) setMatches([]);
      } finally {
        if (!abort.signal.aborted) setSearching(false);
      }
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [location, search]);

  useEffect(() => {
    if (!canSearchCustomers || !/^\d{3,16}$/.test(query)) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await posGet<Customer[]>({ action: 'customers', q: query }, abort.signal);
        setCustomers(result);
        setSearchedPhone(query);
      } catch {
        if (!abort.signal.aborted) setCustomers([]);
      }
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [canSearchCustomers, query]);

  useEffect(() => {
    if (!receipt) return;
    const cleanup = () => setReceipt(undefined);
    window.addEventListener('afterprint', cleanup, { once: true });
    let printing = true;
    const image = document.querySelector<HTMLImageElement>('#invoice-print-area img');
    void (image?.decode() ?? Promise.resolve()).catch(() => {}).then(() => { if (printing) window.print(); });
    return () => { printing = false; window.removeEventListener('afterprint', cleanup); };
  }, [receipt]);

  const readScanner = useEffectEvent((value: string) => { void scan(value); });
  useEffect(() => {
    if (draft.id || !location || customerOpen || busy || receipt) return;
    let barcode = '';
    let lastKey = 0;
    let timer: number | undefined;
    function flush() {
      const captured = barcode;
      barcode = '';
      window.clearTimeout(timer);
      if (captured.length >= 10 && captured.length <= 100) readScanner(captured);
    }
    function collect(event: globalThis.KeyboardEvent) {
      const active = document.activeElement;
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
          active?.matches('input, textarea, select') || (active instanceof HTMLElement && active.isContentEditable)) return;
      if (event.key === 'Enter' && barcode.length >= 10) {
        event.preventDefault();
        flush();
      } else if (event.key.length === 1) {
        const now = performance.now();
        if (now - lastKey > 35) barcode = '';
        barcode += event.key;
        lastKey = now;
        window.clearTimeout(timer);
        timer = window.setTimeout(flush, 200);
      }
    }
    window.addEventListener('keydown', collect);
    return () => { window.removeEventListener('keydown', collect); window.clearTimeout(timer); };
    // The Effect Event reads current sale state without resetting the scanner buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.id, location, customerOpen, busy, receipt]);

  const gross = lines.reduce((sum, line) => sum + Math.round(line.regularPrice * 100) * Number(line.quantity || 0), 0);
  const subtotal = lines.reduce((sum, line) => sum + posLineTotal(line), 0);
  const overallMinor = posDiscountMinor(subtotal, overall);
  const total = subtotal - overallMinor;
  useEffect(() => {
    if (!draft.id) setPaid(lines.length ? String(total / 100) : '');
  }, [draft.id, lines.length, total]);
  const balance = total / 100 - Number(paid || 0);
  const due = draft.id ? balance : Math.max(0, balance);
  const currency = (value: number) => (draft.id ? '৳ ' : '') + posMoney(value / 100);
  const totals = draft.id ? [
    ['Sub Total:', currency(subtotal)], ['Total Discount:', currency(gross - total)], ['Grand Total:', currency(total)], ['Due:', currency(Math.round(due * 100))],
  ] : [
    ['Subtotal', currency(gross)], ['Item Discounts', '–' + currency(gross - subtotal)],
    ['Global Discount', '–' + currency(overallMinor)], ['Grand Total', currency(total)], ['Due', posMoney(due)],
    ...(Number(paid || 0) > total / 100 ? [['Change', posMoney(Number(paid) - total / 100)]] : []),
  ];

  function clearProductSearch() { setSearch(''); setMatches([]); setSearching(false); }

  function add(item: PosItem) {
    setLines(current => {
      const prior = current.find(line => line.sku === item.sku);
      if (prior) {
        const quantity = Math.min(1000, Math.max(Number(prior.quantity), Math.min(Number(prior.quantity) + 1, item.available ?? 1000)));
        return current.map(line => line.sku === item.sku ? { ...line, quantity: String(quantity) } : line);
      }
      return [...current, { ...item, quantity: '1', discount: { type: 'FLAT', value: '0' } }];
    });
    clearProductSearch();
  }

  async function scan(raw = search) {
    const barcode = raw.trim();
    if (!location || barcode.length < 2 || lines.length >= 20 || scanBusy) {
      barcodeInput.current?.focus();
      return;
    }
    setScanBusy(true);
    setError('');
    try {
      const result = await posGet<PosItem[]>({ action: 'scan', location, q: barcode });
      if (!result.length) throw Error('No item found for this barcode at the selected location.');
      add(result[0]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The barcode was not recognized.'); }
    finally { setScanBusy(false); barcodeInput.current?.focus(); }
  }

  function searchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const exact = matches.find(item => item.sku.toLowerCase() === search.trim().toLowerCase());
    if (exact) add(exact);
    else void scan();
  }

  function changeLine(sku: string, partial: Partial<PosLine>) {
    setLines(current => current.map(line => line.sku === sku ? { ...line, ...partial } : line));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || receipt || !lines.length || !location) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    if (!writeId.current) writeId.current = crypto.randomUUID().replaceAll('-', '').slice(0, 24);
    const shouldPrint = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'print';
    const editor = event.currentTarget;
    const form = new FormData(editor);
    const values = {
      ...Object.fromEntries(form), saleDate: String(form.get('saleDate') ?? ''),
      location, customer: phone, customerName, newCustomer, production: true, print: shouldPrint, id: draft.id, revision: draft.revision,
      requestId: writeId.current, discount: { ...overall, value: overall.value || '0' },
      lines: lines.map(({ sku, quantity, discount }) => ({ sku, quantity, discount: { ...discount, value: discount.value || '0' } })),
    };
    async function save<T>(action: string, quotedTotal?: number): Promise<T> {
      const response = await fetch(adminPath('/api/workspace'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, values: { ...values, quotedTotal } }),
      });
      if (!response.ok) throw Error(await response.text());
      return response.json();
    }
    try {
      const quote = await save<SaleTotals>('pos-quote');
      if (Math.round(quote.total * 100) !== total) throw Error('The catalog price changed. Remove the item and search for it again.');
      const result = await save<{ id: string; receipt?: PosReceipt }>('pos', quote.total);
      if (!result.id) throw Error('The sale was not confirmed.');
      if (draft.id) {
        router.push(posRegisterPath);
        router.refresh();
      } else {
        writeId.current = '';
        editor.reset();
        clearProductSearch();
        setPhone('');
        setCustomerName('');
        setNewCustomer(false);
        setLines([]);
        setOverall({ type: 'FLAT', value: '' });
        setMethod('Cash');
        setPaid('');
        if (shouldPrint && result.receipt) setReceipt(result.receipt);
        window.dispatchEvent(new CustomEvent('griip-admin-saved', {
          detail: shouldPrint && result.receipt ? 'Sale created successfully! Print window opening…' : 'Sale created successfully!',
        }));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The sale was not confirmed.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  const disabled = !location || !lines.length || busy || Boolean(receipt);
  return <section className={styles.root}>
    {draft.id && <h1><a href={adminPath(posRegisterPath)} aria-label="Back to sales"><ArrowLeft size={16}/></a> Edit Sale</h1>}
    <form onSubmit={submit} className={draft.id ? styles.edit : styles.create}>
      <div className={styles.items}>
        {draft.id ? <h2>Sale ID: {draft.serial}</h2> : <>
          {!location && <p role="status" className={styles.locationWarning}>Please select business location first!</p>}
          <label>Select Business Location<select aria-label="Select Business Location" value={location} onChange={event => {
            setLocation(event.target.value); setLines([]); clearProductSearch();
          }} required><option value=""/>{locations.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>
        </>}
        <div className={styles.headerFields}>
          {!draft.id && <div className={styles.searchField}><label>Customer<button type="button" aria-expanded={customerOpen} disabled={!location || !canSearchCustomers}
            aria-label={phone ? customerName + ' (' + phone + ')' : 'Walk-in Customer'} className={styles.customerButton} onClick={() => setCustomerOpen(open => !open)}>{phone ? customerName + ' (' + phone + ')' : 'Walk-in Customer'}</button></label>
            {customerOpen && <div className={styles.customerPanel}>
              <div className={styles.customerSearch}><input type="tel" placeholder="Search by phone..." aria-label="Search by phone"
                value={query} maxLength={16} onChange={event => { setQuery(event.target.value); setCustomers([]); }}/>
                {canCreateCustomer && <button className={styles.outline} type="button" aria-label="Add new customer"
                  disabled={!/^\d{8,16}$/.test(query) || searchedPhone !== query || customers.length > 0} onClick={() => {
                    setPhone(query); setCustomerName(newName.trim() || 'New Customer'); setNewCustomer(true);
                    setCustomerOpen(false); setQuery(''); setNewName('');
                  }}><Plus size={17}/></button>}
                <button className={styles.outline} type="button" aria-label="Reset customer" onClick={() => {
                  setPhone(''); setCustomerName(''); setNewCustomer(false); setCustomerOpen(false); setQuery(''); setNewName('');
                }}><X size={17}/></button>
              </div>
              {canCreateCustomer && searchedPhone === query && /^\d{8,16}$/.test(query) && !customers.length &&
                <label>Add Customer Name<input placeholder="Enter new customer name (optional)" value={newName} onChange={event => setNewName(event.target.value)}/></label>}
              {customers.map(customer => <button type="button" key={customer.phone} className={styles.customerButton} onClick={() => {
                setPhone(customer.phone); setCustomerName(customer.name); setNewCustomer(false); setCustomerOpen(false); setQuery(''); setNewName('');
              }}>{customer.name} ({customer.phone})</button>)}
            </div>}
          </div>}
          <label>Sale Date<span className={styles.dayField}><span>{saleDate ? dateLabel(saleDate) : 'Select date'}</span><CalendarDays size={16}/>
            <input type="date" aria-label="Sale Date" name="saleDate" value={saleDate}
              onChange={event => setSaleDate(event.target.value)} required/></span></label>
        </div>
        <div className={styles.searchField}>
          {!draft.id && <label htmlFor="pos-product-query">Add Product</label>}
          <div className={styles.scanField}><input type="text" ref={barcodeInput} id="pos-product-query"
            placeholder={draft.id ? 'Search by SKU' : 'Scan barcode or search by product name or sku or slug'} aria-label="Add Product"
            value={search} onChange={event => {
              const value = event.target.value;
              setSearch(value);
              setMatches([]);
              setSearching(value.trim().length >= 2);
            }} onKeyDown={searchKey} disabled={!location || lines.length >= 20}/>
            {!draft.id && <button type="button" className={styles.outline} aria-label="Scan barcode" onClick={() => void scan()} disabled={!location || scanBusy || lines.length >= 20}><Scan size={18}/></button>}
          </div>
          {search.trim().length >= 2 && <ul className={styles.suggestions}>
            {searching ? <li className={styles.searchStatus} role="status">Searching…</li>
              : !matches.length && <li className={styles.searchStatus} role="status">No variants found.</li>}
            {matches.map(item => <li key={item.sku}><button type="button" onClick={() => add(item)}>
              <strong>{item.name || item.sku}{item.attributes && ' (' + item.attributes + ')'}</strong>
              <small>SKU: {item.sku} | Sale Price: {posMoney(item.salePrice)} | Regular Price: {posMoney(item.regularPrice)}{item.available !== undefined && ' | Stock: ' + item.available}</small>
            </button></li>)}
          </ul>}
        </div>
        <div className={styles.table}><table><thead><tr><th>{draft.id ? 'Product' : 'Product SKU'}</th>
          {['Qty', 'Regular Price', 'Discount Type', 'Discount Value', 'Total', 'Action'].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{!lines.length && <tr><td colSpan={7} className={styles.empty}>Your cart is empty. Add products to get started.</td></tr>}
            {lines.map(line => <tr key={line.sku}>
              <td>{line.name || line.sku}{line.attributes && ' (' + line.attributes + ')'}<small>SKU: {line.sku}</small></td>
              <td><input aria-label={'Quantity for ' + line.sku} type="number" min="1" max="1000" required value={line.quantity}
                onChange={event => changeLine(line.sku, { quantity: event.target.value })}/></td>
              <td>৳ {posMoney(line.regularPrice)}</td>
              <td>{draft.id ? <DiscountSelect label={'Discount type for ' + line.sku} discount={line.discount} onChange={discount => changeLine(line.sku, { discount })}/>
                : <DiscountToggle label={'Percentage discount for ' + line.sku} discount={line.discount} onChange={discount => changeLine(line.sku, { discount })}/>}</td>
              <td><input aria-label={'Discount value for ' + line.sku} type="number" min="0" max={line.discount.type === 'PERCENTAGE' ? 100 : undefined}
                step="0.01" value={line.discount.value} onChange={event => changeLine(line.sku, { discount: { ...line.discount, value: event.target.value } })}/></td>
              <td>{draft.id ? <input value={posLineTotal(line) / 100} readOnly aria-label={'Total for ' + line.sku}/> : '৳ ' + posMoney(posLineTotal(line) / 100)}</td>
              <td><button type="button" className={styles.outline} aria-label={'Remove ' + line.sku} onClick={() => setLines(current => current.filter(item => item.sku !== line.sku))}><Trash2 size={15}/></button></td>
            </tr>)}</tbody>
        </table></div>
        {error && <p role="alert" className={styles.locationWarning}>{error}</p>}
        {!draft.id && <div className={styles.createButtons}>
          <button type="submit" className={styles.primary} disabled={disabled}>Save</button>
          <button type="submit" className={styles.primary} value="print" disabled={disabled}>Save &amp; Print <Printer size={18}/></button>
        </div>}
      </div>
      <aside className={styles.payment}>
        <dl className={styles.totals}>{totals.map(([label, value], i) => <div key={label} data-index={i}>
          <dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className={styles.paymentFields}>
          <div className={styles.overall}>
            {draft.id ? <label>Overall Discount Type<DiscountSelect label="Overall Discount Type" discount={overall} onChange={setOverall}/></label>
              : <label>Overall Discount<DiscountToggle label="Overall percentage discount" discount={overall} onChange={setOverall}/></label>}
            <label>{draft.id && 'Overall Discount Value'}<input aria-label="Overall Discount Value" type="number" min="0" max={overall.type === 'PERCENTAGE' ? 100 : undefined}
              step="0.01" value={overall.value} onChange={event => setOverall({ ...overall, value: event.target.value })}/></label>
          </div>
          <label>{draft.id ? 'Payment Method' : 'Select Payment Method *'}<select name="paymentMethod" aria-label="Payment Method" value={method} onChange={event =>
            setMethod(event.target.value)} required>
            {[...new Set([...posMethods, draft.paymentMethod])].map(value => <option key={value}>{value}</option>)}
          </select></label>
          {method !== 'Cash' && <label>Payment Account<input name="paymentAccount" defaultValue={draft.paymentAccount}
            placeholder="Payment Account Number" maxLength={100}/></label>}
          <label>{draft.id ? 'Paid Amount' : 'Paid Amount *'}<input aria-label="Paid Amount" name="paid" type="number" min="0" step="0.01" placeholder="Paid Amount"
            value={paid} onChange={event => setPaid(event.target.value)} required/></label>
          <label>Sale Note<textarea name="note" maxLength={500} defaultValue={draft.note}/></label>
          <label>Payment Note<textarea name="paymentNote" maxLength={500} defaultValue={draft.paymentNote}/></label>
        </div>
      </aside>
      {draft.id && <div className={styles.editButtons}><button type="submit" className={styles.primary} disabled={disabled}>Update Sale</button></div>}
    </form>
    {receipt && <SaleReceipt receipt={receipt}/>}
  </section>;
}
