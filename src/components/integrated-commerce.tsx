'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';

type Policy = { methods:string[]; shippingMinor:number; advancePercent:number; revision:string; currency:string };
export type CommerceMarket = { code:string; name:string; currency:string; is_active:boolean; checkout?:Policy };
type Evidence = { phone:string; reference:string; amount:number; currency:string; status:string };
const path = adminPath('/api/commerce');

async function save(kind: 'market' | 'receipt', id: string, values: object) {
  const response = await fetch(path, { method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ kind, id, values }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The change could not be saved.');
}

function MarketForm({ market, writable }: { market:CommerceMarket; writable:boolean }) {
  const [note,setNote] = useState('');
  const [saving,setSaving] = useState(false);
  const router = useRouter();
  const policy = market.checkout?.currency === market.currency ? market.checkout : undefined;
  const methods = market.code === 'BD' ? ['cod','manual','paypal','stripe'] : ['paypal','stripe'];
  const labels: Record<string,string> = { cod:'Cash on delivery', manual:'Advance receipt', paypal:'PayPal simulation', stripe:'Stripe simulation' };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writable || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setNote('');
    try {
      await save('market', market.code, { revision:market.checkout?.revision ?? null, methods:form.getAll('methods'),
        shippingMinor:Number(form.get('shipping')), advancePercent:Number(form.get('advance')) });
      setNote('Saved.');
      router.refresh();
    } catch (error) { setNote(error instanceof Error ? error.message : 'Unable to save.'); }
    finally { setSaving(false); }
  }
  return <form className="panel padded stack-form" onSubmit={submit}>
    <h2>{market.name} · {market.currency}{!market.is_active && ' · Inactive'}</h2>
    <fieldset className="editor-grid commerce-fields" disabled={!writable || saving} key={market.checkout?.revision}>
      <label>Shipping in minor units<input type="number" name="shipping" min="0" max="1000000" required defaultValue={policy?.shippingMinor ?? 0}/></label>
      <label>Advance percent<input type="number" name="advance" min="1" max="100" required defaultValue={policy?.advancePercent ?? 25}/></label>
      {methods.map(method => <label key={method}><span><input type="checkbox" name="methods" value={method}
        defaultChecked={policy?.methods.includes(method)}/> {labels[method]}</span></label>)}
    </fieldset>
    {writable && <div className="page-actions"><button className="button primary" disabled={saving}>Save market checkout</button></div>}
    {note && <p role="status">{note}</p>}
  </form>;
}

export function CommerceMarkets({ markets, writable }: { markets:CommerceMarket[]; writable:boolean }) {
  return <div className="stack-form">{markets.map(market => <MarketForm key={market.code} market={market} writable={writable}/>)}</div>;
}

export function CommerceReceipts({ initial = '', writable }: { initial?: string; writable:boolean }) {
  const [id,setId] = useState(initial);
  const [receipt,setReceipt] = useState<{ id:string; details:Evidence } | null>(null);
  const [note,setNote] = useState('');
  const [busy,setBusy] = useState(false);
  const [loaded,setLoaded] = useState(false);
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setReceipt(null);
    setNote('');
    try {
      const response = await fetch(path + '?format=metadata&receipt=' + encodeURIComponent(id.trim()), { cache:'no-store' });
      if (!response.ok) throw new Error('Receipt unavailable.');
      setReceipt({ id:id.trim(), details:(await response.json()).data });
    } catch { setNote('Receipt unavailable.'); }
    finally { setBusy(false); }
  }
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!writable || !receipt || busy) return;
    const form = new FormData(event.currentTarget);
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    setBusy(true);
    setNote('');
    try {
      await save('receipt', receipt.id, { reference:form.get('reference'), amount:Number(form.get('amount')),
        currency:receipt.details.currency, outcome:button?.value });
      setNote(button?.value === 'paid' ? 'Advance verified.' : 'Receipt rejected and stock released.');
      setLoaded(true);
    } catch (error) { setNote(error instanceof Error ? error.message : 'Unable to review receipt.'); }
    finally { setBusy(false); }
  }
  return <section className="panel padded stack-form">
    <form className="stack-form" onSubmit={lookup}>
      <label>Order record ID<input required pattern="[a-f0-9]{24}" value={id} disabled={busy} onChange={event => {
        setId(event.target.value); setReceipt(null); setLoaded(false); setNote('');
      }}/></label>
      <div className="page-actions"><button className="button secondary" disabled={busy}>Find receipt</button></div>
    </form>
    {receipt && <>
      <p>Submitted reference {receipt.details.reference} · {receipt.details.phone}. Expected advance {receipt.details.amount} minor units ({receipt.details.currency}).</p>
      <div className="page-actions"><a className="button secondary" href={path + '?receipt=' + receipt.id}>Download private receipt</a></div>
      {writable && receipt.details.status === 'INCOMPLETE' && !loaded && <form className="stack-form" onSubmit={decide}>
        <div className="editor-grid">
          <label>Verified transaction reference<input name="reference" required maxLength={64}/></label>
          <label>Verified advance in minor units<input name="amount" type="number" min="1" required/></label>
        </div>
        <div className="page-actions">
          <button className="button primary" value="paid" disabled={busy}>Approve advance</button>
          <button className="button secondary" value="failed" disabled={busy}>Reject receipt</button>
        </div>
      </form>}
    </>}
    {note && <p role="status">{note}</p>}
  </section>;
}
