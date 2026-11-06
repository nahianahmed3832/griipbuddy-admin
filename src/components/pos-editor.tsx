'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';

type Discount = { type: string; value: string };
type Line = { sku: string; quantity: string; discount: Discount };
export type SaleDraft = {
  id?: string; revision?: string; location: string; customer: string; paymentMethod: string; paymentAccount: string;
  paid: string; note: string; paymentNote: string; discount: Discount; lines: Line[];
};
const blankLine: Line = { sku: '', quantity: '1', discount: { type: 'FLAT', value: '0' } };

function DiscountFields({ label, value, onChange }: { label: string; value: Discount; onChange: (value: Discount) => void }) {
  return <div className="editor-grid">
    <label>{label} type<select value={value.type} onChange={event => onChange({ ...value, type: event.target.value })}>
      <option value="FLAT">Flat amount</option><option value="PERCENTAGE">Percentage</option></select></label>
    <label>{label} value<input type="number" min="0" max={value.type === 'PERCENTAGE' ? '100' : undefined}
      step="0.01" required value={value.value} onChange={event => onChange({ ...value, value: event.target.value })}/></label>
  </div>;
}

export function PosEditor({ draft, locations, accounts }: {
  draft: SaleDraft; locations: { value: string; label: string }[]; accounts: { value: string; label: string }[];
}) {
  const [lines, setLines] = useState(draft.lines.length ? draft.lines : [blankLine]);
  const [overall, setOverall] = useState(draft.discount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState<{ subtotal: number; discount: number; total: number } | null>(null);
  const submitting = useRef(false);
  const requestId = useRef('');
  const router = useRouter();

  function changeLine(index: number, input: Partial<Line>) {
    setLines(current => current.map((line, row) => row === index ? { ...line, ...input } : line));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const review = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'review';
    if (!review && !quote) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    if (!requestId.current) requestId.current = crypto.randomUUID().replaceAll('-', '').slice(0, 24);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(adminPath('/api/workspace'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: review ? 'pos-quote' : 'pos', values: { ...values, id: draft.id, revision: draft.revision,
          requestId: requestId.current, discount: overall, lines } }),
      });
      if (!response.ok) { setError((await response.text()).slice(0, 300)); return; }
      const result = await response.json();
      if (review) { setQuote(result); return; }
      const { id } = result;
      router.push('/desk/pos/sales/' + encodeURIComponent(id));
      router.refresh();
    } catch {
      setError('The response was interrupted. Retry this form to use the same sale reference.');
    } finally { submitting.current = false; setBusy(false); }
  }

  return <form className="stack-form panel padded" onSubmit={submit} onChange={() => setQuote(null)}>
    <div className="editor-grid">
      <label>Sale location<select name="location" required defaultValue={draft.location}>
        <option value="" disabled>Choose a location</option>{locations.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
      </select></label>
      <label>Existing customer phone<input name="customer" type="tel" maxLength={17} defaultValue={draft.customer} placeholder="Optional for walk-in sales"/></label>
    </div>
    <h2>Sale items</h2>
    {lines.map((line, index) => <fieldset className="editor-fieldset" key={index}><legend>Item {index + 1}</legend>
      <div className="editor-grid">
        <label>Variant SKU<input required maxLength={100} value={line.sku} onChange={event => changeLine(index, { sku: event.target.value })}/></label>
        <label>Quantity<input required type="number" min="1" max="1000" value={line.quantity}
          onChange={event => changeLine(index, { quantity: event.target.value })}/></label>
      </div>
      <DiscountFields label="Item discount" value={line.discount} onChange={discount => changeLine(index, { discount })}/>
      {lines.length > 1 && <button type="button" className="button subtle" onClick={() => {
        setQuote(null);
        setLines(current => current.filter((_, row) => row !== index));
      }}>Remove item</button>}
    </fieldset>)}
    <button className="button secondary" type="button" disabled={lines.length >= 20} onClick={() => {
      setQuote(null);
      setLines(current => [...current, blankLine]);
    }}>Add item</button>
    <h2>Payment and sale details</h2>
    <DiscountFields label="Sale discount" value={overall} onChange={setOverall}/>
    <div className="editor-grid">
      <label>Payment method<select name="paymentMethod" defaultValue={draft.paymentMethod}>
        {[...new Set(['Cash','Bank transfer','Card',draft.paymentMethod])].map(method => <option key={method}>{method}</option>)}
      </select></label>
      <label>Payment account<select name="paymentAccount" defaultValue={draft.paymentAccount}>
        <option value="">None</option>{accounts.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
      </select></label>
      <label>Amount received (BDT)<input name="paid" type="number" required min="0" step="0.01" defaultValue={draft.paid}/></label>
      <label>Payment reference or note<input name="paymentNote" maxLength={500} defaultValue={draft.paymentNote}/></label>
    </div>
    <label>Sale note<textarea name="note" rows={3} maxLength={500} defaultValue={draft.note}/></label>
    {quote && <dl className="details-grid" aria-label="Sale totals">
      <div><dt>After item discounts</dt><dd>BDT {quote.subtotal.toFixed(2)}</dd></div>
      <div><dt>Sale discount</dt><dd>BDT {quote.discount.toFixed(2)}</dd></div>
      <div><dt>Total</dt><dd>BDT {quote.total.toFixed(2)}</dd></div>
    </dl>}
    {error && <p role="alert" className="notice warn">{error}</p>}
    <div className="page-actions"><button className="button secondary" value="review" disabled={busy}>Review totals</button>
      <button className="button primary" disabled={busy || !quote}>{busy ? 'Working…' : 'Save sale'}</button></div>
  </form>;
}
