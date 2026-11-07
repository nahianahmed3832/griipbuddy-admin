import Link from 'next/link';
import Form from 'next/form';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ApiError, mongoId, url, type Session } from '@/lib/api';
import { dateParam, param, type Query } from '@/lib/data';
import type { Column, Region } from '@/lib/sections';
import { canManage } from '@/lib/managed';
import { money, orderDate, ordersPath } from '@/lib/website-orders';
import { PageHeading } from './dashboard';
import { ReportValues } from './managed-common';
import { Table } from './tables';
import { canReadTransactions, readTransactions, transactionsPath as path, type TransactionRow as Row } from '@/lib/transactions';

const states = {
  success: 'Successful', captured: 'Captured', authorized: 'Authorized', pending: 'Pending',
  failed: 'Failed', refunded: 'Refunded', cancelled: 'Cancelled', expired: 'Expired',
};

const columns: Column[] = [
  { label: 'Reference', fields: 'reference' }, { label: 'Order', fields: 'order' },
  { label: 'Customer', fields: 'customer' }, { label: 'Method', fields: 'method' },
  { label: 'Status', fields: 'state', kind: 'badge' }, { label: 'Amount', fields: 'amount' },
  { label: 'Recorded', fields: 'date', kind: 'date' },
];

const statusLabel = (state: string) => states[state as keyof typeof states] ?? state;
const amount = (value: number | null, currency?: string) => currency && value !== null ? money(value, currency) + ' ' + currency : '—';
const orderLabel = (row: Row) => row.orderNumber ? '#' + row.orderNumber : row.order ? 'Open order' : '';
const originLabel = (row: Row) => row.mode === 'simulation' || row.origin === 'simulation' ? 'Simulated gateway'
  : row.mode === 'sandbox' || row.origin === 'managed' ? 'Managed sandbox'
    : row.mode === 'receipt' ? 'Receipt review' : 'Recorded transaction';

