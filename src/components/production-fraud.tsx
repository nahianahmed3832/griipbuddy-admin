'use client';

import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import styles from './production-fraud.module.css';

type Courier = {
  courierName?: string; courierKey?: string; totalOrders?: number;
  totalParcels?: number; totalDelivered?: number; totalCancelled?: number; lastCourierSyncAt?: string;
  successRate?: number;
};
type Summary = {
  successRate: number; statusTag?: string;
  totalOrders?: number; totalParcels?: number; totalDelivered?: number;
  totalCancelled?: number; totalCancel?: number; apis?: Courier[];
};

export function ProductionFraudChecker({ header = false, className, resultClassName }: {
  header?: boolean; className?: string; resultClassName?: string;
}) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Summary>();
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
      const response = await fetch(adminPath('/api/fraud-check?phone=' + encodeURIComponent(phone)), { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch fraud status');
      const body: { data?: Summary } = await response.json();
      if (!body.data || !Number.isFinite(body.data.successRate)) throw new Error('Failed to fetch fraud status');
      setResult(body.data);
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

function FraudResults({ result }: { result: Summary }) {
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
