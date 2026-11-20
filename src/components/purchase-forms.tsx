'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';
import { BarcodePrint } from './barcode-labels';
import type { BarcodeLabel } from '@/lib/barcode-data';
import { purchasesPath, remainingPosting, type Purchase, type PurchaseChoices, type ReviewedProposal, type VariantChoice } from '@/lib/purchasing';
import type { Region } from '@/lib/sections';

const get = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const opt = (form: FormData, name: string) => get(form, name) || undefined;
const integer = (form: FormData, name: string) => Number(get(form, name));
const barcodes = (form: FormData, name: string) => get(form, name).split(/\s|,/).filter(Boolean);
const amount = (form: FormData, name: string) => {
  const value = get(form, name);
  return value === '' ? null : Number(value);
};
const timezone = (region: Region) => region === 'BD' ? '+06:00' : 'Z';
function date(form: FormData, name: string, region: Region) {
  const value = get(form, name);
  return value ? value + (value.length === 16 ? ':00' : '') + timezone(region) : undefined;
}
function localTimestamp(at: string | undefined, region: Region) {
  if (!at) return undefined;
  return new Date(+new Date(at) + (region === 'BD' ? 6 * 3600_000 : 0)).toISOString().slice(0, 16);
}
function evidence(form: FormData, region: Region, prefix = '') {
  return { type: get(form, prefix + 'evidenceType') || 'document', reference: get(form, prefix + 'evidenceReference'),
    at: date(form, prefix + 'evidenceAt', region) ?? '', note: opt(form, prefix + 'evidenceNote') };
}

async function findVariant(region: Region, sku: string, supplier?: string): Promise<VariantChoice> {
  const search = new URLSearchParams({ region, sku: sku.trim() });
  if (supplier) search.set('supplier', supplier);
  const result = await fetch(adminPath('/api/operations/purchases/choices?' + search)).then(response => response.json());
  if (!result.success || !result.data?.item) throw new Error(result.message || 'No matching variant.');
  return result.data.item;
}

function EvidenceFields({ region, prefix = '', documentOnly = false, dated = false, required = true }: {
  region: Region; prefix?: string; documentOnly?: boolean; dated?: boolean; required?: boolean;
}) {
  return <fieldset className="po-fields po-evidence">
    <legend>Evidence</legend>
    {!documentOnly && <label>Evidence type<select name={prefix + 'evidenceType'}>
      <option value="manual">Manual operator report</option><option value="document">Referenced document</option>
    </select></label>}
    <label>Evidence reference<input name={prefix + 'evidenceReference'} required={required} maxLength={80} /></label>
    <label>Evidence date and time ({region === 'BD' ? 'Dhaka' : 'UTC'})
      <input name={prefix + 'evidenceAt'} type="datetime-local" step={dated ? 1 : undefined} required={dated} />
    </label>
    <label>Evidence notes<input name={prefix + 'evidenceNote'} maxLength={500} /></label>
  </fieldset>;
}

