import Link from 'next/link';
import { ChevronLeft, ChevronRight, Filter, List, Plus, Search } from 'lucide-react';
import { api, ApiError, arr, mongoId, obj, str, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, perPage, printable, type Query } from '@/lib/data';
import { canOperate } from '@/lib/operations';
import { adminPath } from '@/lib/paths';
import { canEditPurchase, maxRateLines, purchaseList, purchasePage, purchasePath, purchaseRecord, purchaseStatuses, rateFormPath, ratesPath, suppliers } from '@/lib/purchases';
import type { PurchaseEditRecord } from '@/lib/purchase-edit';
import { has, type Region } from '@/lib/sections';
import { PurchaseActions, PrintInvoice } from './purchase-controls';
import { PurchaseRateForm } from './purchase-rate-form';
import { PurchaseRecordForm } from './purchase-record-form';
import { OperationActions } from './operation-actions';
import { Badge, Empty } from './tables';
import { ProductionPurchaseFilters, ProductionPurchasePageSize, ProductionRatesFilters } from './production-purchase-filters';
import { productionPurchasePath, productionRateFormPath, productionRatesPath, purchaseQueryPath } from '@/lib/production-purchase-query';
import productionStyles from './production-purchases.module.css';
import '@/app/purchases.css';

const bdDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: '2-digit', year: 'numeric' });
const bdTime = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit' });
const cost = (value: unknown) => printable(value, 'money', 'BDT') || '—';
const number = (value: unknown) => printable(value) || '—';
const name = (value: unknown) => str(obj(value).name) || str(obj(value).business_location_name) || '—';
const reference = (value: unknown) => str(obj(value)._id) || str(value);
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

export async function AllPurchases({ auth, region, q, production = false }: { auth: Session; region: Region; q: Query; production?: boolean }) {
  if (!has(auth.staff, 'purchase.view')) throw new ApiError(403);
  const [{ rows, page, total, filters, size, limit }, vendors, locations] = await Promise.all([
    purchaseList(auth, region, q, production), suppliers(auth),
    has(auth.staff, 'business_locations.view') ? loadLocations(auth, region) : [],
  ]);
  const canEdit = canEditPurchase(auth.staff);
  const canSeeCosts = has(auth.staff, 'purchase.price.view');
  const columns = [production ? 'Purchases Id' : 'Purchase ID', 'Date', 'Business Location', 'Supplier', 'Total Items', 'Purchase Status',
    ...(canSeeCosts ? ['Total Cost'] : []), 'Added By', ...(canEdit || canSeeCosts ? ['Actions'] : [])];
  return <div className={'purchases-workspace ' + (production ? productionStyles.purchases : '')}>
    <header className="purchase-heading"><h1>All Purchases ({total.toLocaleString('en')})</h1>
      {!production && region === 'BD' && has(auth.staff, 'operations.purchase') && <Link className="button secondary" href={url('/desk/operations/purchases', {region})}>Purchasing and receiving</Link>}
    </header>
    {production ? <ProductionPurchaseFilters filters={filters} locations={locations} vendors={vendors}
      statuses={purchaseStatuses.map(value => ({ value, label: statusLabel(value) }))} region={region} limit={limit}/>
      : <details className="panel purchase-filters" open={Object.values(filters).some(Boolean)}>
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
    </details>}
    <section className="panel purchase-list" aria-label="All purchases">
      {rows.length || production ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Purchases table">
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
                edit={canEdit && row.inventory_ordered !== true
                  ? production ? purchaseQueryPath('/dashboard/purchase/edit/' + id, { region }) : url(path, { region, edit: '1' })
                  : undefined}
                invoice={canSeeCosts ? url(path, { region, invoice: '1' }) : undefined}/>}</td>}
            </tr>;
          })}</tbody></table>
      </div> : <Empty title="No purchases found"/>}
      {production && !rows.length && <p className={productionStyles.noPurchases}>No data found!</p>}
      {!production && <Pagination path={purchasePath} query={{ ...filters, region }} page={page} total={total}/>}
    </section>
    {production && total > 0 && <nav className={productionStyles.purchasePages} aria-label="Purchase pages">
      <ProductionPurchasePageSize path={productionPurchasePath} limit={limit} params={{ ...filters, region }}/>
      <span>{(page - 1) * size + 1} - {Math.min(total, page * size)} of {total}</span>
      <div>
        {page > 1 ? <Link href={purchaseQueryPath(productionPurchasePath, { ...filters, region, limit, page: String(page - 1) })}>Previous</Link> : <button type="button" disabled>Previous</button>}
        {limit !== 'all' && page * size < total ? <Link href={purchaseQueryPath(productionPurchasePath, { ...filters, region, limit, page: String(page + 1) })}>Next</Link> : <button type="button" disabled>Next</button>}
      </div>
    </nav>}
  </div>;
}

