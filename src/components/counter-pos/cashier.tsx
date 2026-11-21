'use client';

import Link from 'next/link';
import { Barcode, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { counterContextKey, counterDate, counterDescription, counterMinor, counterMoney, counterReceiptUrl, counterScopeFields,
  type CounterContext, type CounterCustomer, type CounterHistoryRow, type CounterItem, type CounterOperation, type CounterQuote,
  type CounterReceipt, type CounterSaleInput, type CounterScope, type CounterSelection } from '@/lib/counter-pos-contract';
import { Basket, type BasketLine } from './basket';
import { counterError, counterRead, counterWrite } from './client';
import { ShiftWorkspace } from './shift';
import styles from './cashier.module.css';

type Draft = { version: 1; key: string; lines: BasketLine[]; coupon: string; pending?: CounterSaleInput };
type Catalog = { items: CounterItem[]; lookup: 'sku' | 'variant-barcode' | 'search'; ambiguity?: boolean };
type Contexts = { contexts: CounterContext[]; profile?: { mode: 'managed-dev'; customerMode: 'walk-in'; coupons: boolean } };
const sameScope = (a: CounterScope, b: CounterScope) => counterContextKey(a) === counterContextKey(b);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readDraft(key: string): Draft | undefined {
  try {
    const source = localStorage.getItem(key);
    if (!source || source.length > 50000) return;
    const decoded = JSON.parse(source) as Partial<Draft>;
    if (decoded.version !== 1 || typeof decoded.key !== 'string' || !Array.isArray(decoded.lines) || decoded.lines.length > 20) return;
    if (decoded.pending && (typeof decoded.pending.operationId !== 'string' || !uuid.test(decoded.pending.operationId))) return;
    return { version: 1, key: decoded.key, lines: decoded.lines, coupon: typeof decoded.coupon === 'string' ? decoded.coupon.slice(0, 60) : '',
      pending: decoded.pending };
  } catch { /* Storage may be unavailable in a private browser profile. */ }
}

function writeDraft(key: string, draft: Draft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch { return false; }
}

function ScopeName({ context }: { context: CounterContext }) {
  return <div className={styles.scopeName}>
    <strong>{context.outletName}</strong>
    <span>Platform · {context.market} · {context.currency} · {context.businessName}</span>
    <span>{context.operatorName}{context.registerLabel ? ' · ' + context.registerLabel : ''}</span>
  </div>;
}

function CustomerPicker({ scope, customer, onChange, onError, canSearch, canCreate }: {
  scope: CounterContext; customer?: CounterCustomer; onChange: (customer?: CounterCustomer) => void;
  onError: (message: string) => void; canSearch: boolean; canCreate: boolean;
}) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const command = useRef(false);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.current) return;
    command.current = true;
    setBusy(true);
    onError('');
    try {
      const result = await counterRead<{ customer: CounterCustomer | null }>('counter-customers', scope, { phone: phone.trim() });
      setChecked(true);
      if (result.customer) onChange(result.customer);
    } catch (error) { onError(counterError(error)); }
    finally { command.current = false; setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command.current) return;
    command.current = true;
    setBusy(true);
    onError('');
    try {
      const result = await counterWrite<{ customer: CounterCustomer }>('counter-customer', {
        ...counterScopeFields(scope), name: name.trim(), phone: phone.trim(),
      });
      onChange(result.customer);
    } catch (error) { onError(counterError(error)); }
    finally { command.current = false; setBusy(false); }
  }

  if (!canSearch && !customer) return null;
  return <section className={styles.customerBox} aria-label="Customer selection">
    <div className={styles.customerTitle}><UserRound size={17} aria-hidden="true"/><strong>{customer?.name ?? 'Walk-in customer'}</strong>
      {customer && <button type="button" className="button subtle" onClick={() => {
        setPhone(''); setChecked(false); onChange(undefined);
      }}>Use walk-in</button>}
    </div>
    {!customer && canSearch && <details>
      <summary>Find or add a customer</summary>
      <form method="post" className={styles.inline} onSubmit={lookup}>
        <label>Customer phone<input type="tel" autoComplete="off" required value={phone} maxLength={22} onChange={event => {
          setPhone(event.currentTarget.value); setChecked(false);
        }}/></label>
        <button className="button secondary" disabled={busy}>{busy ? 'Working…' : 'Look up customer'}</button>
      </form>
      {checked && <p className={styles.muted}>No customer was found for that phone number.</p>}
      {checked && canCreate && <form method="post" className={styles.inline} onSubmit={create}>
        <label>Customer name<input required maxLength={100} value={name} onChange={event => setName(event.currentTarget.value)}/></label>
        <button className="button secondary" disabled={busy}>Create customer</button>
      </form>}
    </details>}
  </section>;
}