function Form({ region, id, title, children, action, fields, onSaved, onReset }: {
  region: Region; id?: string; title: string; children: ReactNode; action: string;
  fields: (form: FormData) => object; onSaved?: (result: { order?: string; id?: string }) => void; onReset?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState('');
  const element = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const last = useRef<{ body: string; data: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || saved) return;
    inFlight.current = true;
    setPending(true);
    setFeedback('');
    try {
      const input = { action, ...fields(new FormData(event.currentTarget)) };
      const body = JSON.stringify(input);
      if (!last.current || last.current.body !== body) last.current = {
        body, data: JSON.stringify({ ...input, key: crypto.randomUUID() }, (name, value) =>
          name === 'at' && value === '' ? new Date().toISOString() : value),
      };
      const response = await fetch(adminPath('/api/operations/purchases' + (id ? '/' + id : '') + '?region=' + region), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: last.current.data,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        setFeedback(result?.message ?? 'The request could not be confirmed. Check the purchase and retry with the same details.');
        return;
      }
      setSaved(true);
      const status = result.data?.status;
      setFeedback(status === 'reference-conflict' ? 'Reference conflict recorded for review. Stock did not change.' :
        status === 'reconciliation-required' ? 'Reconciliation issue opened. Stock did not change.' :
        status === 'inspection-needed' ? 'Receipt saved with a discrepancy for review.' :
        action === 'supplier-return' && status === 'dispatched' ? 'Supplier dispatch recorded and stock updated.' : 'Record saved.');
      if (onSaved) onSaved(result.data);
      else router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Check the latest purchase status before retrying.');
    } finally { inFlight.current = false; setPending(false); }
  }
  return <form className="po-form" ref={element} onSubmit={submit} onReset={onReset}>
    <fieldset className="po-fields" disabled={pending || saved}>{children}</fieldset>
    <div className="po-buttons"><button className="button primary" disabled={pending || saved} type="submit">{pending ? 'Saving…' : title}</button>
      {saved && !onSaved && <button className="button secondary" type="button" onClick={() => {
        if (onReset) element.current?.reset();
        last.current = null;
        setSaved(false);
        setFeedback('');
      }}>Record another</button>}
    </div>
    {feedback && <p role="status" className="po-feedback">{feedback}</p>}
  </form>;
}

