'use client';

import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { adminPath } from '@/lib/paths';

type Result = { success_rate: number; status_tag: string; required_delivery_charge: boolean };

export function CourierFraud({ enabled }: { enabled: boolean }) {
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !enabled) return;
    const phone = String(new FormData(event.currentTarget).get('phone') ?? '').trim();
    setBusy(true);
    setResult(undefined);
    setError('');
    try {
      const response = await fetch(adminPath('/api/website-orders?action=fraud-check&region=BD'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
      });
      if (!response.ok) setError(await response.text());
      else setResult(await response.json());
    } catch { setError('The courier checker could not be reached.'); }
    finally { setBusy(false); }
  }
  return <section className="panel padded stack-form">
    <p>Look up a Bangladesh mobile number using the configured courier history provider. The number is sent to the provider when you submit.</p>
    {!enabled && <p className="notice">Courier history lookup is disabled in this workspace.</p>}
    <form className="period-form" onSubmit={lookup}>
      <label>Bangladesh mobile number<input name="phone" type="tel" inputMode="numeric" placeholder="01XXXXXXXXX"
        maxLength={11} pattern="01[0-9]{9}" autoComplete="off" required disabled={!enabled || busy}/></label>
      <button className="button primary" disabled={!enabled || busy}><Search size={16}/> {busy ? 'Checking…' : 'Check courier history'}</button>
    </form>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {result && <dl className="details-grid" aria-live="polite">
      <div><dt>Reported delivery success</dt><dd>{result.success_rate}%</dd></div>
      {result.status_tag && <div><dt>Provider status</dt><dd>{result.status_tag}</dd></div>}
      <div><dt>Delivery charge advance</dt><dd>{result.required_delivery_charge ? 'Provider recommends an advance' : 'Provider does not recommend an advance'}</dd></div>
    </dl>}
  </section>;
}
