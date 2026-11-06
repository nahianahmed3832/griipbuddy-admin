'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';

export type HandoverOptions = { locations: { value: string; label: string }[]; region: Region };

export function Handover({ orderIds, options, clear }: { orderIds: string[]; options: HandoverOptions; clear: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    const location = new FormData(event.currentTarget).get('location');
    try {
      const result = await fetch(adminPath('/api/workspace'), { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ action:'handover', region:options.region, values:{ orderIds, location } }) });
      if (!result.ok) { setError((await result.text()).slice(0, 300)); return; }
      const { handedOver, alreadyHandedOver } = await result.json();
      setFeedback(handedOver + ' handed over · ' + alreadyHandedOver + ' already recorded');
      dialog.current?.close();
      clear();
      router.refresh();
    } catch { setError('The response was interrupted. Check the orders or retry the same batch.'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <>
    {orderIds.length > 0 && <button type="button" className="button primary" disabled={!options.locations.length}
      onClick={() => { setError(''); setFeedback(''); dialog.current?.showModal(); }}>Hand over selected</button>}
    <dialog ref={dialog} className="form-dialog" aria-labelledby={titleId} onCancel={event => { if (busy) event.preventDefault(); }}>
      <form className="stack-form" onSubmit={submit}>
        <h2 id={titleId}>Confirm courier handover</h2>
        <p>Record physical handover for {orderIds.length} selected orders with existing courier consignments.</p>
        <label>Dispatch location<select name="location" required defaultValue="">
          <option disabled value="">Choose a location</option>{options.locations.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}
        </select></label>
        {error && <p role="alert" className="notice warn">{error}</p>}
        <div className="page-actions"><button type="button" className="button secondary" disabled={busy}
          onClick={() => dialog.current?.close()}>Cancel</button><button className="button primary" disabled={busy}>Confirm handover</button></div>
      </form>
    </dialog>
    {feedback && <span role="status">{feedback}</span>}
  </>;
}