export function QuoteForm({ region, choices, purchase, proposal }: {
  region: Region; choices: PurchaseChoices; purchase?: Purchase; proposal?: ReviewedProposal;
}) {
  const router = useRouter();
  const quote = purchase?.editor;
  const [supplier, setSupplier] = useState(quote?.supplier ?? proposal?.supplier ?? choices.suppliers[0]?._id ?? '');
  const [currency, setCurrency] = useState(quote?.currency ?? choices.item?.quoteCurrency ?? 'BDT');
  const [items, setItems] = useState<VariantChoice[]>(quote?.lines ?? (choices.item ? [choices.item] : []));
  const [sku, setSku] = useState('');
  const [finding, setFinding] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fxRate, setFxRate] = useState(quote?.fx?.rate ?? '');
  async function addItem() {
    if (!sku.trim() || finding) return;
    setFinding(true);
    setSearchError('');
    try {
      const item = await findVariant(region, sku, supplier);
      if (items.some(row => row.variant === item.variant)) throw new Error('That variant is already on this order.');
      if (items.length >= 12) throw new Error('Use up to 12 variants per purchase order.');
      setItems(rows => [...rows, item]);
      setSku('');
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'The SKU could not be loaded.');
    } finally {
      setFinding(false);
    }
  }
  return <Form id={purchase?.id} region={region} title={purchase ? 'Save quote revision' : 'Save purchase draft'} action={purchase ? 'edit' : 'draft'}
    onSaved={result => { if (result.order) router.push(purchasesPath + '/' + result.order + '?region=' + region); router.refresh(); }}
    fields={form => ({
      ...(purchase && { revision: purchase.revision }), ...(!purchase && proposal && { proposal: proposal.id }),
      quote: {
        supplier: get(form, 'supplier'), supplierReference: opt(form, 'supplierReference'), warehouse: get(form, 'warehouse'),
        currency, lines: items.map((item, index) => ({
          variant: item.variant, supplierSku: opt(form, 'supplierSku' + index),
          ...(supplier === (quote?.supplier ?? proposal?.supplier ?? choices.suppliers[0]?._id) && item.sourceVariant && { sourceVariant: item.sourceVariant }),
          quantity: integer(form, 'quantity' + index), purchasingUnit: get(form, 'unit' + index),
          unitsPerPurchase: integer(form, 'conversion' + index), conversionReference: opt(form, 'conversionRef' + index),
          unitMinor: amount(form, 'unitPrice' + index),
        })),
        freightMinor: amount(form, 'freight'), taxMinor: amount(form, 'tax'), otherMinor: amount(form, 'other'),
        otherReference: opt(form, 'otherRef'), deliveryTerms: opt(form, 'deliveryTerms'), paymentTerms: opt(form, 'paymentTerms'),
        quoteReference: opt(form, 'quoteReference'), expiresAt: date(form, 'expiresAt', region),
        ...(currency !== 'BDT' && opt(form, 'rate') && { fx: { rate: get(form, 'rate'), evidence: evidence(form, region, 'fx') } }),
      },
    })}>
    <div className="po-grid">
      <label>Supplier<select name="supplier" value={supplier} onChange={event => setSupplier(event.target.value)} required>
        <option value="">Choose supplier</option>
        {choices.suppliers.map(row => <option key={row._id} value={row._id}>{row.name} ({row.contact_id})</option>)}
      </select></label>
      <label>Supplier reference<input name="supplierReference" maxLength={80} defaultValue={quote?.supplierReference} /></label>
      <label>Delivery warehouse<select name="warehouse" required defaultValue={quote?.warehouse}>
        {choices.warehouses.map(row => <option key={row._id} value={row._id}>{row.name || row.business_location_name}</option>)}
      </select></label>
      <label>Purchasing currency<input name="currency" value={currency} onChange={event => setCurrency(event.target.value.toUpperCase())}
        required minLength={3} maxLength={3} pattern="[A-Z]{3}" /></label>
    </div>
    {!proposal && <div className="po-add"><label>Find internal SKU<input value={sku} onChange={event => setSku(event.target.value)} /></label>
      <button type="button" className="button secondary" disabled={finding || !sku.trim()} onClick={() => void addItem()}>Add variant</button>
      {searchError && <p role="status">{searchError}</p>}
    </div>}
    {proposal && <p>Approved inventory recommendation for {proposal.quantity} stock units.</p>}
    {items.map((item, index) => {
      const line = quote?.lines.find(row => row.variant === item.variant);
      return <fieldset className="po-card po-fields" key={item.variant}>
        <legend>{item.sku} · {item.name}</legend>
        <div className="po-grid">
          <label>Supplier SKU<input name={'supplierSku' + index} defaultValue={line?.supplierSku ?? item.supplierSku} maxLength={100} /></label>
          <label>Order quantity<input name={'quantity' + index} type="number" min="1" max="100000" required defaultValue={line?.quantity ?? proposal?.quantity ?? 1} /></label>
          <label>Purchasing unit<select name={'unit' + index} defaultValue={line?.purchasingUnit ?? 'unit'}>
            <option value="unit">Unit</option><option value="pack">Pack</option><option value="box">Box</option><option value="case">Case</option>
          </select></label>
          <label>Stock units per purchasing unit<input name={'conversion' + index} type="number" min="1" max="100000" required defaultValue={line?.unitsPerPurchase ?? 1} /></label>
          <label>Conversion evidence reference<input name={'conversionRef' + index} maxLength={80} defaultValue={line?.conversionReference} /></label>
          <label>Quoted unit price in minor units<input key={currency} name={'unitPrice' + index} type="number" min="0" step="1"
            defaultValue={line && quote?.currency === currency ? line.unitMinor ?? undefined :
              item.quoteCurrency === currency ? item.quoteUnitMinor ?? undefined : undefined} /></label>
        </div>
        {!proposal && <div><button className="button secondary" type="button" onClick={() => setItems(rows => rows.filter(row => row.variant !== item.variant))}>Remove {item.sku}</button></div>}
      </fieldset>;
    })}
    <p className="po-hint">Enter amounts in minor units. BDT 150.00 is 15000. Leave unknown amounts blank and enter 0 only for a confirmed zero charge.</p>
    <div className="po-grid" key={currency}>
      <label>Freight<input type="number" min="0" name="freight" defaultValue={quote?.currency === currency ? quote.freightMinor ?? undefined : undefined} /></label>
      <label>Tax<input type="number" min="0" name="tax" defaultValue={quote?.currency === currency ? quote.taxMinor ?? undefined : undefined} /></label>
      <label>Other charges<input type="number" min="0" name="other" defaultValue={quote?.currency === currency ? quote.otherMinor ?? undefined : undefined} /></label>
      <label>Other charge reference<input name="otherRef" maxLength={80} defaultValue={quote?.otherReference} /></label>
    </div>
    <div className="po-grid">
      <label>Quote or source reference<input name="quoteReference" maxLength={80} defaultValue={quote?.quoteReference ?? choices.item?.quoteReference} /></label>
      <label>Quote expiry ({region === 'BD' ? 'Dhaka' : 'UTC'})<input name="expiresAt" type="datetime-local" defaultValue={localTimestamp(quote?.expiresAt, region)} /></label>
      <label>Delivery terms<textarea name="deliveryTerms" maxLength={400} defaultValue={quote?.deliveryTerms} /></label>
      <label>Payment terms<textarea name="paymentTerms" maxLength={400} defaultValue={quote?.paymentTerms} /></label>
    </div>
    {currency !== 'BDT' && <fieldset className="po-card po-fields"><legend>Warehouse cost conversion to BDT</legend>
      <label>BDT per {currency || 'purchasing currency'}<input name="rate" value={fxRate} onChange={event => setFxRate(event.target.value)} /></label>
      <EvidenceFields region={region} prefix="fx" dated={Boolean(fxRate.trim())} required={Boolean(fxRate.trim())} />
    </fieldset>}
  </Form>;
}