export async function DefaultRatePage({ auth, region, q, production = false }: { auth: Session; region: Region; q: Query; production?: boolean }) {
  if (!has(auth.staff, 'defaults.purchase')) throw new ApiError(403);
  const supplierId = param(q, 'supplier') ?? '';
  const supplier = mongoId(supplierId) ? supplierId : undefined;
  const page = purchasePage(q);
  const term = (param(q, 'q') ?? '').trim().slice(0, 80);
  const [result, vendors] = await Promise.all([
    api(url('/purchase/default/all', { region, supplier, search: production ? undefined : term, page: String(page), limit: String(perPage), sortBy: 'updatedAt' }), auth.token),
    suppliers(auth),
  ]);
  const data = obj(result);
  const rows = arr(data.data).map(obj).filter(row => (obj(row.product).region ?? 'BD') === region)
    .filter(row => !production || !term || [name(row.product), str(obj(row.variant).sku)].some(text => text.toLowerCase().includes(term.toLowerCase())));
  const total = Number(obj(data.meta).total) || 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const canSeeCosts = has(auth.staff, 'purchase.price.view');
  return <div className={'purchases-workspace purchase-rate-list ' + (production ? productionStyles.rateList : '')}>
    <header className="purchase-heading"><div><h1>Default Purchase Rates</h1><p>{production ? 'The buy cost + supplier used when a variant is scanned into a purchase.' : 'The buy cost and supplier used when a variant is scanned into a purchase.'}</p></div>
      {canOperate(auth.staff, 'purchase-rate') && <Link className="button primary" href={url(production ? productionRateFormPath : rateFormPath, { region })}><Plus size={17}/> Set rates</Link>}
    </header>
    {production ? <ProductionRatesFilters supplier={supplier} term={term} vendors={vendors} region={region} page={page}/>
    : <form action={adminPath(ratesPath)} className="panel padded purchase-rate-filters">
      <input type="hidden" name="region" value={region}/>
      {vendors.length > 0 && <label className="filter-label">Supplier<select name="supplier" defaultValue={supplier}>
        <option value="">All suppliers</option>{vendors.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>}
      <label className="filter-label">Search rates
        <span className="search-input"><Search size={17} aria-hidden/><input name="q" maxLength={80} placeholder="Name or SKU…" defaultValue={term}/></span>
      </label>
      <div className="page-actions"><button className="button primary">Apply filters</button><Link className="button secondary" href={url(ratesPath, { region })}>Clear</Link></div>
    </form>}
    <section className="panel purchase-list" aria-label="Default purchase rates">
      {rows.length || production ? <div className="table-scroll" tabIndex={0} role="region" aria-label="Rates table"><table>
        <thead><tr>{['Product', 'SKU', 'Supplier', ...(canSeeCosts ? ['Unit cost', 'Discount', 'Tax'] : [])]
          .map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={str(row._id)}>
          <td>{name(row.product)}</td><td><code>{str(obj(row.variant).sku) || '—'}</code></td><td>{name(row.supplier)}</td>
          {canSeeCosts && <><td>{number(row.unit_cost)}</td><td>{number(row.discount)}</td><td>{number(row.tax)}</td></>}
        </tr>)}</tbody>
      </table></div> : <Empty title={term ? 'No matching rates' : 'No default purchase rates found'}/>}
      {production && !rows.length && <p className={productionStyles.noRates}>No default rates found</p>}
      {!production && <Pagination path={ratesPath} query={{ region, supplier, q: term }} page={page} total={total}/>}
    </section>
    {production && <nav className={productionStyles.ratePages} aria-label="Default rate pages">
      <span>{total} total</span>
      <div>
        {page > 1 ? <Link href={purchaseQueryPath(productionRatesPath, { region, supplier, q: term, page: String(page - 1) })}>Prev</Link> : <button type="button" disabled>Prev</button>}
        <span>{page} / {pageCount}</span>
        {page < pageCount ? <Link href={purchaseQueryPath(productionRatesPath, { region, supplier, q: term, page: String(page + 1) })}>Next</Link> : <button type="button" disabled>Next</button>}
      </div>
    </nav>}
  </div>;
}

export async function DefaultRateCreatePage({ auth, region, production = false }: { auth: Session; region: Region; production?: boolean }) {
  if (!canOperate(auth.staff, 'purchase-rate')) throw new ApiError(403);
  const list = production ? productionRatesPath : ratesPath;
  return <div className={'purchases-workspace purchase-rate-create ' + (production ? productionStyles.rateCreate : '')}>
    <header className="purchase-heading"><div className="purchase-heading-title">
      <Link className="icon-button" href={url(list, { region })} aria-label="Back to rates"><ChevronLeft size={19}/></Link>
      <h1>Default Purchase</h1>
    </div><Link className="button secondary" href={url(list, { region })}><List size={17}/> View list</Link></header>
    <PurchaseRateForm key={region} suppliers={await suppliers(auth)} region={region} maxLines={maxRateLines} production={production}/>
  </div>;
}

