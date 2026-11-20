'use client';

import { Minus, Plus, Trash2 } from 'lucide-react';
import { counterDescription, counterMinor, counterMoney, type CounterContext, type CounterCustomer, type CounterItem, type CounterQuote } from '@/lib/counter-pos-contract';
import styles from './cashier.module.css';

export type BasketLine = CounterItem & { quantity: number };
export type BasketControls = {
  scope: CounterContext;
  lines: BasketLine[];
  customer?: CounterCustomer;
  coupon: string;
  onCoupon: (value: string) => void;
  onQuantity: (id: string, change: number) => void;
  onRemove: (id: string) => void;
  quote?: CounterQuote;
  cash: string;
  onCash: (value: string) => void;
  onQuote: () => void;
  onComplete: () => void;
  busy: boolean;
  locked: boolean;
  shiftMissing: boolean;
};

export function Basket({ scope, lines, customer, coupon, onCoupon, onQuantity, onRemove, quote, cash, onCash,
  onQuote, onComplete, busy, locked, shiftMissing }: BasketControls) {
  const money = (minor: number) => counterMoney(minor, scope.currency);
  const received = counterMinor(cash);
  const change = quote && received !== null && received >= quote.totalMinor ? received - quote.totalMinor : null;
  const controlsDisabled = busy || locked;
  return <>
    <div className={styles.basketBody}>
      <p className={styles.customerSummary}>{customer?.name ?? 'Walk-in customer'}</p>
      {!lines.length ? <div className={styles.empty}><strong>Your basket is empty</strong><p>Scan an item or choose a variant.</p></div> : (
        <ul className={styles.basketItems}>{lines.map(line => {
          const priced = quote?.lines.find(use => use.variantId === line.variantId);
          return <li className={styles.basketItem} key={line.variantId}>
            <div className={styles.itemHeading}><div><strong>{line.name}</strong>
              <span>{line.sku}{counterDescription(line.attributes) && ' · ' + counterDescription(line.attributes)}</span></div>
              <button type="button" className="button subtle" disabled={controlsDisabled}
                aria-label={'Remove ' + line.sku} onClick={() => onRemove(line.variantId)}><Trash2 size={16} aria-hidden="true"/></button></div>
            <div className={styles.itemBottom}><div className={styles.quantity} aria-label={'Quantity for ' + line.sku}>
              <button type="button" className="button secondary" disabled={controlsDisabled || line.quantity <= 1}
                aria-label={'Decrease ' + line.sku} onClick={() => onQuantity(line.variantId, -1)}><Minus size={14} aria-hidden="true"/></button>
              <span aria-live="polite">{line.quantity}</span>
              <button type="button" className="button secondary" disabled={controlsDisabled || line.quantity >= Math.min(line.available, 1000)}
                aria-label={'Increase ' + line.sku} onClick={() => onQuantity(line.variantId, 1)}><Plus size={14} aria-hidden="true"/></button>
              </div>
              <span>{priced ? money(priced.totalMinor) : money(line.unitMinor) + ' each'}</span></div>
          </li>;
        })}</ul>
      )}
    </div>
    <div className={styles.basketPay}>
      <label>Coupon code<input value={coupon} disabled={controlsDisabled} maxLength={60}
        onChange={event => onCoupon(event.currentTarget.value)} autoComplete="off" placeholder="Optional"/></label>
      {!quote ? <button type="button" className="button primary" onClick={onQuote} disabled={!lines.length || controlsDisabled}>
        {busy ? 'Checking…' : 'Review server total'}
      </button> : <>
        <dl className={styles.totals} aria-label="Server quoted totals">
          <div><dt>Subtotal</dt><dd>{money(quote.subtotalMinor)}</dd></div>
          {quote.discountMinor > 0 && <div><dt>Discount</dt><dd>{money(quote.discountMinor)}</dd></div>}
          <div><dt>Tax</dt><dd>{money(quote.taxMinor)}</dd></div>
          <div className={styles.grandTotal}><dt>Amount due</dt><dd>{money(quote.totalMinor)}</dd></div>
        </dl>
        <label>Payment method<select aria-label="Payment method" disabled={controlsDisabled}><option value="cash">Cash</option></select></label>
        {shiftMissing && <p className={styles.validation}>Open the register shift before accepting cash.</p>}
        <label>Cash received in {scope.currency}<input inputMode="decimal" autoComplete="off" maxLength={10} value={cash}
          disabled={controlsDisabled} onChange={event => onCash(event.currentTarget.value)} /></label>
        {cash && received === null && <p className={styles.validation}>Enter a cash amount with up to two decimal places.</p>}
        {received !== null && received < quote.totalMinor && <p className={styles.validation}>Cash received is below the amount due.</p>}
        {change !== null && <dl className={styles.change} aria-live="polite"><div><dt>Change</dt><dd>{money(change)}</dd></div></dl>}
        <button type="button" className="button primary"
          disabled={controlsDisabled || change === null || shiftMissing} onClick={onComplete}>{busy ? 'Working…' : 'Complete cash sale'}</button>
      </>}
    </div>
  </>;
}
