import Link from 'next/link';
import { ChevronLeft, ChevronRight, Filter, List, Plus, Search } from 'lucide-react';
import { api, ApiError, arr, mongoId, obj, str, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, perPage, printable, type Query } from '@/lib/data';
import { canOperate } from '@/lib/operations';
import { adminPath } from '@/lib/paths';
import { maxRateLines, purchaseList, purchasePage, purchasePath, purchaseRecord, purchaseStatuses, rateFormPath, ratesPath, suppliers } from '@/lib/purchases';
import { has, type Region } from '@/lib/sections';
import { PurchaseActions, PrintInvoice } from './purchase-controls';
import { PurchaseRateForm } from './purchase-rate-form';
import { Badge, Empty } from './tables';

const bdDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: '2-digit', year: 'numeric' });
const bdTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' });
const cost = (value: unknown) => printable(value, 'money', 'BDT') || '—';
const number = (value: unknown) => printable(value) || '—';
const name = (value: unknown) => str(obj(value).name) || str(obj(value).business_location_name) || '—';
const purchaseNumber = (value: unknown) => printable(value) ? '#' + printable(value) : '—';
const statusLabel = (value: string) => value[0]?.toUpperCase() + value.slice(1);

function PurchaseDate({ value }: { value: unknown }) {
  const date = new Date(str(value));
  if (Number.isNaN(date.getTime())) return <>—</>;
  return <time dateTime={date.toISOString()} title="Bangladesh time">{bdDate.format(date)}<br/>{bdTime.format(date)}</time>;
}

function PurchaseStatus({ status }: { status: string }) {
  return status === 'received' ? <span className="purchase-received">Received</span> : status ? <Badge value={status}/> : <>—</>;
}

function Pagination({ path, query, page, total }: {
  path: string; query: Record<string, string | undefined>; page: number; total: number;
}) {
  const link = (value: number) => url(path, { ...query, page: value > 1 ? String(value) : undefined });
  return <nav className="purchase-pagination" aria-label="Pagination">
    <span>Page {page} · {total.toLocaleString('en')} records</span>
    <div>
      {page > 1 && <Link className="button secondary" href={link(page - 1)}><ChevronLeft size={15}/> Previous</Link>}
      {page * perPage < total && <Link className="button secondary" href={link(page + 1)}>Next <ChevronRight size={15}/></Link>}
    </div>
  </nav>;
}

