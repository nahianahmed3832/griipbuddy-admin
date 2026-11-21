'use client';

import { useEffect, useRef, useState } from 'react';
import { counterError, CounterRequestError, counterWrite } from './client';
import styles from './cashier.module.css';

type Command = { operationId: string; values: Record<string, unknown> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function useCounterCommand<T>(action: 'counter-shift' | 'counter-return', scopeKey: string, canWrite: boolean,
  update: (data: T) => void, notice: (message: string) => void) {
  const storageKey = `griip-counter-command-v1:${action}:${scopeKey}`;
  const [pending, setPending] = useState<Command>();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      const attempt = saved ? JSON.parse(saved) as Partial<Command> : undefined;
      if (attempt && (typeof attempt.operationId !== 'string' || !uuid.test(attempt.operationId)
        || !attempt.values || typeof attempt.values !== 'object' || Array.isArray(attempt.values))) {
        notice('This browser session contains an unreadable counter action. Ask a supervisor to reconcile it.');
        return;
      }
      setPending(attempt as Command | undefined);
      setReady(true);
    } catch {
      notice('Counter recovery is unavailable in this browser session.');
    }
  }, [notice, storageKey]);

  async function send(values?: Record<string, unknown>) {
    if (!canWrite || !ready || inFlight.current || (values && pending)) return;
    const attempt = values ? { operationId: crypto.randomUUID(), values } : pending;
    if (!attempt) return;
    if (values) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(attempt)); }
      catch {
        notice('This browser could not save the action reference. Enable storage before submitting.');
        return;
      }
      setPending(attempt);
    }
    inFlight.current = true;
    setBusy(true);
    notice('');
    try {
      const result = await counterWrite<T>(action, { ...attempt.values, operationId: attempt.operationId });
      sessionStorage.removeItem(storageKey);
      setPending(undefined);
      update(result);
      if (!values) notice('The saved action was reconciled.');
    } catch (error) {
      // A first definitive rejection has no stored effect. Keep an interrupted request available for reconciliation.
      if (values && error instanceof CounterRequestError && error.status >= 400 && error.status < 500
        && ![408, 425, 429].includes(error.status)) {
        sessionStorage.removeItem(storageKey);
        setPending(undefined);
      }
      notice(counterError(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { busy, ready, pending, send };
}

export function CounterActionRecovery({ label, operationId, disabled, retry }: {
  label: 'register' | 'return'; operationId: string; disabled: boolean; retry: () => void;
}) {
  return <section className={styles.recovery} aria-label={`Recover ${label} action`}>
    <p>Retry the saved {label} action with this reference before entering another one.</p>
    <code>{operationId}</code><div className={styles.actions}>
      <button type="button" className="button secondary" disabled={disabled} onClick={retry}>Recover {label} action</button>
    </div>
  </section>;
}