export function SupplierForm({ region, suppliers }: { region: Region; suppliers: PurchaseChoices['suppliers'] }) {
  const [selected, setSelected] = useState('');
  const current = suppliers.find(row => row._id === selected);
  return <Form region={region} title="Save supplier" action="supplier" fields={form => ({
    id: selected || undefined, name: get(form, 'name'), contactId: integer(form, 'contactId'), phone: opt(form, 'phone'),
    email: opt(form, 'email'), address: opt(form, 'address'), paymentTerms: opt(form, 'paymentTerms'),
  })}>
    <label>Supplier record<select value={selected} onChange={event => setSelected(event.target.value)}>
      <option value="">New record</option>{suppliers.map(row => <option key={row._id} value={row._id}>{row.name}</option>)}
    </select></label>
    <div className="po-grid" key={selected}>
      <label>Supplier name<input name="name" required defaultValue={current?.name} maxLength={120} /></label>
      <label>Supplier contact ID<input name="contactId" type="number" min="1" max="999999999" required defaultValue={current?.contact_id} /></label>
      <label>Phone<input name="phone" type="tel" defaultValue={current?.phone} maxLength={40} /></label>
      <label>Email<input name="email" type="email" defaultValue={current?.email} maxLength={200} /></label>
      <label>Address<input name="address" defaultValue={current?.address} maxLength={350} /></label>
      <label>Default payment terms<input name="paymentTerms" defaultValue={current?.default_payment_terms} maxLength={350} /></label>
    </div>
  </Form>;
}

