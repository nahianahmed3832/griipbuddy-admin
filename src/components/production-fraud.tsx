'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import styles from './production-fraud.module.css';

type Courier = {
  courierName?: string; courierKey?: string; totalOrders?: number;
  totalParcels?: number; totalDelivered?: number; totalCancelled?: number; lastCourierSyncAt?: string;
  successRate?: number;
};
export type FraudSummary = {
  successRate: number; statusTag?: string;
  totalOrders?: number; totalParcels?: number; totalDelivered?: number;
  totalCancelled?: number; totalCancel?: number; apis?: Courier[];
};

export function ProductionFraudChecker({ header = false, className, resultClassName }: {
  header?: boolean; className?: string; resultClassName?: string;
}) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FraudSummary>();
  const [error, setError] = useState('');
  const [details, setDetails] = useState(!header);

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^01\d{9}$/.test(phone) || busy) return;
    setBusy(true);
    setResult(undefined);
    setError('');
    setDetails(!header);
    try {
      setResult(await lookupFraud(phone));
    } catch {
      setError('Failed to fetch fraud status');
    } finally {
      setBusy(false);
    }
  }

  return <form className={className ?? styles.form} onSubmit={lookup}>
    <input aria-label="Fraud Checker" name="phone" placeholder="Fraud Checker" type="tel" value={phone}
      onChange={event => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))}
      inputMode="numeric" pattern="01[0-9]{9}" maxLength={11} autoComplete="off" required/>
    <button type="submit" aria-label="Check courier history" disabled={busy || !/^01\d{9}$/.test(phone)}>
      <Search size={16} aria-hidden="true"/>
    </button>
    {(busy || result || error) && <section className={resultClassName ?? styles.results} aria-live="polite">
      <button className={styles.close} type="button" aria-label="Close courier history" onClick={() => {
        setResult(undefined);
        setError('');
      }}>×</button>
      {busy && <p>Loading fraud data...</p>}
      {error && <p><strong>Error</strong><br/>{error}</p>}
      {result && !details && <button type="button" onClick={() => setDetails(true)}>
        {result.successRate}% · View Details
      </button>}
      {result && details && <FraudResults result={result}/>}
    </section>}
  </form>;
}

export function normalizeFraudPhone(value?: string) {
  const phone = (value || '').replace(/\D/g, '').replace(/^88(?=01[0-9]{9}$)/, '');
  return /^01[0-9]{9}$/.test(phone) ? phone : '';
}

const lookups = new Map<string, { expires: number; result: Promise<FraudSummary> }>();
let activeLookups = 0;
const queuedLookups: (() => void)[] = [];

function lookupFraud(phone: string) {
  const now = Date.now();
  for (const [number, entry] of lookups) if (entry.expires <= now) lookups.delete(number);
  const existing = lookups.get(phone);
  if (existing) return existing.result;
  const result = new Promise<FraudSummary>((resolve, reject) => {
    const run = async () => {
      activeLookups++;
      try {
        const url = adminPath('/api/fraud-check?phone=' + encodeURIComponent(phone));
        const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(response.status === 429 ? 'Wait before making another lookup' : 'Failed to fetch fraud status');
        const body: { data?: FraudSummary } = await response.json();
        if (!body.data || !Number.isFinite(body.data.successRate)) throw new Error('Failed to fetch fraud status');
        resolve(body.data);
      } catch (error) {
        lookups.delete(phone);
        reject(error);
      } finally {
        activeLookups--;
        queuedLookups.shift()?.();
      }
    };
    if (activeLookups < 3) void run();
    else queuedLookups.push(run);
  });
  lookups.set(phone, { expires: now + 60_000, result });
  return result;
}

export function useCourierFraud(value?: string, active = true) {
  const phone = normalizeFraudPhone(value);
  const [state, setState] = useState<{ phone: string; result?: FraudSummary; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!phone || !active) return;
    let current = true;
    const timer = setTimeout(() => {
      lookupFraud(phone).then(
        result => { if (current) setState({ phone, result }); },
        error => { if (current) setState({ phone, error: error.message || 'Failed to fetch fraud status' }); },
      );
    }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [phone, attempt, active]);
  const data = state?.phone === phone ? state : undefined;
  return { ...data, busy: Boolean(phone && active && !data), retry: () => { setState(undefined); setAttempt(value => value + 1); } };
}

export function OrderFraudResults({ phone }: { phone?: string }) {
  const { result, error, busy, retry } = useCourierFraud(phone);
  if (!normalizeFraudPhone(phone)) return <p>A Bangladesh mobile number is required.</p>;
  if (busy) return <p role="status">Loading fraud data…</p>;
  if (error) return <div role="alert"><p>{error}</p><button type="button" className="button secondary" onClick={retry}>Retry</button></div>;
  return result ? <FraudResults result={result}/> : null;
}

export function FraudResults({ result }: { result: FraudSummary }) {
  const total = result.totalOrders ?? result.totalParcels ?? 0;
  const delivered = result.totalDelivered ?? 0;
  const cancelled = result.totalCancelled ?? result.totalCancel ?? 0;
  return <div className={styles.summary}>
    <h2>Summary</h2>
    <p>Status: <strong>{result.statusTag || 'N/A'}</strong></p>
    <p>Success Rate: <strong>{result.successRate}%</strong></p>
    <Rate value={result.successRate}/>
    <dl className={styles.totals}>
      <div><dt>Total Parcels</dt><dd>{total}</dd></div>
      <div><dt>Delivered</dt><dd>{delivered}</dd></div>
      <div><dt>Cancelled</dt><dd>{cancelled}</dd></div>
      <div><dt>Pending</dt><dd>{Math.abs(total - delivered - cancelled)}</dd></div>
    </dl>
    {!!result.apis?.length && <div className={styles.couriers}>
      <h3>Courier Performance</h3>
      {result.apis.map((courier, index) => {
        const delivered = courier.totalDelivered ?? 0;
        const orders = courier.totalOrders ?? courier.totalParcels ?? 0;
        const rate = courier.successRate ?? (orders > 0 ? delivered / orders * 100 : 0);
        const syncTime = Date.parse(courier.lastCourierSyncAt ?? '');
        return <article key={courier.courierKey ?? index}>
          <header><strong>{courier.courierName}</strong><span>{rate.toLocaleString('en', { maximumFractionDigits: 2 })}%</span></header>
          <Rate value={rate}/>
          <dl className={styles.courierMetrics}>
            <div><dt>Total</dt><dd>{orders}</dd></div>
            <div><dt>Delivered</dt><dd>{delivered}</dd></div>
            <div><dt>Cancelled</dt><dd>{courier.totalCancelled ?? 0}</dd></div>
          </dl>
          {Number.isFinite(syncTime) && <p>Updated: {new Date(syncTime).toLocaleDateString()}</p>}
        </article>;
      })}
    </div>}
    <p className={styles.overall}>Overall Delivery Performance<br/><strong>{result.successRate}% Success Rate</strong><br/>Based on {total} total parcels</p>
  </div>;
}

function Rate({ value }: { value: number }) {
  const color = value >= 80 ? '#00a63e' : value >= 50 ? '#efb100' : '#e7000b';
  return <span className={styles.track} aria-hidden="true"><i style={{ width: Math.max(0, Math.min(value, 100)) + '%', background: color }}/></span>;
}

export function ProductionFraudPage() {
  return <section className={styles.page}>
    <h1>Check Number for Scam!</h1>
    <ProductionFraudChecker/>
  </section>;
}