export async function TransactionPage({ auth, q, region, id }: { auth: Session; q: Query; region: Region; id?: string }) {
  if (!canReadTransactions(auth)) throw new ApiError(403);
  const source = param(q, 'source') === 'attempts' ? 'attempts' : 'ledger';
  const base = { region, source };
  if (id) {
    if (!mongoId(id)) throw new ApiError(404);
    const selected = await readTransactions(auth, { ...base, id, origin: param(q, 'origin') });
    const row = selected.rows[0];
    if (!row) throw new ApiError(404);
    const order = row.order;
    const managed = source === 'attempts' && row.origin === 'managed' && canManage(auth.staff) && order;
    const receipt = row.origin === 'checkout' && row.method === 'manual' && order;
    return <>
      <div className="page-actions"><Link className="button secondary" href={url(path, { ...base, ...searchFilters(q), page: param(q, 'page') })}>
        <ArrowLeft size={15} aria-hidden/> Back to transactions
      </Link></div>
      <PageHeading eyebrow="PAYMENTS" title={source === 'ledger' ? 'Transaction detail' : 'Payment attempt'}
        description={originLabel(row) + ' · ' + statusLabel(row.state)}>
        {order && <Link className="button secondary" href={url(ordersPath + '/' + order, { region })}>Open order <ArrowRight size={15} aria-hidden/></Link>}
        {source === 'ledger' && row.origin === 'managed' && order && <Link className="button secondary"
          href={url(path, { region, source: 'attempts', q: order })}>View payment attempts</Link>}
        {managed && <Link className="button primary" href={url('/desk/payments/payment-desk', { region, order, record: row.id })}>Open payment desk</Link>}
        {receipt && <Link className="button primary" href={url('/desk/payments/checkout', { region, receipt: order })}>Review checkout receipt</Link>}
      </PageHeading>
      <ReportValues title="Payment record" description="Amounts use the currency recorded with this payment." data={{
        id: row.id, order: orderLabel(row), customer: row.customer, reference: row.reference,
        gateway: row.gateway, method: row.method, state: statusLabel(row.state), amount: amount(row.amount, row.currency),
        captured: amount(row.captured, row.currency), refunded: amount(row.refunded, row.currency),
        date: orderDate(row.date, region), updated: orderDate(row.updated, region), reconciliation: row.reconciliation,
      }} labels={{
        id: 'Record ID', order: 'Order', customer: 'Customer', method: 'Method', state: 'Status',
        reference: 'Transaction reference', gateway: 'External gateway reference', amount: 'Amount', date: 'Recorded at',
        ...(source === 'attempts' && { captured: 'Captured', refunded: 'Refunded', updated: 'Updated at', reconciliation: 'Reconciliation' }),
      }}/>
    </>;
  }

  const filters = searchFilters(q);
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const requestedPage = Math.min(10000, Math.max(1, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
  const result = invalidDates ? undefined : await readTransactions(auth, { ...base, ...filters, page: String(requestedPage) });
  const pageLink = (page: number) => url(path, { ...base, ...filters, page: String(page) });
  return <div className="transactions-workspace">
    <PageHeading eyebrow="PAYMENTS" title="Transactions"
      description="Review posted payment records and investigate attempts by order, customer or gateway reference."/>
    <div className="panel">
      <nav className="tabs transaction-tabs" aria-label="Transaction sources">
        <Link href={url(path, { region })} aria-current={source === 'ledger' ? 'page' : undefined}>Transaction history</Link>
        <Link href={url(path, { region, source: 'attempts' })} aria-current={source === 'attempts' ? 'page' : undefined}>Payment attempts</Link>
      </nav>
      <Form action={path} key={JSON.stringify([base, filters])} className="transaction-filters padded">
        <input type="hidden" name="region" value={region}/>
        <input type="hidden" name="source" value={source}/>
        <label>Search <input name="q" type="search" maxLength={100} defaultValue={filters.q} placeholder="Order, customer or reference"/></label>
        <label>Status <select name="state" defaultValue={filters.state ?? ''}>
          <option value="">All statuses</option>
          {Object.entries(states).filter(([state]) => source === 'ledger'
            ? ['success', 'refunded', 'failed', 'pending'].includes(state) : state !== 'success')
            .map(([state, label]) => <option value={state} key={state}>{label}</option>)}
        </select></label>
        <label>Currency <input name="currency" maxLength={3} pattern="[a-zA-Z]{3}" defaultValue={filters.currency} placeholder="All"/></label>
        <label>From ({region === 'BD' ? 'Dhaka' : 'UTC'}) <input name="from" type="date" defaultValue={filters.from}/></label>
        <label>Through <input name="to" type="date" defaultValue={filters.to}/></label>
        <label>Sort <select name="sort" defaultValue={filters.sort ?? 'newest'}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        <div className="page-actions"><button className="button primary" type="submit">Apply filters</button>
          <Link className="button secondary" href={url(path, base)}>Reset</Link></div>
      </Form>
    </div>
    {invalidDates && <p className="notice warn" role="alert">The end date must be on or after the start date.</p>}
    {result && <>
      <section className="panel padded transaction-summary" aria-labelledby="transaction-summary">
        <h2 id="transaction-summary">Matching activity</h2>
        <p className="muted">{source === 'ledger'
          ? 'Amounts are grouped by recorded currency and status. Simulated payments are included in this dev workspace.'
          : 'Counts describe attempts. Use the transaction history for recorded payment amounts.'}</p>
        {result.summary.length > 0 && <ul>{result.summary.map(item => <li key={item.state + (item.currency ?? '')}>
          <span>{statusLabel(item.state)}{item.currency && ' · ' + item.currency}</span>
          <strong>{item.count.toLocaleString('en')}</strong>
          {item.amount !== null && ['success', 'refunded'].includes(item.state) && <small>{amount(item.amount, item.currency)}</small>}
        </li>)}</ul>}
      </section>
      <Table key={JSON.stringify([base, filters, requestedPage])} title={source === 'ledger' ? 'Recorded transactions' : 'Payment attempts'}
        columns={columns} total={result.total} page={result.page} previous={result.page > 1 ? pageLink(result.page - 1) : undefined}
        next={result.page * result.size < result.total && result.page < 10000 ? pageLink(result.page + 1) : undefined}
        empty="Change the date range or filters to see more payment records."
        rows={result.rows.map(row => ({
          id: row.origin + '-' + row.id,
          href: url(path + '/' + row.id, { ...base, ...filters, page: String(result.page), origin: row.origin }),
          cellLinks: [undefined, row.order ? url(ordersPath + '/' + row.order, { region }) : undefined],
          values: [row.reference || row.id, orderLabel(row), row.customer ?? '', row.method ?? '',
            statusLabel(row.state), amount(row.amount, row.currency), orderDate(row.date, region)],
          numeric: [null, null, null, null, null, null, row.date ? Date.parse(row.date) : null],
        }))}/>
    </>}
  </div>;
}

function searchFilters(q: Query) {
  const currency = param(q, 'currency')?.toUpperCase();
  const state = param(q, 'state');
  return {
    q: param(q, 'q')?.trim().slice(0, 100) || undefined,
    state: state && Object.hasOwn(states, state) ? state : undefined,
    currency: /^[A-Z]{3}$/.test(currency ?? '') ? currency : undefined,
    from: dateParam(param(q, 'from')), to: dateParam(param(q, 'to')),
    sort: param(q, 'sort') === 'oldest' ? 'oldest' : undefined,
  };
}