export function PurchaseControls({ region, purchase }: { region: Region; purchase: Purchase }) {
  const { id, revision, quote } = purchase;
  if (!quote) return null;
  return <>
    {!purchase.approvedAt && <Form id={id} region={region} action="approve" title="Approve this version" fields={() => ({ revision, quoteHash: quote.hash })}>
      <label className="po-check"><input type="checkbox" required /> I checked the supplier, quantity, total and terms shown above.</label>
    </Form>}
    {purchase.approvedAt && !purchase.canReceive && <details><summary>Reopen internal approval</summary>
      <Form id={id} region={region} action="reopen" title="Reopen draft" fields={form => ({ revision, reason: get(form, 'reason') })}>
        <label>Reason<input name="reason" required minLength={8} maxLength={500} /></label>
      </Form>
    </details>}
    {purchase.approvedAt && <details open={!purchase.canReceive}><summary>Record supplier communication</summary>
      <Form id={id} region={region} action="communication" title="Record supplier update" fields={form => ({
        revision, stage: get(form, 'stage'), acknowledged: true, expectedAt: date(form, 'expectedAt', region), evidence: evidence(form, region),
      })}>
        <div className="po-grid">
          <label>Reported stage<select name="stage" defaultValue={purchase.canReceive ? 'dispatched' : 'confirmed'}>
            {!purchase.canReceive && <><option value="sent">Sent by staff</option><option value="confirmed">Supplier confirmed</option></>}
            {purchase.canReceive && <option value="dispatched">Supplier reported dispatch</option>}
            <option value="cancelled">Supplier accepted cancellation</option>
          </select></label>
          <label>Expected delivery ({region === 'BD' ? 'Dhaka' : 'UTC'})<input name="expectedAt" type="datetime-local" /></label>
        </div>
        <EvidenceFields region={region} />
        <label className="po-check"><input type="checkbox" required /> I am recording a supplier action that already occurred.</label>
      </Form>
    </details>}
    {purchase.canReceive && !purchase.closed && purchase.totals.some(row => row.expected) && <details><summary>Close undelivered remainder</summary>
      <Form id={id} region={region} action="close" title="Close the undelivered units" fields={form => ({ revision, reason: get(form, 'reason'), evidence: evidence(form, region) })}>
        <label>Closure reason<input name="reason" required minLength={8} maxLength={500} /></label>
        <EvidenceFields region={region} />
      </Form>
    </details>}
  </>;
}

export function ReceivingForm({ region, purchase }: { region: Region; purchase: Purchase }) {
  const [extra, setExtra] = useState(false);
  const [extraSku, setExtraSku] = useState('');
  const [variant, setVariant] = useState<VariantChoice>();
  const [finding, setFinding] = useState(false);
  const [searchError, setSearchError] = useState('');
  function setAdditional(enabled: boolean) {
    setExtra(enabled);
    setVariant(undefined);
    setExtraSku('');
    setSearchError('');
  }
  async function identifyExtra() {
    setFinding(true);
    setSearchError('');
    try {
      const result = await findVariant(region, extraSku);
      if (purchase.lines.some(row => row.variant === result.variant)) throw new Error('Use the existing order line for that SKU.');
      setVariant(result);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'The SKU could not be loaded.');
    } finally { setFinding(false); }
  }
  return <Form id={purchase.id} region={region} action="receipt" title="Finalize physical receipt" onReset={() => setAdditional(false)} fields={form => {
    const lines = purchase.lines.map((row, index) => ({
      variant: row.variant, received: integer(form, 'seen' + index), accepted: integer(form, 'accepted' + index),
      held: integer(form, 'held' + index), rejected: integer(form, 'rejected' + index), barcodes: barcodes(form, 'labels' + index),
    })).filter(line => line.received || line.accepted || line.held || line.rejected || line.barcodes.length);
    if (extra) {
      const received = integer(form, 'unidentified');
      const rejected = integer(form, 'unidentifiedRejected');
      return { at: date(form, 'at', region) ?? '', deliveryReference: opt(form, 'deliveryReference'), evidenceReference: opt(form, 'evidenceReference'),
        note: opt(form, 'note'), physicallyCounted: true, lines: [...lines, {
          variant: variant?.variant, reportedItem: opt(form, 'reportedItem'), received,
          accepted: 0, held: received - rejected, rejected, barcodes: [],
        }] };
    }
    return { at: date(form, 'at', region) ?? '', deliveryReference: opt(form, 'deliveryReference'), evidenceReference: opt(form, 'evidenceReference'),
      note: opt(form, 'note'), physicallyCounted: true, lines };
  }}>
    <div className="po-grid">
      <label>Received at ({region === 'BD' ? 'Dhaka' : 'UTC'})<input name="at" type="datetime-local" step="1" /></label>
      <label>Supplier delivery reference<input name="deliveryReference" maxLength={80} /></label>
      <label>Supporting evidence reference<input name="evidenceReference" maxLength={80} /></label>
      <label>Receipt notes<textarea name="note" maxLength={500} /></label>
    </div>
    {purchase.lines.map((row, index) => <fieldset className="po-card po-fields" key={row.variant}>
      <legend>{row.sku} · {row.name}</legend>
      <div className="po-grid">
        {([['seen', 'Physically received'], ['accepted', 'Accepted for sale'], ['held', 'Held for inspection'], ['rejected', 'Damaged or rejected']] as const).map(([field, label]) =>
          <label key={field}>{label}<input name={field + index} type="number" min="0" max="500" inputMode="numeric" defaultValue="0" aria-label={label + ' ' + row.sku} /></label>)}
      </div>
      <label>Existing unused labels (leave blank to generate)<textarea name={'labels' + index} placeholder="One barcode per line" /></label>
    </fieldset>)}
    <label className="po-check"><input type="checkbox" checked={extra} onChange={event => setAdditional(event.target.checked)} /> Report an additional or unidentified variant</label>
    {extra && <div className="po-grid">
      <div className="po-add">
        <label>Additional internal SKU<input value={extraSku} onChange={event => {
          setExtraSku(event.target.value);
          setVariant(undefined);
          setSearchError('');
        }} /></label>
        <button type="button" className="button secondary" disabled={finding || !extraSku.trim()} onClick={() => void identifyExtra()}>Find variant</button>
        {variant && <p role="status">{variant.sku} · {variant.name}</p>}
        {searchError && <p role="status">{searchError}</p>}
      </div>
      <label>Actual supplier SKU or item description<input name="reportedItem" maxLength={100} required={!variant} /></label>
      <label>Additional units physically received<input name="unidentified" type="number" min="1" max="500" required /></label>
      <label>Additional units damaged or rejected<input name="unidentifiedRejected" type="number" min="0" max="500" defaultValue="0" /></label>
    </div>}
    <label className="po-check"><input type="checkbox" disabled={finding} required /> I physically counted these stock units at this warehouse.</label>
  </Form>;
}

