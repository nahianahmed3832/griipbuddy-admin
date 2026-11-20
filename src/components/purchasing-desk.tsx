import Link from 'next/link';
import { ApiError, url, type Session } from '@/lib/api';
import { exactMoney, label, operationsPath, opsApi, opsDate } from '@/lib/operations-desk';
import { purchasesPath, type Purchase, type PurchaseAccess, type PurchaseChoices, type PurchaseList, type Quote,
  type ReviewedProposal } from '@/lib/purchasing';
import type { Region } from '@/lib/sections';
import { CorrectionsForm, FinanceForms, PrintPurchase, PurchaseControls, QuoteForm, ReceiptLabels, ReceivingForm, SupplierForm } from './purchase-forms';
import '@/app/purchasing.css';

const money = (value: number | null | undefined, currency: string) => value == null ? 'Unresolved' : exactMoney(String(value), currency);
const date = (value: string | undefined, region: Region) => value ? opsDate(value, region) : 'Date not supplied';

function QuotePreview({ quote, purchase, region }: { quote: Quote; purchase: Purchase; region: Region }) {
  return <section className="ops-panel po-preview" aria-labelledby="quote-preview">
    <div className="po-preview-title"><div>
      <h2 id="quote-preview">Purchase order preview</h2>
      <p>{purchase.reference} · {purchase.state}{purchase.test && ' · Test record'}</p>
    </div><PrintPurchase /></div>
    <dl className="po-facts">
      <div><dt>Supplier</dt><dd>{quote.supplierName} · {quote.supplierReference}</dd></div>
      <div><dt>Deliver to</dt><dd>{quote.warehouseName}{quote.warehouseAddress && <><br />{quote.warehouseAddress}</>}</dd></div>
      <div><dt>Currency</dt><dd>{quote.currency}</dd></div>
      <div><dt>Requested by</dt><dd>{purchase.requester}</dd></div>
      <div><dt>Quote reference</dt><dd>{quote.quoteReference ?? 'Unresolved'}</dd></div>
      <div><dt>Quote validity</dt><dd>{date(quote.expiresAt, region)}</dd></div>
      <div><dt>Delivery terms</dt><dd>{quote.deliveryTerms ?? 'Unresolved'}</dd></div>
      <div><dt>Payment terms</dt><dd>{quote.paymentTerms ?? 'Unresolved'}</dd></div>
      {quote.fx && <div><dt>Conversion for warehouse cost</dt><dd>BDT {quote.fx.rate} per {quote.currency} · {quote.fx.evidence.reference} · {date(quote.fx.evidence.at, region)}</dd></div>}
    </dl>
    <div className="ops-scroll" role="region" aria-label="Quote lines" tabIndex={0}><table className="ops-table">
      <thead><tr><th>Product and internal SKU</th><th>Supplier SKU</th><th>Order quantity</th><th>Stock units</th><th>Quoted unit price</th><th>Line amount</th></tr></thead>
      <tbody>{quote.lines.map(row => <tr key={row.variant}><td>{row.name}<br /><strong>{row.sku}</strong></td>
        <td>{row.supplierSku ?? 'Unresolved'}</td><td>{row.quantity} × {row.purchasingUnit}</td>
        <td>{row.stockUnits}{row.conversionReference && <><br /><small>{row.conversionReference}</small></>}</td>
        <td>{money(row.unitMinor, quote.currency)}</td><td>{money(row.amountMinor, quote.currency)}</td></tr>)}</tbody>
    </table></div>
    <dl className="po-facts po-money">
      <div><dt>Quoted items</dt><dd>{money(quote.subtotalMinor, quote.currency)}</dd></div>
      <div><dt>Freight</dt><dd>{money(quote.freightMinor, quote.currency)}</dd></div>
      <div><dt>Tax</dt><dd>{money(quote.taxMinor, quote.currency)}</dd></div>
      <div><dt>Other charges</dt><dd>{money(quote.otherMinor, quote.currency)}{quote.otherReference && <> · {quote.otherReference}</>}</dd></div>
      <div><dt>{purchase.approvedAt ? 'Internally approved amount' : 'Quoted total'}</dt><dd><strong>{money(quote.totalMinor, quote.currency)}</strong></dd></div>
    </dl>
    {quote.totalMinor === null && <p>Known charges so far {money(quote.knownMinor, quote.currency)}.</p>}
    {!!purchase.blockers.length && <ul className="notice warn">{purchase.blockers.map(row => <li key={row}>{row}</li>)}</ul>}
  </section>;
}

const kindLabels: Record<string, string> = {
  draft: 'Draft created', 'draft-edited': 'Quote revised', approved: 'Internal approval', 'approval-reopened': 'Internal approval reopened',
  'supplier-sent': 'Sending reported', 'supplier-confirmed': 'Supplier confirmation recorded', 'supplier-dispatched': 'Dispatch reported',
  'supplier-cancelled': 'Supplier cancellation recorded', receipt: 'Physical receipt', 'receipt-reference-conflict': 'Delivery reference conflict',
  'remainder-closed': 'Undelivered remainder closed internally', release: 'Held goods released', correction: 'Original posting corrected',
  'correction-blocked': 'Stock correction needs reconciliation', invoice: 'Supplier invoice recorded', payment: 'Supplier payment reported',
  'verify-payment': 'Supplier payment checked by staff',
};
const evidenceType = (type: string) => type === 'manual' ? 'Manual operator report' : 'Referenced document';

