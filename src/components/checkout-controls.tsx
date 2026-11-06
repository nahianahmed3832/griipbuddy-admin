'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownToLine, CreditCard, Truck } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import type { CheckoutSnapshot, MarketSettings } from '@/lib/checkout';
import { Badge } from './tables';

function useMutation() {
  const router = useRouter();
  const [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false);
  async function submit(body: unknown, onSaved?: () => void) {
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(adminPath('/api/checkout'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setStatus(payload.error || 'Could not save the change.');
        return;
      }
      setStatus('Saved');
      onSaved?.();
      router.refresh();
    } catch { setStatus('Checkout sandbox is unavailable.'); } finally { setBusy(false); }
  }
  return {busy,status,submit};
}

function MinorLabel({ currency, amount }: { currency:string; amount:number }) {
  const formatter = new Intl.NumberFormat('en',{ style:'currency',currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return <>{formatter.format(amount/Math.pow(10,digits))}</>;
}

function MarketCard({ market, settings, revision, providers, shipping }: {
  market:'BD'|'US';settings:MarketSettings;revision:number;providers:CheckoutSnapshot['providers'];shipping:boolean;
}) {
  const action = useMutation();
  const currency = market === 'BD' ? 'BDT' : 'USD';
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const checked = (key:string) => form.get(key) === 'on';
    const shippingValue = form.get('shipping');
    const configured: MarketSettings = shipping
      ? {...settings, shipping:typeof shippingValue === 'string' && shippingValue.trim() !== '' ? Number(shippingValue) : null}
      : { ...settings, cod:checked('cod'), manual:checked('manual') ? {advancePercent:Number(form.get('advance'))} : null,
        paypal:providers.paypal ? checked('paypal') : settings.paypal, stripe:providers.stripe ? checked('stripe') : settings.stripe };
    void action.submit({action:'settings',market,revision,settings:configured});
  }
  return <section className="panel checkout-card">
    <div className="panel-header"><div><h2>{market === 'BD' ? 'Bangladesh' : 'United States'}</h2><p>{market} · {currency} · Sandbox</p></div>
      <span className="tile-icon purple">{shipping ? <Truck size={19}/> : <CreditCard size={19}/>}</span></div>
    <form onSubmit={save} className="stack-form padded">
      {shipping ? <>
        <label>Shipping fee ({currency} minor units)<input name="shipping" type="number" min="0" max="1000000000" defaultValue={settings.shipping ?? ''}/></label>
        <p>Clear the fee to disable shipping for this sandbox market.</p>
      </> : <>
        <div className="switch-list">
          <Option name="cod" title="Cash on Delivery" checked={settings.cod}>Payment collected at delivery.</Option>
          <Option name="manual" title="Manual advance" checked={!!settings.manual}>Staff review phone, reference and proof of payment.</Option>
          <Option name="paypal" title="PayPal" checked={settings.paypal && providers.paypal} disabled={!providers.paypal}>{providers.paypal ? 'Simulator connected' : 'Simulator key unavailable'}</Option>
          <Option name="stripe" title="Stripe" checked={settings.stripe && providers.stripe} disabled={!providers.stripe}>{providers.stripe ? 'Simulator connected' : 'Simulator key unavailable'}</Option>
        </div>
        <label>Manual advance percentage<input type="number" name="advance" min="1" max="100" defaultValue={settings.manual?.advancePercent ?? 20} required/></label>
      </>}
      <div className="page-actions"><span role="status" className="muted">{action.status}</span><button className="button primary" disabled={action.busy}>{action.busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  </section>;
}

function Option({name,title,checked,disabled,children}:{name:string;title:string;checked:boolean;disabled?:boolean;children:ReactNode}) {
  return <label className="switch-row"><span><strong>{title}</strong><small>{children}</small></span><input type="checkbox" name={name} defaultChecked={checked} disabled={disabled}/></label>;
}

function Fallback({ current, revision }: { current:string;revision:number }) {
  const action=useMutation();
  return <section className="panel"><div className="panel-header"><div><h2>International fallback</h2><p>Fallback catalog when the destination has no active market.</p></div></div>
    <form className="filters" onSubmit={event => {
      event.preventDefault(); const data=new FormData(event.currentTarget);
      void action.submit({action:'settings',revision,fallback:data.get('fallback')});
    }}>
      <label className="filter-label">Fallback catalog<select name="fallback" defaultValue={current}><option value="US">United States</option><option value="GB">United Kingdom</option></select></label>
      <button className="button primary" disabled={action.busy}>Save fallback</button><span className="muted" role="status">{action.status}</span>
    </form>
  </section>;
}

function ReceiptReview({ order }: {order:CheckoutSnapshot['queue'][number]}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const action=useMutation();
  const [evidence,setEvidence]=useState<{phone:string;reference:string} | null>(null);
  const receiptPath = adminPath('/api/checkout?receipt='+encodeURIComponent(order.id));
  async function review() {
    setEvidence(null);
    dialog.current?.showModal();
    try {
      const response = await fetch(receiptPath+'&format=metadata');
      if (response.ok) setEvidence(await response.json());
    } catch { /* The operator can reopen to retry. */ }
  }
  return <>
    <button className="button secondary" onClick={() => void review()}>Review receipt</button>
    <dialog ref={dialog} className="form-dialog" aria-label={'Review '+order.number}>
      <form className="stack-form" onSubmit={event => {
        event.preventDefault(); const form=new FormData(event.currentTarget);
        void action.submit({action:'approve-receipt',orderId:order.id,reference:String(form.get('reference') ?? '').trim().toUpperCase(),
          amount:Number(form.get('amount')),currency:order.currency},() => dialog.current?.close());
      }}>
        <h2>Verify {order.number}</h2><p>Compare the receipt phone and reference with the simulated payment record. Approval updates the existing order only after the amount and reference match.</p>
        <a className="button secondary" href={receiptPath}><ArrowDownToLine size={16}/> Download private receipt</a>
        {evidence && <div className="notice"><span>Submitted phone <strong>{evidence.phone}</strong><br/>Submitted reference <strong>{evidence.reference}</strong></span></div>}
        <label>Verified transaction reference<input name="reference" required maxLength={100}/></label>
        <label>Verified amount ({order.currency} minor units)<input name="amount" type="number" min="1" required/></label>
        <div role="status" className="muted">{action.status}</div>
        <div className="page-actions">
          <button type="button" className="button subtle" onClick={() => dialog.current?.close()}>Close</button>
          <button type="button" className="button secondary" disabled={action.busy} onClick={() => {
            if (window.confirm('Reject this receipt and release the order reservation?')) void action.submit({action:'reject-receipt',orderId:order.id},() => dialog.current?.close());
          }}>Reject</button>
          <button className="button primary" disabled={action.busy || !evidence}>Verify receipt</button>
        </div>
      </form>
    </dialog>
  </>;
}

export function CheckoutControls({ data, mode }: {data:CheckoutSnapshot;mode:'markets'|'payments'}) {
  const { preferences,providers,queue,history } = data;
  return <>
    <div className="checkout-grid">{(['BD','US'] as const).map(market => <MarketCard key={market+preferences.revision} market={market} settings={preferences.markets[market]}
      revision={preferences.revision} providers={providers} shipping={mode === 'markets'}/>)}</div>
    {mode === 'markets' ? <Fallback key={preferences.revision} current={preferences.fallback} revision={preferences.revision}/> :
      <section className="panel"><div className="panel-header"><div><h2>Manual receipt queue</h2><p>Payments awaiting verification in the checkout simulator.</p></div></div>
        {queue.length ? <div className="table-scroll" role="region" aria-label="Manual receipt queue" tabIndex={0}><table><thead><tr>
          <th scope="col">Order</th><th scope="col">Market</th><th scope="col">Advance due</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
          <tbody>{queue.map(order => <tr key={order.id}><td>{order.number}</td><td>{order.market}</td><td><MinorLabel amount={order.advanceDue} currency={order.currency}/></td>
            <td><Badge value={order.status}/></td><td><ReceiptReview order={order}/></td></tr>)}</tbody></table></div>
          : <p className="padded muted">There are no receipts waiting for review.</p>}</section>}
    <section className="panel"><div className="panel-header"><div><h2>Checkout activity</h2><p>Settings changes and review decisions from the sandbox ledger.</p></div></div>
      {history.length ? <ul className="history-list">{history.map((event,index) => <li key={event.created_at+index}>
        <strong>{event.action.replaceAll('-',' ')}</strong><span>{event.target}</span><time dateTime={event.created_at}>{event.created_at.slice(0,16).replace('T',' ')} UTC</time></li>)}</ul>
        : <p className="padded muted">No checkout changes have been recorded.</p>}
    </section>
  </>;
}