export function SupplierReturnForm({ region, purchase }: { region: Region; purchase: Purchase }) {
  const eligible = purchase.postings.filter(post => remainingPosting(post) > 0);
  const [selected, setSelected] = useState('');
  const posting = eligible.find(post => post._id === selected);
  return <section className="ops-panel" aria-labelledby="supplier-return-heading" id="supplier-returns">
    <h2 id="supplier-return-heading">Supplier returns</h2>
    <p>Record a dispatch from its original receipt lot. The warehouse verifies that the scanned units are available before deducting them.</p>
    {!eligible.length ? <p className="po-hint">No original postings have units remaining for a supplier return.</p> :
      <Form id={purchase.id} region={region} action="supplier-return" title="Record supplier dispatch" fields={form => ({
        posting: get(form, 'posting'), quantity: integer(form, 'quantity'), reason: get(form, 'reason'),
        evidence: evidence(form, region), barcodes: barcodes(form, 'barcodes'), dispatched: form.get('dispatched') === 'on',
      })}>
        <div className="po-grid">
          <label>Original receipt posting<select name="posting" required value={posting?._id ?? ''} onChange={event => setSelected(event.target.value)}>
            <option value="">Choose a posting</option>{eligible.map(post => {
              const receipt = purchase.receiptLines.find(line => line._id === post.line);
              return <option key={post._id} value={post._id}>
                {receipt?.sku || 'Variant'} · lot {post.lot.slice(-8)} · {remainingPosting(post)} remaining from receipt
              </option>;
            })}
          </select></label>
          <label>Units dispatched<input name="quantity" type="number" min="1"
            max={posting ? Math.min(500, remainingPosting(posting)) : 500} required /></label>
          <label>Reason for return<input name="reason" minLength={8} maxLength={500} required /></label>
          <label>Original unit labels<textarea name="barcodes" placeholder="One barcode per line" required /></label>
        </div>
        <EvidenceFields region={region} dated />
        <label className="po-check"><input type="checkbox" name="dispatched" required /> These units were handed off for return to the supplier.</label>
      </Form>}
  </section>;
}

