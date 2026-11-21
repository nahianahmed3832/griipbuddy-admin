'use client';

import { WalletCards } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { counterContextKey, counterDate, counterMinor, counterMoney, counterScopeFields, type CounterContext, type CounterShift, type CounterShifts } from '@/lib/counter-pos-contract';
import { counterError, counterRead } from './client';
import { CounterActionRecovery, useCounterCommand } from './recovery';
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

export function ShiftWorkspace({ scope, onShift, onReady, required, disabled, canUpdate, managed, lastReceipt }: {
  scope: CounterContext; onShift: (id: string) => void; onReady: (ready: boolean) => void; required: boolean; managed: boolean;
  disabled: boolean; canUpdate: boolean; lastReceipt?: string;
}) {
  const [data, setData] = useState<CounterShifts>();
  const [attach, setAttach] = useState(false);
  const [message, setMessage] = useState('');
  const canOperate = canUpdate && !!data && data.canOperate !== false;
  const { busy, ready, pending, send } = useCounterCommand<CounterShifts>('counter-shift',
    `${scope.operator}:${counterContextKey(scope)}`, canOperate, setData, setMessage);
  const blocked = disabled || busy || !!pending || !ready;

  useEffect(() => {
    const controller = new AbortController();
    void counterRead<CounterShifts>('counter-shifts', scope, undefined, controller.signal).then(setData).catch(error => {
      if (!controller.signal.aborted) setMessage(counterError(error));
    });
    return () => controller.abort();
  }, [scope, lastReceipt]);

  const active = data?.active;
  const attachedShift = (required || attach) && active && (managed || active.openedBy === scope.operator) ? active.id : '';
  useEffect(() => {
    onShift(attachedShift);
  }, [attachedShift, onShift]);
  useEffect(() => {
    onReady(ready && !pending && !busy);
  }, [busy, onReady, pending, ready]);

  function submit(action: ShiftAction, fields: FormData, explicitShift?: CounterShift) {
    if (!canOperate || blocked) return;
    const register = explicitShift ?? active;
    const reason = String(fields.get('reason') || '').trim();
    const amount = counterMinor(String(fields.get('amount') || ''));
    if (action !== 'review' && amount === null) {
      setMessage('Enter a cash amount with up to two decimal places.');
      return;
    }
    void send({
      ...counterScopeFields(scope), action,
      ...(action === 'open' ? { openingMinor: amount } : { shiftId: register?.id }),
      ...(action === 'close' && { countedMinor: amount, revision: register?.revision }),
      ...((action === 'cash-in' || action === 'cash-out') && { amountMinor: amount, reason }),
      ...(action === 'review' && { reason }),
    });
  }

  return <div>{pending && <CounterActionRecovery label="register" operationId={pending.operationId}
    disabled={disabled || busy || !canOperate} retry={() => void send()}/>}
    {message && <p className="notice warn" role="status">{message}</p>}
    <details className={styles.contextTools}>
    <summary className={styles.shiftTitle}><WalletCards size={18} aria-hidden="true"/> Register shift
      <span>{active ? 'Open' : data ? 'Closed' : 'Loading…'}</span></summary>
    {canOperate && !active && <Form label="Open shift" action="open" disabled={blocked} submit={submit}>
      <label>Opening amount<input required inputMode="decimal" name="amount" maxLength={11} placeholder="0.00"/></label>
    </Form>}
    {active && <>
      <p className={styles.muted}>{active.registerLabel} · Opened {counterDate(active.openedAt, scope.market)}</p>
      <ShiftTotals context={scope} register={active}/>
      {!required && (managed || active.openedBy === scope.operator) && <label className={styles.checkbox}>
        <input type="checkbox" checked={attach} disabled={blocked} onChange={event => setAttach(event.currentTarget.checked)}/>
        Record sales against this shift
      </label>}
      {canOperate && (active.openedBy === scope.operator || data?.canManageCash) && <Form label="Close shift" action="close" disabled={blocked} submit={submit}>
        <label>Counted closing amount<input required inputMode="decimal" name="amount" maxLength={11}/></label>
      </Form>}
      {canOperate && data?.canManageCash && <div className={styles.registerActions}>{(['cash-in', 'cash-out'] as const).map(action =>
        <details key={action}><summary>{action === 'cash-in' ? 'Record cash in' : 'Record cash out'}</summary>
          <Form label={action === 'cash-in' ? 'Save cash in' : 'Save cash out'} action={action} disabled={blocked} submit={submit}>
            <label>Amount<input required inputMode="decimal" name="amount" maxLength={11}/></label>
            <label>Reason<input required name="reason" maxLength={180}/></label>
          </Form>
        </details>)}</div>}
    </>}
    {data?.shifts.some(row => row.status === 'CLOSED') && <details className={styles.registerActions}><summary>Closed shifts</summary>
      {data.shifts.filter(row => row.status === 'CLOSED').map(row => <section key={row.id} className={styles.shiftHistory}>
        <h3>{row.registerLabel} · {counterDate(row.openedAt, scope.market)}</h3><ShiftTotals context={scope} register={row}/>
        {row.reviewedAt ? <p className={styles.muted}>Reviewed {counterDate(row.reviewedAt, scope.market)}</p>
          : canOperate && data.canManageCash && <Form label="Record review" action="review" disabled={blocked} submit={(action, values) =>
            submit(action, values, row)}><label>Review notes<input required name="reason" maxLength={180}/></label></Form>}
      </section>)}
    </details>}
  </details></div>;
}
