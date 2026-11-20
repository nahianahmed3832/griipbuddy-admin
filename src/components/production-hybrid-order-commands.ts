'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { HybridCommand } from '@/lib/hybrid-fulfillment';
import { adminPath } from '@/lib/paths';

export const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
export const confirmed = (form: FormData) => form.get('confirm') === 'yes';
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function useHybridOrderCommand(orderId: string) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; message: string }>();
  async function submit(event: FormEvent<HTMLFormElement>, request: (data: FormData) => HybridCommand, saved?: () => void) {
    event.preventDefault();
    if (!ready || pending.current) return;
    const form = event.currentTarget;
    const command = request(new FormData(form));
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch(adminPath('/api/website-orders/fulfillment?' + new URLSearchParams({ id: orderId, region: 'BD' })), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command),
      });
      if (!response.ok) {
        setNotice({ error: true, message: (await response.text()).slice(0, 320) || 'The fulfillment change could not be saved.' });
      } else {
        setNotice({ error: false, message: 'Order updated.' });
        saved?.();
        router.refresh();
      }
    } catch {
      setNotice({ error: true, message: 'Could not confirm the fulfillment change. Refresh the order before retrying.' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return { submit, notice, disabled: !ready || busy };
}
