'use client';

import Link from 'next/link';
import { Barcode, Printer, Search, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { barcodePattern, receiptLimit, type BarcodeLabel, type BarcodeVariant } from '@/lib/barcode-data';
import type { Choice } from '@/lib/operations';
import type { Region } from '@/lib/sections';
import { BarcodePrint } from './barcode-labels';

async function readInventory<T>(action: 'variants' | 'validate', q: string, region: Region): Promise<T> {
  const query = new URLSearchParams({ action, q, region });
  const response = await fetch(adminPath('/api/smart-inventory') + '?' + query);
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

export function GenerateBarcodes({ region }: { region: Region }) {
  const [matches, setMatches] = useState<BarcodeVariant[] | null>(null);
  const [variant, setVariant] = useState<BarcodeVariant | null>(null);
  const [batch, setBatch] = useState<BarcodeLabel[]>([]);
  const [print, setPrint] = useState(false);
  const [pending, setPending] = useState<'search' | 'generate' | null>(null);
  const [error, setError] = useState('');
  const busy = useRef(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
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
    <p className="dim">Choose a variant by product name or SKU, then enter the number of labels to generate.</p>
    {variant ? <div className="barcode-variant">
      <div><strong>{variant.name}</strong><small>{[variant.sku, variant.options].filter(Boolean).join(' · ')}</small></div>
      <button type="button" className="button secondary" disabled={!!pending} onClick={() => { setVariant(null); setError(''); }}>Change variant</button>
    </div> : <form onSubmit={search} className="stack-form">
      <label>Product name or SKU<input name="q" type="search" maxLength={100} required disabled={!!pending}/></label>
      <div><button className="button secondary" disabled={!!pending}><Search size={16}/> {pending === 'search' ? 'Searching…' : 'Find variants'}</button></div>
      {matches && (matches.length ? <ul className="barcode-variant-results" aria-label="Matching variants">
        {matches.map(match => <li key={match.sku}><button type="button" onClick={() => setVariant(match)}>
          <strong>{match.name}</strong><small>{[match.sku, match.options].filter(Boolean).join(' · ')}</small>
        </button></li>)}
      </ul> : <p role="status">No matching variants in this market.</p>)}
    </form>}
    <form className="stack-form" onSubmit={generate}>
      <label>Quantity<input name="quantity" type="number" min="1" max="100" defaultValue="1" required disabled={!!pending}/></label>
      <label>Admin note (optional)<textarea name="note" placeholder="Reason or reference" maxLength={400} rows={3} disabled={!!pending}/></label>
      <div><button className="button primary" disabled={!variant || !!pending}><Barcode size={16}/> {pending === 'generate' ? 'Generating…' : 'Generate labels'}</button></div>
    </form>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {!!batch.length && <div className="notice barcode-variant">
      <p role="status">Generated {batch.length} {batch.length === 1 ? 'label' : 'labels'} for {batch[0].sku}.</p>
      <button type="button" className="button secondary" onClick={() => setPrint(true)}><Printer size={16}/> Preview labels</button>
    </div>}
    {print && <BarcodePrint labels={batch} close={() => setPrint(false)}/>}
  </section>;
}

export function ReceiveBarcodes({ locations, region, purchases }: { locations: Choice[]; region: Region; purchases?: string }) {
  const [units, setUnits] = useState<BarcodeLabel[]>([]);
  const [location, setLocation] = useState('');
  const [pending, setPending] = useState<'scan' | 'receive' | null>(null);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ count: number; id: string; number?: number }>();
  const scanInput = useRef<HTMLInputElement>(null);
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
      <p className="dim">Scan an unused label or type its code and press Enter. Each variant needs a default purchase rate, and all units in a receipt must share a supplier.</p>
      <form onSubmit={scan} className="stack-form">
        <label htmlFor="inventory-scan">Scan or type a barcode</label>
        <div className="barcode-scan-line">
          <input id="inventory-scan" ref={scanInput} maxLength={60} autoComplete="off" spellCheck={false} required readOnly={!!pending}/>
          <button className="button secondary" disabled={!!pending || units.length >= receiptLimit}>{pending === 'scan' ? 'Checking…' : 'Add scan'}</button>
        </div>
      </form>
      <p role="status" className="dim">{units.length} scanned{units.length === receiptLimit && ' · Receipt limit reached'}</p>
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
        {pending === 'receive' ? 'Receiving…' : `Receive ${units.length} ${units.length === 1 ? 'unit' : 'units'}`}
      </button></div>
    </section>
  </div>;
}