function ReceiptSummary({ purchase, region }: { purchase: Purchase; region: Region }) {
  return <section className="ops-panel">
    <h2>Receiving balances</h2>
    <p>Amounts are stock units. The physically received count includes held and rejected goods. Replacements require a separate supplier agreement.</p>
    <div className="ops-scroll" role="region" aria-label="Receiving balances" tabIndex={0}><table className="ops-table">
      <thead><tr><th>Internal SKU</th><th>Ordered</th><th>Physically received</th><th>Accepted</th><th>Held</th><th>Rejected</th><th>Still expected</th><th>Closed</th></tr></thead>
      <tbody>{purchase.totals.map(row => <tr key={row.variant}>
        <td>{purchase.lines.find(line => line.variant === row.variant)?.sku}</td><td>{row.ordered}</td><td>{row.physical}</td>
        <td>{row.accepted}</td><td>{row.held}</td><td>{row.rejected}</td><td>{row.expected}</td><td>{row.closed}</td>
      </tr>)}</tbody>
    </table></div>
    {!!purchase.receiptLines.length && <ul className="po-timeline">
      {purchase.receiptLines.map(row => <li key={row._id}>
        <strong>{row.sku ?? row.item}</strong> · {row.seen} counted · {row.posted} accepted · {row.held} held · {row.rejected} rejected
        <small>Receipt line {row._id}{row.toOrder !== row.seen && <> · {row.toOrder} applied to order</>}</small>
        {row.exceptions.length > 0 && <small>{row.exceptions.map(label).join(' · ')}</small>}
        {purchase.postings.filter(post => post.line === row._id && post.quantity > post.corrected)
          .map(post => <ReceiptLabels key={post._id} region={region} id={purchase.id} posting={post._id} />)}
      </li>)}
    </ul>}
  </section>;
}

function FinancialSummary({ purchase, region }: { purchase: Purchase; region: Region }) {
  if (!purchase.finance) return null;
  return <section className="ops-panel">
    <h2>Supplier invoices and payments</h2>
    <div className="ops-scroll" role="region" aria-label="Supplier payment totals" tabIndex={0}><table className="ops-table">
      <thead><tr><th>Currency</th><th>Invoiced</th><th>Payments recorded</th><th>Verified by staff</th><th>Unmatched payment</th><th>Invoice balance without matched payment</th></tr></thead>
      <tbody>{purchase.finance.currencies.map(row => <tr key={row.currency}><td>{row.currency}</td>
        <td>{row.invoiced === null ? 'No invoice recorded' : money(row.invoiced, row.currency)}</td>
        <td>{money(row.recorded, row.currency)}</td><td>{money(row.verified, row.currency)}</td><td>{money(row.unmatched, row.currency)}</td><td>{row.unmatchedInvoice === null ? 'No invoice recorded' : money(row.unmatchedInvoice, row.currency)}</td>
      </tr>)}</tbody>
    </table></div>
    <ul className="po-timeline">
      {purchase.finance.records.map(row => <li key={row.id}><strong>{kindLabels[row.kind]}</strong> · {row.evidence.reference}
        {row.currency && row.amountMinor !== undefined && <> · {money(row.amountMinor, row.currency)}</>}
        {row.kind === 'payment' && <> · {row.staffVerified ? 'Staff verified' : 'Awaiting staff verification'}</>}
        <small>{date(row.evidence.at, region)} · {evidenceType(row.evidence.type)}{row.invoiceReference && <> · Invoice {row.invoiceReference}</>}</small>
      </li>)}
    </ul>
    {purchase.approvedAt && <FinanceForms region={region} purchase={purchase} />}
  </section>;
}

function Audit({ purchase, region }: { purchase: Purchase; region: Region }) {
  return <details className="ops-panel">
    <summary>Purchase and receiving audit</summary>
    <ol className="po-timeline">
      {purchase.audit.map(row => {
        const evidence = row.payload?.evidence ?? row.payload?.closure?.evidence;
        const movements = row.payload?.stock ? (Array.isArray(row.payload.stock) ? row.payload.stock : [row.payload.stock]) : [];
        return <li key={row.id}><strong>{kindLabels[row.kind] ?? label(row.kind)}</strong> · {date(row.at, region)}
          <small>Actor {row.actor ?? 'System'} · Record {row.id}</small>
          {row.payload?.receivedAt && <small>Counted {date(row.payload.receivedAt, region)}</small>}
          {evidence && <small>{evidenceType(evidence.type)} · {evidence.reference}</small>}
          {(row.payload?.reason || row.payload?.closure?.reason) && <small>{row.payload.reason ?? row.payload.closure?.reason}</small>}
          {(row.payload?.reference || row.payload?.closure?.reference) && <small>Reference {row.payload.reference ?? row.payload.closure?.reference}</small>}
          {row.payload?.evidenceReference && <small>Supporting evidence {row.payload.evidenceReference}</small>}
          {movements.map(movement => <small key={movement.movement}>Stock movement {movement.movement} · {movement.quantity} units</small>)}
          {row.payload?.movement && <small>Compensating movement {row.payload.movement} · Original {row.payload.original}</small>}
          {row.payload?.issue && <Link href={url(operationsPath + '/queue/' + row.payload.issue, { region })}>Review issue</Link>}
        </li>;
      })}
    </ol>
  </details>;
}