export async function PurchaseRecordPage({ auth, region, id, q, production = false }: { auth: Session; region: Region; id: string; q: Query; production?: boolean }) {
  if (param(q, 'invoice') === '1') return PurchaseInvoice({ auth, region, id });
  const row = await purchaseRecord(auth, region, id);
  const canEdit = canEditPurchase(auth.staff) && row.inventory_ordered !== true;
  if (param(q, 'edit') === '1') {
    if (!canEdit) throw new ApiError(403);
    const [vendors, locations] = await Promise.all([suppliers(auth), loadLocations(auth, region)]);
    const historicSupplier = reference(row.supplier);
    const historicLocation = reference(row.business_location);
    if (historicSupplier && !vendors.some(item => item.value === historicSupplier)) vendors.unshift({ value: historicSupplier, label: name(row.supplier) });
    if (historicLocation && !locations.some(item => item.value === historicLocation)) locations.unshift({ value: historicLocation, label: name(row.business_location) });
    const date = new Date(str(row.purchase_date));
    const record: PurchaseEditRecord = {
      id, revision: str(row.updatedAt), supplier: historicSupplier, location: historicLocation, status: str(row.status),
      date: Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dhaka' }).format(date) : '',
      note: str(row.additional_notes), attachments: arr(row.attachments).map(str).filter(Boolean).join('\n'),
      lines: arr(row.items).map(obj).map(item => ({ variant: reference(item.variant), title: name(item.product), sku: str(obj(item.variant).sku),
        quantity: String(item.qty ?? ''), cost: String(item.unit_cost ?? ''), discount: String(item.discount ?? 0), tax: String(item.tax ?? 0) })),
      expenses: arr(row.expenses_applied).map(obj).map(item => ({ type: str(item.type), amount: String(item.amount ?? ''), note: str(item.note) })),
    };
    if (production) return <div className="purchases-workspace"><header className="purchase-heading"><div className="purchase-heading-title">
      <Link className="icon-button" aria-label="Back to purchases" href={purchaseQueryPath(productionPurchasePath, { region })}><ChevronLeft size={19}/></Link>
      <h1>Edit Purchase</h1></div></header>
      <PurchaseRecordForm record={record} suppliers={vendors} locations={locations} region={region} production/></div>;
    return <div className="purchases-workspace"><header className="purchase-heading"><h1>Edit purchase {purchaseNumber(row.purchase_number)}</h1>
      <Link className="button secondary" href={url(purchasePath + '/' + id, { region })}>Back to purchase</Link></header>
      <PurchaseRecordForm record={record} suppliers={vendors} locations={locations} region={region}/></div>;
  }
  const withCost = has(auth.staff, 'purchase.price.view');
  const columns = ['Product', 'SKU', 'Quantity', ...(withCost ? ['Unit cost', 'Discount', 'Tax'] : [])];
  return <div className="purchases-workspace">
    <header className="purchase-heading"><h1>Purchase {purchaseNumber(row.purchase_number)}</h1>
      <div className="page-actions"><Link className="button secondary" href={url(purchasePath, { region })}>Back to purchases</Link>
        {withCost && <Link className="button secondary" href={url(purchasePath + '/' + id, { region, invoice: '1' })}>Purchase invoice</Link>}
        {canEdit && <Link className="button primary" href={url(purchasePath + '/' + id, { region, edit: '1' })}>Edit purchase</Link>}
        <OperationActions endpoint="/purchase" auth={auth} region={region} record={row} id={id}/>
      </div>
    </header>
    <section className="panel padded"><h2>Purchase details</h2>
      <dl className="details-grid">
        <div><dt>Supplier</dt><dd>{name(row.supplier)}</dd></div>
        <div><dt>Business location</dt><dd>{name(row.business_location)}</dd></div>
        <div><dt>Purchase date</dt><dd><PurchaseDate value={row.purchase_date}/></dd></div>
        <div><dt>Received</dt><dd><PurchaseDate value={row.received_at}/></dd></div>
        <div><dt>Status</dt><dd><PurchaseStatus status={str(row.status)}/></dd></div>
        <div><dt>Added by</dt><dd>{str(obj(row.created_by).full_name) || '—'}</dd></div>
      </dl>
      <h3>Purchase notes</h3><p>{str(row.additional_notes) || 'No notes recorded.'}</p>
    </section>
    <section className="panel padded"><h2>Purchase lines</h2>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Purchase lines"><table>
        <thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
        <tbody>{arr(row.items).map(obj).map((item, index) => <tr key={str(item._id) || index}>
          <td>{name(item.product)}</td><td><code>{str(obj(item.variant).sku) || '—'}</code></td><td>{number(item.qty)}</td>
          {withCost && <><td>{cost(item.unit_cost)}</td><td>{cost(item.discount ?? 0)}</td><td>{cost(item.tax ?? 0)}</td></>}
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}

async function PurchaseInvoice({ auth, region, id }: { auth: Session; region: Region; id: string }) {
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