export function CorrectionsForm({ region, purchase }: { region: Region; purchase: Purchase }) {
  const held = purchase.receiptLines.filter(row => row.held > 0);
  const post = purchase.postings.filter(row => remainingPosting(row) > 0);
  return <>
    {!!held.length && <details><summary>Release held goods after inspection</summary>
      <Form id={purchase.id} region={region} action="release" title="Release inspected units" fields={form => ({
        line: get(form, 'line'), quantity: integer(form, 'quantity'), reason: get(form, 'reason'), variant: opt(form, 'variant'),
        evidence: evidence(form, region), resolvedReference: opt(form, 'resolvedReference'),
        ...(amount(form, 'cost') !== null && { cost: { unitMinor: amount(form, 'cost'), evidence: evidence(form, region) } }),
        barcodes: barcodes(form, 'barcodes'),
      })}>
        <div className="po-grid">
          <label>Held receipt line<select name="line">{held.map(row => <option value={row._id} key={row._id}>{row.sku ?? row.item} · {row.held} held · {row._id.slice(-8)}</option>)}</select></label>
          <label>Quantity to release<input name="quantity" type="number" min="1" max="500" required /></label>
          <label>Catalog variant ID for an unidentified item<input name="variant" pattern="[0-9a-fA-F]{24}" /></label>
          <label>Resolved delivery reference<input name="resolvedReference" maxLength={80} /></label>
          <label>Verified BDT unit cost for excess or unexpected goods (minor units)<input name="cost" type="number" min="0" /></label>
          <label>Inspection reason<input name="reason" required minLength={8} maxLength={500} /></label>
          <label>Unused unit labels (optional)<textarea name="barcodes" /></label>
        </div>
        <EvidenceFields region={region} />
      </Form>
    </details>}
    {!!post.length && <details><summary>Correct a posted receipt</summary>
      <Form id={purchase.id} region={region} action="correct" title="Move misstated units to inspection" fields={form => ({
        posting: get(form, 'posting'), quantity: integer(form, 'quantity'), reason: get(form, 'reason'),
        evidence: evidence(form, region), barcodes: barcodes(form, 'barcodes'),
      })}>
        <div className="po-grid">
          <label>Original stock posting<select name="posting">{post.map(row => <option value={row._id} key={row._id}>{row._id.slice(-8)} · {remainingPosting(row)} eligible units</option>)}</select></label>
          <label>Quantity to correct<input name="quantity" type="number" min="1" max="500" required /></label>
          <label>Correction reason<input name="reason" required minLength={8} maxLength={500} /></label>
          <label>Original unit labels (required for tracked units)<textarea name="barcodes" /></label>
        </div>
        <EvidenceFields region={region} />
      </Form>
    </details>}
  </>;
}

function SupplierReturnFinance({ region, purchase }: { region: Region; purchase: Purchase }) {
  const returns = purchase.audit.filter(row => row.kind === 'supplier-return');
  const credits = purchase.finance?.records.filter(row => row.kind === 'supplier-credit' && (row.refundableMinor ?? 0) > 0) ?? [];
  const [selectedCredit, setSelectedCredit] = useState('');
  const credit = credits.find(row => row.id === selectedCredit);
  return <>
    {!!returns.length && <details><summary>Record supplier credit</summary>
      <Form id={purchase.id} region={region} action="supplier-credit" title="Record credit document" fields={form => ({
        supplierReturn: get(form, 'supplierReturn'), amountMinor: integer(form, 'amount'), currency: get(form, 'currency'), evidence: evidence(form, region),
      })}>
        <div className="po-grid">
          <label>Dispatched supplier return<select name="supplierReturn" required defaultValue="">
            <option value="">Choose a return</option>{returns.map(row => <option key={row.id} value={row.id}>
              {row.payload?.evidence?.reference || row.id.slice(-8)} · {row.payload?.quantity} units
            </option>)}
          </select></label>
          <label>Credit document currency<input name="currency" defaultValue={purchase.quote?.currency} required minLength={3} maxLength={3} pattern="[A-Z]{3}" /></label>
          <label>Credit amount in minor units<input type="number" name="amount" min="1" required /></label>
        </div>
        <EvidenceFields region={region} documentOnly dated />
      </Form>
    </details>}
    {!!credits.length && <details><summary>Record money received from supplier</summary>
      <Form id={purchase.id} region={region} action="supplier-refund" title="Record money received" fields={form => ({
        credit: get(form, 'credit'), amountMinor: integer(form, 'amount'), currency: credit?.currency, evidence: evidence(form, region),
      })}>
        <div className="po-grid">
          <label>Supplier credit<select name="credit" required value={credit?.id ?? ''} onChange={event => setSelectedCredit(event.target.value)}>
            <option value="">Choose a credit</option>{credits.map(row => <option key={row.id} value={row.id}>
              {row.evidence.reference} · {row.refundableMinor} {row.currency} minor units remaining
            </option>)}
          </select></label>
          <label>Amount received in minor units{credit && ` (${credit.currency})`}<input type="number" name="amount"
            min="1" max={credit?.refundableMinor} required /></label>
        </div>
        <EvidenceFields region={region} documentOnly dated />
      </Form>
    </details>}
  </>;
}