export async function PurchasingDesk({ auth, region, access, id, proposal: proposalId }: {
  auth: Session; region: Region; access: PurchaseAccess; id?: string; proposal?: string;
}) {
  const path = (value = '') => url(purchasesPath + value, { region });
  if (!id) {
    const data = await opsApi<PurchaseList>(auth, region, 'purchases');
    return <div className="po-desk">
      <header className="po-page-heading"><div><h1>{access.buy || access.finance ? 'Purchases and receiving' : 'Expected deliveries'}</h1>
        <p>Review supplier orders and record warehouse receipts.</p></div>
        {access.buy && <div className="po-buttons"><Link href={path('/new')} className="button primary">New purchase draft</Link>
          <Link href={path('/suppliers')} className="button secondary">Suppliers</Link></div>}</header>
      <section className="ops-panel">
        {data.orders.length === 0 ? <p>No purchase orders for this workspace.</p> : <ul className="po-list">{data.orders.map(row => <li key={row.id}>
          <div><Link href={path('/' + row.id)}>{row.reference}</Link><p>{row.supplier} · {row.warehouse}</p></div>
          <div><strong>{row.state}</strong>{row.expired && <p>Quote expired</p>}
            {row.expectedAt && <p>{row.expected} still expected · {date(row.expectedAt, region)}</p>}</div>
        </li>)}</ul>}
        {data.overflow && <p>Showing the 100 most recently updated records.</p>}
      </section>
    </div>;
  }
  if (id === 'new' || id === 'suppliers') {
    if (!access.buy) throw new ApiError(403);
    const proposal = proposalId && id === 'new' && /^[a-f\d]{64}$/.test(proposalId) ?
      await opsApi<ReviewedProposal>(auth, region, 'purchases/proposal/' + proposalId) : undefined;
    const choices = await opsApi<PurchaseChoices>(auth, region, 'purchases/choices',
      proposal ? { variant: proposal.variant, supplier: proposal.supplier } : undefined);
    return <div className="po-desk">
      <Link href={path()} className="po-back">Back to purchases</Link>
      <header className="po-page-heading"><h1>{id === 'new' ? 'New purchase draft' : 'Supplier records'}</h1></header>
      <section className="ops-panel">
        {id === 'new' ? <QuoteForm region={region} choices={choices} proposal={proposal} /> : <SupplierForm region={region} suppliers={choices.suppliers} />}
      </section>
    </div>;
  }
  if (!/^[a-f\d]{24}$/.test(id)) throw new ApiError(404);
  const purchase = await opsApi<Purchase>(auth, region, 'purchases/' + id);
  const choices = access.buy && purchase.editor ? await opsApi<PurchaseChoices>(auth, region, 'purchases/choices') : undefined;
  return <div className="po-desk po-detail">
    <Link href={path()} className="po-back">Back to purchases</Link>
    <header className="po-page-heading">
      <div><h1>{purchase.reference}</h1>
        <p>{purchase.supplier} · {purchase.warehouse}{purchase.test && ' · Test record'}</p>
      </div><span className="po-status">{purchase.state}</span>
    </header>
    {purchase.proposal && access.buy && <Link href={url(operationsPath + '/work/' + purchase.proposal, { region })}>Reviewed inventory recommendation</Link>}
    {purchase.canReceive && <p>Supplier delivery date {date(purchase.expectedAt, region)}.</p>}
    {purchase.quote && <QuotePreview region={region} quote={purchase.quote} purchase={purchase} />}
    {access.buy && <section className="ops-panel">
      <h2>Approval and supplier updates</h2>
      {choices && <details><summary>Edit draft quote</summary><QuoteForm region={region} choices={choices} purchase={purchase}/></details>}
      <PurchaseControls region={region} purchase={purchase} />
    </section>}
    {purchase.canReceive && <>
      <ReceiptSummary purchase={purchase} region={region} />
      {access.receive && <section className="ops-panel">
        <h2>Record a physical receipt</h2><ReceivingForm region={region} purchase={purchase} />
      </section>}
      {access.buy && <section className="ops-panel"><h2>Inspections and corrections</h2>
        <CorrectionsForm region={region} purchase={purchase} />
      </section>}
    </>}
    <FinancialSummary purchase={purchase} region={region} />
    <Audit purchase={purchase} region={region} />
  </div>;
}
