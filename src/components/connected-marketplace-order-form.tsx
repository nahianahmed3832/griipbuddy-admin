'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import { orderIdentifier, type ConnectedOrderAction } from '@/lib/connected-order-contract';
import type { Region } from '@/lib/sections';
import styles from './connected-marketplace-orders.module.css';

function refundMinor(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a refund amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function splitItems(fields: Record<string, FormDataEntryValue>) {
  const items: { orderItemId: string; quantity: number }[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (!key.startsWith('quantity:')) continue;
    delete fields[key];
    if (value === '' || value === '0') continue;
    const orderItemId = key.slice('quantity:'.length);
    if (!orderIdentifier.test(orderItemId) || typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value)) {
      throw new Error('Enter whole numbers for the quantities moving to the new parcel.');
    }
    items.push({ orderItemId, quantity: Number(value) });
  }
  if (!items.length) throw new Error('Choose at least one unit for the new parcel.');
  return items;
}

export function MarketplaceOrderAction({ action, region, input, children, label, workingLabel = 'Saving…', success = 'Saved.' }: {
  action: ConnectedOrderAction; region: Region; input: Record<string, unknown>; children?: ReactNode; label: string;
  workingLabel?: string; success?: string;
}) {
  const router = useRouter();
  const running = useRef(false);
  const splitAttempt = useRef<{ request: string; operationId: string }>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    running.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const items = action === 'order.parcel.split' ? splitItems(fields) : undefined;
      const { amount, confirmed, ...values } = fields;
      if (items) {
        const request = JSON.stringify({ input, items, reason: values.reason });
        if (splitAttempt.current?.request !== request) splitAttempt.current = { request, operationId: crypto.randomUUID() };
      }
      await catalogRequest({ action, input: { ...values, ...input,
        ...(typeof amount === 'string' && { amountMinor: refundMinor(amount) }),
        ...(confirmed && { confirmed: confirmed === 'yes' }),
        ...(items && { items, operationId: splitAttempt.current?.operationId }) } }, region);
      setFeedback({ text: success });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'This order could not be updated. Try again.', error: true });
    } finally {
      running.current = false;
      setPending(false);
    }
  }

  return <form className={styles.action} onSubmit={submit}>
    <fieldset disabled={pending}>{children}<button type="submit" className="button primary">{pending ? workingLabel : label}</button></fieldset>
    {feedback && <p className={feedback.error ? 'notice warn' : 'notice'} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </form>;
}

export function PrintMarketplacePackingSlip() {
  return <button type="button" className="button secondary" onClick={() => window.print()}>Print packing slip</button>;
}
