'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Barcode, Printer, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { barcodeConditions, barcodePattern, barcodeStatuses, receiptLimit, type BarcodeLabel, type BarcodeRow, type BarcodeVariant } from '@/lib/barcode-data';
import type { Choice } from '@/lib/operations';
import type { Region } from '@/lib/sections';
import { BarcodePrint } from './barcode-labels';
import productionStyles from './production-smart-inventory.module.css';

async function readInventory<T>(action: 'variants' | 'validate', q: string, region: Region, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams({ action, q, region });
  const response = await fetch(adminPath('/api/smart-inventory') + '?' + query, { signal });
  if (!response.ok) throw new Error((await response.text()).slice(0, 320) || 'The lookup could not be completed.');
  return response.json();
}

async function saveInventory<T>(action: 'barcode-generate' | 'barcode-receive', values: Record<string, unknown>, region: Region): Promise<T> {
  let response;
  try {
    response = await fetch(adminPath('/api/operations'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, values, region }),
    });
  } catch {
    throw new Error('The connection was interrupted. Check All Barcodes before retrying.');
  }
  if (!response.ok) throw new Error((await response.text()).slice(0, 320) || 'The change could not be confirmed.');
  return response.json();
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export function BarcodeMaintenance({ unit, region, reset = false, closeUrl }: {
  unit: BarcodeRow; region: Region; reset?: boolean; closeUrl?: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function save(form?: HTMLFormElement) {
    if (saving.current) return;
    saving.current = true;
    setPending(true);
    setError('');
    const query = new URLSearchParams({ action: reset ? 'reset' : 'edit', code: unit.barcode, region });
    try {
      const response = await fetch(adminPath('/api/smart-inventory?' + query), {
        method: 'PATCH',
        ...(form && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) }),
      });
      if (!response.ok) throw new Error((await response.text()).slice(0, 320));
      dialog.current?.close();
      if (closeUrl) router.replace(closeUrl, { scroll: false });
      else router.refresh();
    } catch (issue) {
      setError(errorText(issue));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  if (reset) return <div className="page-actions">
    <button className="button secondary" type="button" disabled={pending} onClick={() => void save()}>
      {pending ? 'Resetting…' : 'Reset barcode'}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
  return <>
    <button type="button" className="button secondary" onClick={() => {
      setError('');
      dialog.current?.showModal();
    }}>Edit barcode</button>
    <dialog ref={dialog} aria-label={'Edit ' + unit.barcode}
      onCancel={event => { if (pending) event.preventDefault(); }}>
      <form className="panel padded stack-form" key={[unit.status, unit.condition].join(':')} onSubmit={event => {
        event.preventDefault();
        void save(event.currentTarget);
      }}>
        <h2>Edit {unit.barcode}</h2><p>Update the status, condition, or add a note.</p>
        <label>Status<select name="status" required defaultValue={unit.status}>
          {barcodeStatuses.map(status => <option key={status}>{status}</option>)}
        </select></label>
        <label>Condition<select name="condition" defaultValue={unit.condition}>
          <option value="">Leave unchanged</option>
          {barcodeConditions.map(condition => <option key={condition}>{condition}</option>)}
        </select></label>
        <label>Admin note (optional)<textarea name="note" maxLength={400}/></label>
        <div className="page-actions">
          <button type="button" className="button secondary" disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button>
          <button className="button primary" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </dialog>
  </>;
}

export function GenerateBarcodes({ region, production = false }: { region: Region; production?: boolean }) {
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<BarcodeVariant[] | null>(null);
  const [variant, setVariant] = useState<BarcodeVariant | null>(null);
  const [batch, setBatch] = useState<BarcodeLabel[]>([]);
  const [print, setPrint] = useState(false);
  const [pending, setPending] = useState<'search' | 'generate' | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (production && !variant) searchInput.current?.focus(); }, [production, variant]);
  useEffect(() => {
    if (!production || variant || term.trim().length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await readInventory<BarcodeVariant[]>('variants', term.trim(), region, abort.signal);
        if (!abort.signal.aborted) setMatches(results);
      } catch (error) {
        if (!abort.signal.aborted) setError(errorText(error));
      }
    }, 300);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [production, region, term, variant]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (production || busy.current) return;
    busy.current = true;
    setPending('search');
    setError('');
    setMatches(null);
    const term = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    try { setMatches(await readInventory<BarcodeVariant[]>('variants', term, region)); }
    catch (error) { setError(errorText(error)); }
    finally { busy.current = false; setPending(null); }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variant || busy.current) return;
    busy.current = true;
    setPending('generate');
    setError('');
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const result = await saveInventory<{ barcodes: string[] }>('barcode-generate', { ...values, sku: variant.sku }, region);
      setBatch(result.barcodes.map(barcode => ({ barcode, sku: variant.sku })));
    } catch (error) { setError(errorText(error)); }
    finally { busy.current = false; setPending(null); }
  }

  return <section className="panel padded barcode-form">
    <h2>New batch</h2>
    <p className="dim">{production ? 'Search a variant by product name or SKU, then set how many units you are labelling.' :
      'Choose a variant by product name or SKU, then enter the number of labels to generate.'}</p>
    {variant ? <div className="barcode-variant">
      <div><strong>{variant.name}</strong><small>{[variant.sku, variant.options].filter(Boolean).join(' · ')}</small></div>
      <button type="button" className="button secondary" disabled={!!pending} onClick={() => { setVariant(null); setError(''); }}>Change variant</button>
    </div> : <form onSubmit={search} className="stack-form">
      {production ? <label>Variant<span className="search-input"><Search size={16} aria-hidden="true"/>
        <input ref={searchInput} name="q" type="search" placeholder="Search product name or SKU…" maxLength={100}
          disabled={!!pending} value={term} onChange={event => {
            setTerm(event.currentTarget.value); setMatches(null); setError('');
          }}/></span></label> : <>
        <label>Product name or SKU<input name="q" type="search" maxLength={100} required disabled={!!pending}/></label>
        <div><button className="button secondary" disabled={!!pending}><Search size={16}/> {pending === 'search' ? 'Searching…' : 'Find variants'}</button></div>
      </>}
      {matches && (matches.length ? <ul className="barcode-variant-results" aria-label="Matching variants">
        {matches.map(match => <li key={match.sku}><button type="button" onClick={() => setVariant(match)}>
          <strong>{match.name}</strong><small>{[match.sku, match.options].filter(Boolean).join(' · ')}</small>
        </button></li>)}
      </ul> : <p role="status">No matching variants in this market.</p>)}
    </form>}
    <form className="stack-form" onSubmit={generate}>
      <label>Quantity<input name="quantity" type="number" min="1" max="100" defaultValue="1" required disabled={!!pending}/></label>
      <label>Admin note (optional)<textarea name="note" placeholder={production ? 'Reason / reference' : 'Reason or reference'} maxLength={400} rows={3} disabled={!!pending}/></label>
      <div><button className="button primary" disabled={!variant || !!pending}>{!production && <Barcode size={16}/>} {pending === 'generate' ? 'Generating…' : production ? 'Generate' : 'Generate labels'}</button></div>
    </form>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {!!batch.length && <div className="notice barcode-variant">
      <p role="status">Generated {batch.length} {batch.length === 1 ? 'label' : 'labels'} for {batch[0].sku}.</p>
      <button type="button" className="button secondary" onClick={() => setPrint(true)}><Printer size={16}/> Preview labels</button>
    </div>}
    {print && <BarcodePrint labels={batch} close={() => setPrint(false)}/>}
  </section>;
}

