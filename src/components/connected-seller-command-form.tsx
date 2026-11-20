'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import type { Region } from '@/lib/sections';

const subscribeToHydration = () => () => {};

export function ConnectedSellerCommandForm({ region, action, values, label, children }: {
  region: Region; action: string; values?: Record<string, string | number>; label: string; children: ReactNode;
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const attempt = useRef<{ body: string; id: string } | undefined>(undefined);
  const sending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean }>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const fields = new FormData(event.currentTarget);
    const input: Record<string, unknown> = { action, ...values };
    for (const [name, value] of fields) {
      if (typeof value === 'string' && value !== '' && name !== 'fields') input[name] = value;
    }
    if (action === 'verification.form') input.fields = fields.getAll('fields');
    const body = JSON.stringify(input);
    if (attempt.current?.body !== body) attempt.current = { body, id: crypto.randomUUID() };
    const verification = action.startsWith('verification.');
    sending.current = true;
    setSaving(true);
    setFeedback(undefined);
    try {
      await catalogRequest({ action: verification ? 'seller-verification.command' : 'seller-hub.command',
        input: { ...input, [verification ? 'key' : 'operationId']: attempt.current.id } }, region);
      attempt.current = undefined;
      setFeedback({ message: 'Saved.', error: false });
      router.refresh();
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'The operation could not be confirmed.', error: true });
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }

  return <form className="stack-form" onSubmit={submit}>
    <fieldset disabled={saving || !ready} className="connected-seller-fields">
      {children}
      <button className="button primary">{saving ? 'Saving…' : label}</button>
    </fieldset>
    {feedback && <p className={feedback.error ? 'notice warn' : 'notice'} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
  </form>;
}