export function FinanceForms({ region, purchase }: { region: Region; purchase: Purchase }) {
  const unverified = purchase.finance?.records.filter(row => row.kind === 'payment' && !row.staffVerified) ?? [];
  return <>
    {(['invoice', 'payment'] as const).map(action => <details key={action}><summary>Record {action === 'invoice' ? 'supplier invoice' : 'payment evidence'}</summary>
      <Form id={purchase.id} region={region} title={action === 'invoice' ? 'Record invoice' : 'Record existing payment'} action={action} fields={form => ({
        amountMinor: integer(form, 'amount'), currency: get(form, 'currency'), evidence: evidence(form, region),
        ...(action === 'payment' && { invoiceReference: opt(form, 'invoice') }),
      })}>
        <div className="po-grid">
          <label>Currency<input name="currency" defaultValue={purchase.quote?.currency} required minLength={3} maxLength={3} pattern="[A-Z]{3}" /></label>
          <label>Amount in minor units<input name="amount" type="number" min={action === 'invoice' ? '0' : '1'} required /></label>
          {action === 'payment' && <label>Matched invoice reference<input name="invoice" maxLength={80} /></label>}
        </div>
        <EvidenceFields region={region} />
      </Form>
    </details>)}
    {!!unverified.length && <details><summary>Verify a recorded payment</summary>
      <Form id={purchase.id} region={region} title="Record staff verification" action="verify-payment" fields={form => ({
        payment: get(form, 'payment'), evidence: evidence(form, region),
      })}>
        <label>Unverified payment<select name="payment">{unverified.map(row => <option key={row.id} value={row.id}>{row.evidence.reference}</option>)}</select></label>
        <EvidenceFields region={region} documentOnly />
      </Form>
    </details>}
    <SupplierReturnFinance region={region} purchase={purchase} />
  </>;
}

export function PrintPurchase() {
  return <button className="button secondary" type="button" onClick={() => window.print()}>Print or save PDF</button>;
}

export function ReceiptLabels({ region, id, posting }: { region: Region; id: string; posting: string }) {
  const [labels, setLabels] = useState<BarcodeLabel[]>([]);
  const [message, setMessage] = useState('');
  async function load() {
    setMessage('');
    try {
      const response = await fetch(adminPath('/api/operations/purchases/' + id + '/labels/' + posting + '?region=' + region));
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error('Labels could not be loaded.');
      if (!data.data.length) setMessage('No available units remain for this posting.');
      else setLabels(data.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Labels could not be loaded.');
    }
  }
  return <><button type="button" className="button secondary" onClick={() => void load()}>Print stock labels</button>
    {message && <span role="status">{message}</span>}
    {!!labels.length && <BarcodePrint labels={labels} close={() => setLabels([])} />}
  </>;
}
