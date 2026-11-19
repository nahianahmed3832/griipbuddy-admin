'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import type { ConnectedOrderAction } from '@/lib/connected-order-contract';
import type { Region } from '@/lib/sections';
import styles from './connected-marketplace-orders.module.css';

function refundMinor(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter a refund amount with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function MarketplaceOrderAction({ action, region, input, children, label }: {
  action: ConnectedOrderAction; region: Region; input: Record<string, unknown>; children?: ReactNode; label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      const { amount, confirmed, ...values } = fields;
      await catalogRequest({ action, input: { ...values, ...input,
        ...(typeof amount === 'string' && { amountMinor: refundMinor(amount) }),
        ...(confirmed && { confirmed: confirmed === 'yes' }) } }, region);
      setFeedback({ text: 'Saved.' });
      router.refresh();
    } catch (error) {
      setFeedback({ text: error instanceof Error ? error.message : 'This order could not be updated. Try again.', error: true });
    } finally {
      setPending(false);
    }
  }

  return <form className={styles.action} onSubmit={submit}>
    <fieldset disabled={pending}>{children}<button type="submit" className="button primary">{pending ? 'Saving…' : label}</button></fieldset>
    {feedback && <p className={feedback.error ? 'notice warn' : 'notice'} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </form>;
}

export function PrintMarketplacePackingSlip() {
  return <button type="button" className="button secondary" onClick={() => window.print()}>Print packing slip</button>;
}
