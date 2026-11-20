'use client';

import { WalletCards } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { counterDate, counterMinor, counterMoney, counterScopeFields, type CounterContext, type CounterShift, type CounterShifts } from '@/lib/counter-pos-contract';
import { counterError, counterRead, CounterRequestError, counterWrite } from './client';
import styles from './cashier.module.css';

type ShiftAction = 'open' | 'close' | 'cash-in' | 'cash-out' | 'review';

function Form({ label, action, submit, children, disabled }: {
  label: string; action: ShiftAction; submit: (action: ShiftAction, values: FormData) => void; children: ReactNode; disabled: boolean;
}) {
  return <form method="post" className={styles.inline} onSubmit={(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); submit(action, new FormData(event.currentTarget));
  }}>{children}<button type="submit" className="button secondary" disabled={disabled}>{label}</button></form>;
}

function ShiftTotals({ context, register }: { context: CounterContext; register: CounterShift }) {
  const money = (amount: number) => counterMoney(amount, context.currency);
  const totals = [
    ['Opening cash', register.openingMinor], ['Cash sales', register.salesMinor], ['Cash refunds', register.refundsMinor],
    ['Cash added', register.cashInMinor], ['Cash removed', register.cashOutMinor], ['Expected cash', register.expectedMinor],
    ...(register.countedMinor !== undefined && register.countedMinor !== null ? [['Counted cash', register.countedMinor] as const] : []),
    ...(register.differenceMinor !== undefined && register.differenceMinor !== null ? [['Difference', register.differenceMinor] as const] : []),
  ] as const;
  return <dl className={styles.shiftTotals}>{totals.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>;
}

export function ShiftWorkspace({ scope, onShift, required, disabled, canUpdate, lastReceipt }: {
  scope: CounterContext; onShift: (id: string) => void; required: boolean; disabled: boolean; canUpdate: boolean; lastReceipt?: string;
}) {
  const [data, setData] = useState<CounterShifts>();
  const [attach, setAttach] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [unknown, setUnknown] = useState(false);
  const command = useRef(false);
  const pending = useRef<{ fingerprint: string; id: string }>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    void counterRead<CounterShifts>('counter-shifts', scope, undefined, controller.signal).then(setData).catch(error => {
      if (!controller.signal.aborted) setMessage(counterError(error));
    });
    return () => controller.abort();
  }, [scope, lastReceipt]);

  const active = data?.active;
  useEffect(() => {
    onShift((required || attach) && active?.openedBy === scope.operator ? active.id : '');
  }, [active, attach, onShift, required, scope.operator]);

  async function submit(action: ShiftAction, fields: FormData, explicitShift?: CounterShift) {
    if (!canUpdate || disabled || command.current) return;
    const register = explicitShift ?? active;
    const reason = String(fields.get('reason') || '').trim();
    const amount = counterMinor(String(fields.get('amount') || ''));
    if (action !== 'review' && amount === null) {
      setMessage('Enter a cash amount with up to two decimal places.');
      return;
    }
    const values = {
      ...counterScopeFields(scope), action,
      ...(action === 'open' ? { openingMinor: amount } : { shiftId: register?.id }),
      ...(action === 'close' && { countedMinor: amount, revision: register?.revision }),
      ...((action === 'cash-in' || action === 'cash-out') && { amountMinor: amount, reason }),
      ...(action === 'review' && { reason }),
    };
    const fingerprint = JSON.stringify(values);
    if (unknown && pending.current?.fingerprint !== fingerprint) {
      setMessage('The last request was interrupted. Retry the same register action and amount to confirm its outcome.');
      return;
    }
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, id: crypto.randomUUID() };
    command.current = true;
    setBusy(true);
    setMessage('');
    try {
      setData(await counterWrite<CounterShifts>('counter-shift', { ...values, operationId: pending.current.id }));
      pending.current = undefined;
      setUnknown(false);
    } catch (error) {
      setUnknown(!(error instanceof CounterRequestError) || error.status >= 500);
      setMessage(counterError(error));
    } finally { command.current = false; setBusy(false); }
  }

  return <details className={styles.contextTools}>
    <summary className={styles.shiftTitle}><WalletCards size={18} aria-hidden="true"/> Register shift
      <span>{active ? 'Open' : data ? 'Closed' : 'Loading…'}</span></summary>
    {message && <p className="notice warn" role="alert">{message}</p>}
    {canUpdate && data && !active && <Form label="Open shift" action="open" disabled={disabled || busy} submit={submit}>
      <label>Opening amount<input required inputMode="decimal" name="amount" maxLength={11} placeholder="0.00"/></label>
    </Form>}
    {active && <>
      <p className={styles.muted}>{active.registerLabel} · Opened {counterDate(active.openedAt, scope.market)}</p>
      <ShiftTotals context={scope} register={active}/>
      {!required && active.openedBy === scope.operator && <label className={styles.checkbox}>
        <input type="checkbox" checked={attach} disabled={disabled} onChange={event => setAttach(event.currentTarget.checked)}/>
        Record sales against this shift
      </label>}
      {canUpdate && (active.openedBy === scope.operator || data?.canManageCash) && <Form label="Close shift" action="close" disabled={disabled || busy} submit={submit}>
        <label>Counted closing amount<input required inputMode="decimal" name="amount" maxLength={11}/></label>
      </Form>}
      {canUpdate && data?.canManageCash && <div className={styles.registerActions}>{(['cash-in', 'cash-out'] as const).map(action =>
        <details key={action}><summary>{action === 'cash-in' ? 'Record cash in' : 'Record cash out'}</summary>
          <Form label={action === 'cash-in' ? 'Save cash in' : 'Save cash out'} action={action} disabled={disabled || busy} submit={submit}>
            <label>Amount<input required inputMode="decimal" name="amount" maxLength={11}/></label>
            <label>Reason<input required name="reason" maxLength={180}/></label>
          </Form>
        </details>)}</div>}
    </>}
    {data?.shifts.some(row => row.status === 'CLOSED') && <details className={styles.registerActions}><summary>Closed shifts</summary>
      {data.shifts.filter(row => row.status === 'CLOSED').map(row => <section key={row.id} className={styles.shiftHistory}>
        <h3>{row.registerLabel} · {counterDate(row.openedAt, scope.market)}</h3><ShiftTotals context={scope} register={row}/>
        {row.reviewedAt ? <p className={styles.muted}>Reviewed {counterDate(row.reviewedAt, scope.market)}</p>
          : canUpdate && data.canManageCash && <Form label="Record review" action="review" disabled={disabled || busy} submit={(action, values) =>
            submit(action, values, row)}><label>Review notes<input required name="reason" maxLength={180}/></label></Form>}
      </section>)}
    </details>}
  </details>;
}
