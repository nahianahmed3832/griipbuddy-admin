'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import type { CounterOutlet } from '@/lib/pos-counter-configuration';

const subscribeToHydration = () => () => {};

export function CounterConfigurationForm({ outlet }: { outlet: CounterOutlet }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const running = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean }>();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    const values = new FormData(event.currentTarget);
    const registerLabel = String(values.get('registerLabel') ?? '').trim();
    running.current = true;
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await fetch(adminPath('/api/pos-counter-configuration'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          location: outlet.location, market: outlet.market, currency: outlet.currency, revision: outlet.revision,
          enabled: values.has('enabled'), businessName: String(values.get('businessName') ?? '').trim(),
          registerLabel: registerLabel || null, shiftRequired: values.has('shiftRequired'),
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        setMessage({ text: error?.error ?? 'The change could not be confirmed.', error: true });
        return;
      }
      setMessage({ text: 'Counter policy saved.', error: false });
      router.refresh();
    } catch {
      setMessage({ text: 'The connection ended. Reload to check the current version.', error: true });
    } finally {
      running.current = false;
      setSaving(false);
    }
  }

  return <form className="stack-form" method="post" onSubmit={save}>
    <fieldset disabled={!ready || saving} className="counter-configuration-fields">
      <label htmlFor="counter-business">Receipt business name</label>
      <input id="counter-business" name="businessName" defaultValue={outlet.businessName} required maxLength={80}/>
      <label htmlFor="counter-register">Register label</label>
      <input id="counter-register" name="registerLabel" defaultValue={outlet.registerLabel ?? ''} maxLength={80}/>
      <label><input type="checkbox" name="shiftRequired" defaultChecked={outlet.shiftRequired}/> Require an open register shift</label>
      <label><input type="checkbox" name="enabled" defaultChecked={outlet.enabled}/> Enable synthetic counter sales</label>
      <button className="button primary" type="submit">{saving ? 'Saving…' : 'Save counter policy'}</button>
    </fieldset>
    {message && <p className={message.error ? 'notice warn' : 'notice'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </form>;
}