export async function AllPurchases({ auth, region, q }: { auth: Session; region: Region; q: Query }) {
  if (!has(auth.staff, 'purchase.view')) throw new ApiError(403);
  const [{ rows, page, total, filters }, vendors, locations] = await Promise.all([
    purchaseList(auth, region, q), suppliers(auth),
    has(auth.staff, 'business_locations.view') ? loadLocations(auth, region) : [],
  ]);
  const canEdit = canOperate(auth.staff, 'purchase-notes');
  const canSeeCosts = has(auth.staff, 'purchase.price.view');
  const columns = ['Purchase ID', 'Date', 'Business Location', 'Supplier', 'Total Items', 'Purchase Status',
    ...(canSeeCosts ? ['Total Cost'] : []), 'Added By', ...(canEdit || canSeeCosts ? ['Actions'] : [])];
  return <div className="purchases-workspace">
    <header className="purchase-heading"><h1>All Purchases ({total.toLocaleString('en')})</h1></header>
    <details className="panel purchase-filters" open={Object.values(filters).some(Boolean)}>
      <summary><Filter size={20}/> Filter</summary>
      <form action={adminPath(purchasePath)} className="purchase-filter-grid">
        <input type="hidden" name="region" value={region}/>
        <label className="filter-label">Purchase ID<input name="purchase_number" inputMode="numeric" pattern="[0-9]{1,12}" placeholder="Purchase number" defaultValue={filters.purchase_number}/></label>
        {vendors.length > 0 && <label className="filter-label">Supplier<select name="supplier" defaultValue={filters.supplier}>
          <option value="">All suppliers</option>{vendors.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>}
        {locations.length > 0 && <label className="filter-label">Business Location<select name="business_location" defaultValue={filters.business_location}>
          <option value="">All locations</option>{locations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>}
        <label className="filter-label">Purchase Status<select name="status" defaultValue={filters.status}>
          <option value="">All statuses</option>{purchaseStatuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select></label>
        <label className="filter-label">Purchase date from<input type="date" name="purchase_date_start" defaultValue={filters.purchase_date_start}/></label>
        <label className="filter-label">Purchase date to<input type="date" name="purchase_date_end" defaultValue={filters.purchase_date_end}/></label>
        <div className="page-actions"><button className="button primary">Apply filters</button>
          <Link className="button secondary" href={url(purchasePath, { region })}>Clear filters</Link></div>
      </form>
    </details>
    <section className="panel purchase-list" aria-label="All purchases">
      {rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Purchases table">
        <table><thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.map(row => {
            const id = str(row._id);
            const label = purchaseNumber(row.purchase_number);
            const path = purchasePath + '/' + id;
            const href = url(path, { region });
            return <tr key={id}>
              <td>{mongoId(id) ? <Link href={href}>{label}</Link> : label}</td><td><PurchaseDate value={row.purchase_date || row.createdAt}/></td>
              <td>{name(row.business_location)}</td><td>{name(row.supplier)}</td><td>{arr(row.items).length}</td>
              <td><PurchaseStatus status={str(row.status)}/></td>{canSeeCosts && <td>{cost(row.total_cost)}</td>}
              <td>{str(obj(row.created_by).full_name) || '—'}</td>
              {(canEdit || canSeeCosts) && <td className="purchase-actions-cell">{mongoId(id) && <PurchaseActions id={id} label={label}
                edit={canEdit ? url(path, { region, edit: '1' }) : undefined}
                invoice={canSeeCosts ? url(path, { region, invoice: '1' }) : undefined}/>}</td>}
            </tr>;
          })}</tbody></table>
      </div> : <Empty title="No purchases found"/>}
      <Pagination path={purchasePath} query={{ ...filters, region }} page={page} total={total}/>
    </section>
  </div>;
}

export async function DefaultRatePage({ auth, region, q }: { auth: Session; region: Region; q: Query }) {
  if (!has(auth.staff, 'defaults.purchase')) throw new ApiError(403);
  const supplierId = param(q, 'supplier') ?? '';
  const supplier = mongoId(supplierId) ? supplierId : undefined;
  const previousSupplier = param(q, 'previous_supplier');
  const page = previousSupplier !== undefined && previousSupplier !== supplierId ? 1 : purchasePage(q);
  const term = (param(q, 'q') ?? '').trim().slice(0, 80);
  const [result, vendors] = await Promise.all([
    api(url('/purchase/default/all', { supplier, page: String(page), limit: String(perPage), sortBy: 'updatedAt' }), auth.token),
    suppliers(auth),
  ]);
  const data = obj(result);
  const rows = arr(data.data).map(obj).filter(row => !term || [name(row.product), str(obj(row.variant).sku)].some(field => field.toLowerCase().includes(term.toLowerCase())));
  const canSeeCosts = has(auth.staff, 'purchase.price.view');
  return <div className="purchases-workspace purchase-rate-list">
    <header className="purchase-heading"><div><h1>Default Purchase Rates</h1><p>The buy cost and supplier used when a variant is scanned into a purchase.</p></div>
      {canOperate(auth.staff, 'purchase-rate') && <Link className="button primary" href={url(rateFormPath, { region })}><Plus size={17}/> Set rates</Link>}
    </header>
    <form action={adminPath(ratesPath)} className="panel padded purchase-rate-filters">
      <input type="hidden" name="region" value={region}/>
      {vendors.length > 0 && <label className="filter-label">Supplier<select name="supplier" defaultValue={supplier}>
        <option value="">All suppliers</option>{vendors.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>}
      <label className="filter-label">Filter this page
        <span className="search-input"><Search size={17} aria-hidden/><input name="q" maxLength={80} placeholder="Name or SKU…" defaultValue={term}/></span>
      </label>
      <input type="hidden" name="page" value={String(page)}/>
      <input type="hidden" name="previous_supplier" value={supplier ?? ''}/>
      <div className="page-actions"><button className="button primary">Apply filters</button><Link className="button secondary" href={url(ratesPath, { region })}>Clear</Link></div>
    </form>
    <section className="panel purchase-list" aria-label="Default purchase rates">
      {rows.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Rates table"><table>
        <thead><tr>{['Product', 'SKU', 'Supplier', ...(canSeeCosts ? ['Unit cost', 'Discount', 'Tax'] : [])]
          .map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={str(row._id)}>
          <td>{name(row.product)}</td><td><code>{str(obj(row.variant).sku) || '—'}</code></td><td>{name(row.supplier)}</td>
          {canSeeCosts && <><td>{number(row.unit_cost)}</td><td>{number(row.discount)}</td><td>{number(row.tax)}</td></>}
        </tr>)}</tbody>
      </table></div> : <Empty title={term ? 'No matching rates on this page' : 'No default purchase rates found'}/>}
      <Pagination path={ratesPath} query={{ region, supplier, q: term }} page={page} total={Number(obj(data.meta).total) || 0}/>
    </section>
  </div>;
}

export async function DefaultRateCreatePage({ auth, region }: { auth: Session; region: Region }) {
  if (!canOperate(auth.staff, 'purchase-rate')) throw new ApiError(403);
  return <div className="purchases-workspace purchase-rate-create">
    <header className="purchase-heading"><div className="purchase-heading-title">
      <Link className="icon-button" href={url(ratesPath, { region })} aria-label="Back to rates"><ChevronLeft size={19}/></Link>
      <h1>Default Purchase</h1>
    </div><Link className="button secondary" href={url(ratesPath, { region })}><List size={17}/> View list</Link></header>
    <PurchaseRateForm key={region} suppliers={await suppliers(auth)} region={region} maxLines={maxRateLines}/>
  </div>;
}

export async function PurchaseInvoice({ auth, region, id }: { auth: Session; region: Region; id: string }) {
  if (!has(auth.staff, 'purchase.price.view')) throw new ApiError(403);
  const row = await purchaseRecord(auth, region, id);
  return <article className="panel padded purchase-invoice">
    <div className="purchase-heading"><div><p>GriipBuddy</p><h1>Purchase Invoice {purchaseNumber(row.purchase_number)}</h1></div>
      <div className="page-actions purchase-print-hidden"><Link className="button secondary" href={url(purchasePath, { region })}>Back to purchases</Link><PrintInvoice/></div>
    </div>
    <dl className="details-grid">
      <div><dt>Supplier</dt><dd>{name(row.supplier)}</dd></div>
      <div><dt>Business Location</dt><dd>{name(row.business_location)}</dd></div>
      <div><dt>Purchase Date</dt><dd><PurchaseDate value={row.purchase_date}/></dd></div>
      <div><dt>Status</dt><dd><PurchaseStatus status={str(row.status)}/></dd></div>
    </dl>
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Invoice lines"><table>
      <thead><tr>{['Product', 'SKU', 'Quantity', 'Unit cost', 'Discount', 'Tax', 'Line total']
        .map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody>{arr(row.items).map(obj).map((item, index) => <tr key={str(item._id) || index}>
        <td>{name(item.product)}</td><td><code>{str(obj(item.variant).sku) || '—'}</code></td><td>{number(item.qty)}</td>
        <td>{cost(item.unit_cost)}</td><td>{cost(item.discount ?? 0)}</td><td>{cost(item.tax ?? 0)}</td>
        <td>{cost(Number(item.qty) * Number(item.unit_cost) - Number(item.discount ?? 0) + Number(item.tax ?? 0))}</td>
      </tr>)}</tbody>
    </table></div>
    <dl className="details-grid">
      {arr(row.expenses_applied).map(obj).map((expense, index) => <div key={str(expense._id) || index}><dt>{str(expense.type) || 'Expense'}</dt><dd>{cost(expense.amount)}</dd></div>)}
      <div><dt>Total cost</dt><dd><strong>{cost(row.total_cost)}</strong></dd></div>
      <div><dt>Supplier paid</dt><dd>{cost(row.supplier_paid)}</dd></div>
      <div><dt>Supplier due</dt><dd>{cost(row.supplier_due)}</dd></div>
    </dl>
    {!!str(row.additional_notes) && <p className="purchase-error">{str(row.additional_notes)}</p>}
  </article>;
}