export function CounterCashier({ operator, market, historyPath, receiptPath, configPath, canSearch, canCreateCustomer, canUpdateShift }: {
  operator: string; market: CounterScope['market']; historyPath: string; receiptPath: string; configPath?: string;
  canSearch: boolean; canCreateCustomer: boolean; canUpdateShift: boolean;
}) {
  const storageKey = 'griip-counter-draft-v1:' + operator;
  const [contexts, setContexts] = useState<CounterContext[]>();
  const [scope, setScope] = useState<CounterContext>();
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [customer, setCustomer] = useState<CounterCustomer>();
  const [coupon, setCoupon] = useState('');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Catalog>();
  const [searchError, setSearchError] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scanStatus, setScanStatus] = useState('');
  const [message, setMessage] = useState('');
  const [quote, setQuote] = useState<CounterQuote>();
  const [cash, setCash] = useState('');
  const [pending, setPending] = useState<CounterSaleInput>();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [receipt, setReceipt] = useState<CounterReceipt>();
  const [shift, setShift] = useState('');
  const [registerReady, setRegisterReady] = useState(false);
  const [profile, setProfile] = useState<Contexts['profile']>();
  const [nextScope, setNextScope] = useState<CounterContext>();
  const [contextReload, setContextReload] = useState(0);
  const command = useRef(false);
  const scanning = useRef(false);
  const barcodeInput = useRef<HTMLInputElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const drawerOpen = useRef<HTMLButtonElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const recoveryCheck = useRef<HTMLButtonElement>(null);
  const focusRecoveryOnClose = useRef(false);
  const resetConfirm = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void counterRead<Contexts>('counter-context', undefined, undefined, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        const records = data.contexts;
        const draft = readDraft(storageKey);
        const matching = draft && records.find(row => counterContextKey(row) === draft.key);
        setContexts(records);
        setProfile(data.profile);
        if (draft?.pending && !matching) {
          setMessage('Sale operation ' + draft.pending.operationId + ' belongs to an outlet you cannot access. Ask an authorized operator to reconcile it before recording another sale.');
          return;
        }
        const selected = matching ?? records.find(row => row.market === market) ?? records[0];
        setScope(selected);
        if (matching && draft) {
          setLines(draft.lines);
          setCoupon(!data.profile || data.profile.coupons ? draft.coupon : '');
          setPending(draft.pending && sameScope(draft.pending, matching) ? draft.pending : undefined);
        }
      })
      .catch(error => { if (!controller.signal.aborted) { setMessage(counterError(error)); setContexts([]); } });
    return () => controller.abort();
  }, [contextReload, market, storageKey]);

  useEffect(() => {
    if (!scope || !contexts) return;
    writeDraft(storageKey, { version: 1, key: counterContextKey(scope), lines, coupon, pending });
  }, [scope, contexts, storageKey, lines, coupon, pending]);

  useEffect(() => {
    const term = query.trim();
    if (!scope || term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void counterRead<Catalog>('counter-catalog', scope, { mode: 'search', q: term }, controller.signal)
        .then(result => { if (!controller.signal.aborted) setFound(result); })
        .catch(error => { if (!controller.signal.aborted) setSearchError(counterError(error)); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, scope]);

  function invalidate() {
    setQuote(undefined);
    setCash('');
    setReceipt(undefined);
  }

  function changeLocation(context: CounterContext) {
    setScope(context);
    setLines([]);
    setCustomer(undefined);
    setCoupon('');
    setQuery('');
    setFound(undefined);
    setSearchError('');
    setBarcode('');
    setScanStatus('');
    setMessage('');
    setShift('');
    setRegisterReady(false);
    setNextScope(undefined);
    invalidate();
    resetConfirm.current?.close();
  }

  function pickOutlet(key: string) {
    const selected = contexts?.find(row => counterContextKey(row) === key);
    if (!selected || (scope && sameScope(selected, scope)) || pending || busy || scanning.current) return;
    if (!lines.length && !customer && !coupon) return changeLocation(selected);
    setNextScope(selected);
    resetConfirm.current?.showModal();
  }

  function add(item: CounterItem) {
    if (!scope || item.currency !== scope.currency || pending || busy) return false;
    const prior = lines.find(row => row.variantId === item.variantId);
    if (item.available <= (prior?.quantity ?? 0)) {
      setMessage('No additional stock is available for ' + item.sku + ' at this outlet.');
      return false;
    }
    if (!prior && lines.length >= 20) {
      setMessage('Remove a line before adding another item to this basket.');
      return false;
    }
    setLines(current => {
      const row = current.find(value => value.variantId === item.variantId);
      if (!row) return [...current, { ...item, quantity: 1 }];
      if (row.quantity >= Math.min(item.available, 1000)) return current;
      return current.map(value => value.variantId === item.variantId ? { ...item, quantity: value.quantity + 1 } : value);
    });
    setMessage('');
    invalidate();
    return true;
  }

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = barcode.trim();
    if (!scope || !code || scanning.current || pending || busy) return;
    scanning.current = true;
    setScanBusy(true);
    setScanStatus('');
    setMessage('');
    try {
      const result = await counterRead<Catalog>('counter-catalog', scope, { mode: 'scan', q: code });
      if (result.ambiguity || result.items.length > 1) setMessage('This code matches multiple variants. Search by product and choose the correct SKU.');
      else if (result.items.length !== 1) setMessage('No variant matched that barcode or SKU at this outlet.');
      else if (add(result.items[0])) {
        setBarcode('');
        setScanStatus(result.items[0].sku + ' added to the basket.');
      }
    } catch (error) { setMessage(counterError(error)); }
    finally { scanning.current = false; setScanBusy(false); barcodeInput.current?.focus(); }
  }

  function selection(context: CounterContext): CounterSelection {
    return {
      ...counterScopeFields(context), lines: lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
      ...(!profile && customer && { customerId: customer.id }),
      ...((!profile || profile.coupons) && coupon.trim() && { coupon: coupon.trim() }),
    };
  }

  function begin() {
    if (command.current || scanning.current) return false;
    command.current = true;
    setBusy(true);
    setMessage('');
    return true;
  }

  function done() { command.current = false; setBusy(false); }

  async function review() {
    if (!scope || !lines.length || pending || !begin()) return;
    try {
      const result = await counterWrite<{ quote: CounterQuote }>('counter-quote', selection(scope));
      setQuote(result.quote);
      setCash('');
    } catch (error) { setMessage(counterError(error)); }
    finally { done(); }
  }

  function observe(result: CounterOperation) {
    if (result.state === 'completed') {
      setReceipt(result.receipt);
      setLines([]);
      setCustomer(undefined);
      setCoupon('');
      setQuote(undefined);
      setCash('');
      setPending(undefined);
      setChecked(false);
      drawer.current?.close();
      if (scope) writeDraft(storageKey, { version: 1, key: counterContextKey(scope), lines: [], coupon: '' });
    } else if (result.state === 'sealed') {
      setPending(undefined);
      setChecked(false);
      invalidate();
      setMessage('The unused attempt was closed. Review a new total before trying again.');
      if (scope) writeDraft(storageKey, { version: 1, key: counterContextKey(scope), lines, coupon });
    } else {
      setChecked(true);
      setMessage('No accepted sale is recorded yet. Retry the same submission or close the unused attempt before making changes.');
    }
  }

  async function complete(retry = false) {
    if (!scope || (!retry && (pending || !quote)) || (retry && (!pending || !checked))) return;
    const receivedMinor = counterMinor(cash);
    if (!retry && (receivedMinor === null || !quote || receivedMinor < quote.totalMinor || shiftMissing || registerChecking)) return;
    if (!begin()) return;
    const input: CounterSaleInput = retry && pending ? pending : {
      ...selection(scope), operationId: crypto.randomUUID(), quoteToken: quote!.token,
      tender: { kind: 'cash', receivedMinor: receivedMinor! }, ...(shift && { shift }),
    };
    if (!writeDraft(storageKey, { version: 1, key: counterContextKey(scope), lines, coupon, pending: input })) {
      setMessage('This browser could not save the sale reference. Enable storage before submitting cash sales.');
      done();
      return;
    }
    setPending(input);
    setChecked(false);
    try { observe(await counterWrite<CounterOperation>('counter-sale', input)); }
    catch (error) { setMessage(counterError(error) + ' Check this operation before accepting another sale.'); }
    finally { done(); }
  }

  async function recover(seal = false) {
    if (!pending || !scope || !begin()) return;
    try {
      const result = seal
        ? await counterWrite<CounterOperation>('counter-seal', { ...counterScopeFields(scope), operationId: pending.operationId })
        : await counterRead<CounterOperation>('counter-recovery', scope, { operationId: pending.operationId });
      observe(result);
    } catch (error) { setMessage(counterError(error)); }
    finally { done(); }
  }

  const configQuery = new URLSearchParams({ region: (scope?.market ?? market) === 'US' ? 'INTERNATIONAL' : 'BD' });
  if (scope) configQuery.set('location', scope.location);
  const configHref = configPath && configPath + '?' + configQuery;

  if (!scope) {
    return <div className={styles.root}><header className={styles.header}><h1>Point of sale</h1></header>
      {message ? <p className="notice warn" role="alert">{message}</p>
        : <p role="status">{contexts ? 'No approved counter outlets are available to this operator.' : 'Loading approved outlets…'}</p>}
      <div className={styles.actions}>
        {contexts?.length === 0 && <button type="button" className="button secondary" onClick={() => {
          setContexts(undefined); setMessage(''); setContextReload(value => value + 1);
        }}>Refresh outlets</button>}
        {configHref && <Link className="button secondary" href={configHref}>Counter configuration</Link>}
      </div>
    </div>;
  }

  const units = lines.reduce((total, line) => total + line.quantity, 0);
  const locked = !!pending;
  const canEdit = !locked && !busy;
  const shiftMissing = scope.shiftRequired && !shift;
  const registerChecking = !!scope.registerLabel && !registerReady;
  const basket = <Basket scope={scope} lines={lines} customer={customer} coupon={coupon}
    allowCoupon={!profile || profile.coupons}
    onCoupon={value => { setCoupon(value); invalidate(); }} onQuantity={(id, change) => {
      setLines(current => current.map(line => id === line.variantId
        ? { ...line, quantity: Math.min(Math.max(line.quantity + change, 1), line.available, 1000) } : line));
      invalidate();
    }} onRemove={id => { setLines(current => current.filter(line => line.variantId !== id)); invalidate(); }}
    quote={quote} cash={cash} onCash={setCash} onQuote={() => void review()} onComplete={() => void complete()}
    busy={busy} locked={locked} shiftMissing={shiftMissing} registerChecking={registerChecking}/>;
  const historyQuery = new URLSearchParams(counterScopeFields(scope));
  if (scope.market === 'US') historyQuery.set('region', 'INTERNATIONAL');

  return <div className={styles.root}>
    <header className={styles.header}><div><h1>Point of sale</h1><ScopeName context={scope}/></div>
      <div className={styles.actions}><Link className="button secondary" href={historyPath + '?' + historyQuery}>Sale history</Link>
        {configHref && <Link className="button secondary" href={configHref}>Counter configuration</Link>}</div></header>
    {message && <p className="notice warn" role="alert">{message}</p>}
    {receipt && <section className={styles.completed} aria-live="polite"><div><strong>Sale completed</strong>
      <p>{receipt.invoice} · {counterMoney(receipt.totals.totalMinor, receipt.totals.currency)}
        {' · Change ' + counterMoney(receipt.tender.changeMinor, receipt.totals.currency)}</p></div>
      <Link className="button primary" href={counterReceiptUrl(receiptPath, receipt)}>View receipt</Link></section>}
    {pending && <section className={styles.recovery}><h2>Recover sale</h2>
      <p>Use the operation reference to check whether the cash sale was accepted.</p><code>{pending.operationId}</code>
      <div className={styles.actions}><button ref={recoveryCheck} className="button primary" disabled={busy} onClick={() => void recover()}>Check sale</button>
        {checked && <><button className="button secondary" disabled={busy} onClick={() => void complete(true)}>Retry same sale</button>
          <button className="button secondary" disabled={busy} onClick={() => void recover(true)}>Close unused attempt</button></>}</div>
    </section>}
    <div className={styles.workspace}>
      <div className={styles.catalog}>
        <section className={styles.contextTools} aria-label="Operating context">
          <label>Counter outlet<select value={counterContextKey(scope)} disabled={!canEdit || scanBusy}
            onChange={event => pickOutlet(event.currentTarget.value)}>{contexts?.map(row =>
              <option key={counterContextKey(row)} value={counterContextKey(row)}>{row.outletName} · {row.market} {row.currency}</option>)}</select></label>
          {!locked && <CustomerPicker key={counterContextKey(scope)} scope={scope} customer={customer} onChange={value => {
            setCustomer(value); invalidate();
          }} onError={setMessage} canSearch={!profile && canSearch} canCreate={!profile && canCreateCustomer}/>}
        </section>
        {scope.registerLabel && <ShiftWorkspace key={counterContextKey(scope)} scope={scope} disabled={locked || busy}
          onShift={setShift} onReady={setRegisterReady} required={scope.shiftRequired} managed={!!profile}
          canUpdate={canUpdateShift} lastReceipt={receipt?.id}/>}
        <section className={styles.catalogPanel} aria-labelledby="counter-items">
          <h2 id="counter-items">Find items</h2>
          <form method="post" onSubmit={scan} className={styles.inline}>
            <label>Barcode or SKU<div className={styles.inputIcon}><Barcode size={18} aria-hidden="true"/>
              <input ref={barcodeInput} value={barcode} disabled={!canEdit} readOnly={scanBusy} maxLength={100}
                autoComplete="off" placeholder="Scan or enter an exact code" onChange={event => setBarcode(event.currentTarget.value)}
                onKeyDown={event => { if (event.key === 'Enter' && event.repeat) event.preventDefault(); }}/></div></label>
            <button className="button primary" disabled={!barcode.trim() || !canEdit || scanBusy}>{scanBusy ? 'Looking up…' : 'Look up code'}</button>
          </form>
          {scanStatus && <p role="status" className={styles.scanStatus}>{scanStatus}</p>}
          <label>Product search<div className={styles.inputIcon}><Search size={18} aria-hidden="true"/>
            <input value={query} type="search" disabled={!canEdit} maxLength={100} placeholder="Name, category, brand, or SKU"
              onChange={event => { setQuery(event.currentTarget.value); setFound(undefined); setSearchError(''); }}/></div></label>
          {searchError ? <p className="notice warn" role="alert">{searchError}</p>
            : query.trim().length < 2 ? <p className={styles.muted}>Enter at least two characters to find variants at this outlet.</p>
              : !found ? <p className={styles.muted} role="status">Searching inventory…</p>
                : !found.items.length ? <p className={styles.muted}>No matching items at this outlet.</p>
                  : <ul className={styles.catalogItems}>{found.items.map(item => <li key={item.variantId} className={styles.variant}>
                    <div><strong>{item.name}</strong><span>{item.sku}{counterDescription(item.attributes) && ' · ' + counterDescription(item.attributes)}</span>
                      <span className={styles.muted}>{item.available > 0 ? item.available + ' available' : 'Out of stock'}</span></div>
                    <strong>{counterMoney(item.unitMinor, scope.currency)}</strong>
                    <button type="button" className="button secondary" disabled={!canEdit || scanBusy || item.available <= 0}
                      aria-label={'Add ' + item.sku + ' to basket'} onClick={() => add(item)}>Add</button>
                  </li>)}</ul>}
        </section>
      </div>
      <aside className={styles.desktopBasket} aria-label="Sale basket"><div className={styles.basketHeader}>
        <h2>Basket</h2><span>{units} {units === 1 ? 'item' : 'items'}</span></div>{basket}</aside>
    </div>
    <button ref={drawerOpen} type="button" className={'button primary ' + styles.openBasket}
      onClick={() => { drawer.current?.showModal(); drawerClose.current?.focus(); }}><ShoppingBag size={18} aria-hidden="true"/> Open basket ({units})</button>
    <dialog className={styles.drawer} ref={drawer} aria-labelledby="counter-mobile-basket" onClose={() => {
      if (focusRecoveryOnClose.current) recoveryCheck.current?.focus();
      else drawerOpen.current?.focus();
      focusRecoveryOnClose.current = false;
    }}>
      <div className={styles.basketHeader}><h2 id="counter-mobile-basket">Basket</h2>
        <button ref={drawerClose} type="button" className="button subtle" onClick={() => drawer.current?.close()} aria-label="Close basket"><X size={20} aria-hidden="true"/></button></div>
      {message && <p className="notice warn" role="alert">{message}</p>}{basket}
      {locked && <button type="button" className="button secondary" onClick={() => {
        focusRecoveryOnClose.current = true;
        drawer.current?.close();
      }}>Back to sale recovery</button>}
    </dialog>
    <dialog className={styles.confirmDialog} ref={resetConfirm} aria-labelledby="counter-reset-title">
      <h2 id="counter-reset-title">Switch outlet and clear basket?</h2>
      <p>The current draft prices and quantities belong to {scope.outletName}. Start a fresh basket at {nextScope?.outletName}.</p>
      <div className={styles.actions}><button type="button" className="button secondary" onClick={() => {
        setNextScope(undefined); resetConfirm.current?.close();
      }}>Keep current basket</button><button type="button" className="button primary" onClick={() => nextScope && changeLocation(nextScope)}>
        Switch and clear</button></div>
    </dialog>
  </div>;
}

export function CounterHistory({ initialScope, newSalePath, receiptPath, market }: {
  initialScope?: string; newSalePath: string; receiptPath: string; market: CounterScope['market'];
}) {
  const [contexts, setContexts] = useState<CounterContext[]>();
  const [scope, setScope] = useState<CounterContext>();
  const [data, setData] = useState<{ rows: CounterHistoryRow[]; next?: string | null }>();
  const [cursor, setCursor] = useState('');
  const [priorCursors, setPriorCursors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [operation, setOperation] = useState('');
  const [result, setResult] = useState<CounterOperation>();
  const [checking, setChecking] = useState(false);
  const checkInFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void counterRead<{ contexts: CounterContext[] }>('counter-context', undefined, undefined, controller.signal)
      .then(value => {
        setContexts(value.contexts);
        setScope(value.contexts.find(row => counterContextKey(row) === initialScope) ?? value.contexts.find(row => row.market === market) ?? value.contexts[0]);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(counterError(cause)); });
    return () => controller.abort();
  }, [initialScope, market]);

  useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    void counterRead<{ rows: CounterHistoryRow[]; next?: string | null }>('counter-history', scope,
      cursor ? { cursor } : undefined, controller.signal).then(setData)
      .catch(cause => { if (!controller.signal.aborted) setError(counterError(cause)); });
    return () => controller.abort();
  }, [scope, cursor]);

  async function recoverReference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = operation.trim();
    if (!scope || !uuid.test(code) || checkInFlight.current) return;
    checkInFlight.current = true;
    setChecking(true);
    setResult(undefined);
    setError('');
    try { setResult(await counterRead<CounterOperation>('counter-recovery', scope, { operationId: code })); }
    catch (cause) { setError(counterError(cause)); }
    finally { checkInFlight.current = false; setChecking(false); }
  }

  return <div className={styles.root}><header className={styles.header}><div><h1>Counter sale history</h1>{scope && <ScopeName context={scope}/>}</div>
    <Link className="button secondary" href={newSalePath + (scope?.market === 'US' ? '?region=INTERNATIONAL' : '')}>New sale</Link></header>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {scope ? <>
      <section className={styles.catalogPanel} aria-label="History scope"><label>Counter outlet
        <select disabled={checking} value={counterContextKey(scope)} onChange={event => {
          const selected = contexts?.find(row => counterContextKey(row) === event.currentTarget.value);
          if (!selected || sameScope(selected, scope)) return;
          setScope(selected); setData(undefined); setCursor(''); setPriorCursors([]); setOperation(''); setResult(undefined); setError('');
        }}>{contexts?.map(row => <option key={counterContextKey(row)} value={counterContextKey(row)}>
          {row.outletName} · {row.market} {row.currency}</option>)}</select></label>
        <form method="post" className={styles.inline} onSubmit={recoverReference}>
          <label>Recover by operation reference<input value={operation} maxLength={36} onChange={event => setOperation(event.currentTarget.value)}/></label>
          <button className="button secondary" disabled={checking || !uuid.test(operation.trim())}>Check reference</button>
        </form>
        {result?.state === 'completed' && <Link href={counterReceiptUrl(receiptPath, result.receipt)}>Open recovered receipt</Link>}
        {result?.state === 'not-recorded' && <p role="status">No accepted sale is recorded for this operation.</p>}
        {result?.state === 'sealed' && <p role="status">This unused operation was closed.</p>}
      </section>
      <section className={styles.catalogPanel} aria-label="Saved counter sales">
        {!data && !error && <p role="status">Loading sales…</p>}
        {data?.rows.length === 0 && <p>No counter sales recorded at this outlet.</p>}
        {data && data.rows.length > 0 && <ul className={styles.catalogItems}>{data.rows.map(row =>
          <li className={styles.variant} key={row.id}><div><strong>{row.invoice}</strong><span>{counterDate(row.at, scope.market)} · {row.context.operatorName} · {row.lineCount} lines</span></div>
            <strong>{counterMoney(row.totals.totalMinor, row.totals.currency)}</strong>
            <Link className="button secondary" href={counterReceiptUrl(receiptPath, row)}>View receipt</Link></li>)}</ul>}
        {data && (data.next || priorCursors.length > 0) && <div className={styles.actions}>
          {priorCursors.length > 0 && <button type="button" className="button secondary" onClick={() => {
            setCursor(priorCursors.at(-1) ?? ''); setPriorCursors(previous => previous.slice(0, -1)); setData(undefined); setError('');
          }}>Previous sales</button>}
          {data.next && <button type="button" className="button secondary" onClick={() => {
            setPriorCursors(previous => [...previous, cursor]); setCursor(data.next ?? ''); setData(undefined); setError('');
          }}>More sales</button>}
        </div>}
      </section>
    </> : !error && <p role="status">{contexts ? 'No approved counter outlets are available.' : 'Loading approved outlets…'}</p>}
  </div>;
}