export function ReceiveBarcodes({ locations, region, purchases, production = false }: { locations: Choice[]; region: Region; purchases?: string; production?: boolean }) {
  const [units, setUnits] = useState<BarcodeLabel[]>([]);
  const [location, setLocation] = useState('');
  const [pending, setPending] = useState<'scan' | 'receive' | null>(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ count: number; id: string; number?: number }>();
  const scanInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (production) scanInput.current?.focus(); }, [production]);
  const busy = useRef(false);

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = scanInput.current;
    if (busy.current || !field || units.length >= receiptLimit) return;
    const barcode = field.value.trim();
    setError('');
    if (!barcodePattern.test(barcode) || units.some(unit => unit.barcode === barcode)) {
      setError(barcodePattern.test(barcode) ? 'This barcode is already in the receiving list.' : 'Enter a valid barcode.');
      field.select();
      return;
    }
    busy.current = true;
    setPending('scan');
    try {
      const unit = await readInventory<BarcodeLabel>('validate', barcode, region);
      setUnits(previous => [...previous, unit]);
      field.value = '';
    } catch (error) {
      setError(errorText(error));
      field.select();
    } finally {
      busy.current = false;
      setPending(null);
      field.focus();
    }
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !units.length || !location) return;
    busy.current = true;
    setPending('receive');
    setError('');
    setReceipt(undefined);
    const form = event.currentTarget;
    try {
      const values = Object.fromEntries(new FormData(form));
      const result = await saveInventory<{ purchaseId: string; purchaseNumber?: number }>('barcode-receive', {
        ...values, barcodes: units.map(unit => unit.barcode).join('\n'),
      }, region);
      setReceipt({ count: units.length, id: result.purchaseId, number: result.purchaseNumber });
      setUnits([]);
      form.reset();
      if (scanInput.current) {
        scanInput.current.value = '';
        scanInput.current.focus();
      }
    } catch (error) { setError(errorText(error)); }
    finally { busy.current = false; setPending(null); }
  }

  return <div className="barcode-form">
    <form id="receive-barcode-stock" className="panel padded stack-form" onSubmit={receive}>
      <h2>Receiving details</h2>
      {production && <p className="dim">Where are these units being received?</p>}
      <div className="barcode-form-columns">
        <label>Business location<select name="location" value={location} onChange={event => setLocation(event.target.value)} required disabled={!!pending}>
          <option value="">Select location</option>{locations.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></label>
        <label>Purchase date (optional)<input type="date" name="purchaseDate" disabled={!!pending}/></label>
      </div>
      <label>Note (optional)<textarea name="note" rows={3} maxLength={400} disabled={!!pending}/></label>
      {!locations.length && <p className="notice warn">There are no active receiving locations in this market.</p>}
    </form>
    <section className="panel padded barcode-form">
      <h2>Scan units</h2>
      <p className="dim">{production ? 'Each scan is validated (must be unused and have a default rate).' :
        'Scan an unused label or type its code and press Enter. Each variant needs a default purchase rate, and all units in a receipt must share a supplier.'}</p>
      <form onSubmit={scan} className="stack-form">
        {!production && <label htmlFor="inventory-scan">Scan or type a barcode</label>}
        <div className="barcode-scan-line">
          <span className={production ? 'search-input' : undefined}>{production && <Barcode size={16} aria-hidden="true"/>}
            <input id="inventory-scan" ref={scanInput} maxLength={60} autoComplete="off" spellCheck={false} required readOnly={!!pending}
              placeholder={production ? 'Scan or type a barcode, then Enter' : undefined} aria-label={production ? 'Scan or type a barcode' : undefined}/>
          </span>
          <button className="button secondary" disabled={!!pending || units.length >= receiptLimit}>{pending === 'scan' ? 'Checking…' : production ? 'Add' : 'Add scan'}</button>
        </div>
      </form>
      <p role="status" className="dim">{units.length} scanned{units.length === receiptLimit && ' · Receipt limit reached'}</p>
      {production && !units.length && <p className={productionStyles.receiveEmpty}>No units yet — start scanning.</p>}
      {!!units.length && <ul className="barcode-scan-list" aria-label="Scanned units">{units.map(unit => <li key={unit.barcode}>
        <span><code>{unit.barcode}</code><small>{unit.sku}</small></span>
        <button type="button" className="button subtle" aria-label={'Remove ' + unit.barcode} disabled={!!pending}
          onClick={() => setUnits(previous => previous.filter(row => row.barcode !== unit.barcode))}><X size={16}/> Remove</button>
      </li>)}</ul>}
      {error && <p className="notice warn" role="alert">{error}</p>}
      {receipt && <div className="notice barcode-variant">
        <p role="status">Received {receipt.count} {receipt.count === 1 ? 'unit' : 'units'}{receipt.number === undefined ? '.' : ` on purchase ${receipt.number}.`}</p>
        {purchases && /^[a-f\d]{24}$/i.test(receipt.id) && <Link className="button secondary" href={`${purchases}/${receipt.id}?region=${region}`}>View purchase</Link>}
      </div>}
      <div><button form="receive-barcode-stock" className="button primary" disabled={!location || !units.length || !!pending}>
        {pending === 'receive' ? 'Receiving…' : production ? `Receive ${units.length} unit(s)` : `Receive ${units.length} ${units.length === 1 ? 'unit' : 'units'}`}
      </button></div>
    </section>
  </div>;
}
