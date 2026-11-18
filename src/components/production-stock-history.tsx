import Link from 'next/link';
import { api, ApiError, arr, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { reference } from '@/lib/advanced';
import { dateParam, param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { posStaff } from '@/lib/production-pos';
import { has, type Region } from '@/lib/sections';
import { RegistryPageSize } from './production-registry-size';
import { StockHistoryItems, StockTransferInvoice } from './production-stock-history-actions';
import design from './production-catalog-details.module.css';
import styles from './production-catalog.module.css';
import layout from './production-locations.module.css';

const pageSizes = ['20','40','60','80','100','all'];
const countryDate = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Dhaka' });
const asDate = (value: unknown) => Number.isFinite(Date.parse(str(value))) ? countryDate.format(new Date(str(value))) : '—';
const asNumber = (value: unknown) => typeof value === 'number' ? value : 0;
const locationName = (location: unknown) => str(obj(location).name) || str(obj(location).business_location_name) || '—';
const variants = (value: unknown) => Object.values(obj(value)).filter(option => typeof option === 'string').join(' · ');

async function records(path: string, rowKey: string, params: Record<string, string | undefined>, auth: Session, batchSize: number) {
  const load = async (page: number) => obj(await api(url(path, { ...params, page: String(page), limit: String(batchSize) }), auth.token));
  const initial = await load(1);
  const rows = arr(initial[rowKey]).map(obj);
  const pages = Math.ceil((Number(obj(initial.meta).total) || rows.length) / batchSize);
  for (let page = 2; page <= pages; page += 6) {
    const batch = await Promise.all(Array.from({ length: Math.min(6, pages - page + 1) }, (_, index) => load(page + index)));
    rows.push(...batch.flatMap(result => arr(result[rowKey]).map(obj)));
  }
  return rows;
}

export async function ProductionStockHistory({ auth, q, region, mode }: { auth: Session; q: Query; region: Region; mode: 'adjustment' | 'transfer' | 'inventory' }) {
  if (!has(auth.staff, 'stock.view')) throw new ApiError(403);
  const adjustment = mode === 'adjustment';
  const inventory = mode === 'inventory';
  const endpoint = adjustment ? '/stocks/adjustment' : '/stocks/admin/transfer-history';
  const path = '/dashboard/' + (adjustment ? 'stock-adjustment/all' : inventory ? 'inventory/transfer-history' : 'stock-transfer/all');
  const requested = param(q, 'limit') ?? '';
  const limit = pageSizes.includes(requested) ? requested : '20';
  const regionQuery = region === 'INTERNATIONAL' ? region : undefined;
  const action = param(q, 'action') ?? '';
  const sku = (param(q, 'sku') ?? '').trim().slice(0, 80);
  const location = param(q, 'location') ?? '';
  const operator = param(q, 'operator') ?? '';
  const from = dateParam(param(q, 'from'));
  const to = dateParam(param(q, 'to'));
  const validAction = ['ADDITION', 'DEDUCTION'].includes(action) ? action : undefined;
  const query = adjustment ? { region: regionQuery, action: validAction, sku, location, operator, from, to } : { region: regionQuery };
  const amount = new Intl.NumberFormat('en', { style: 'currency', currency: region === 'BD' ? 'BDT' : 'USD' });
  const [items, places, staff] = await Promise.all([
    records(endpoint, adjustment ? 'data' : 'stockTransferHistory', adjustment ? {
      business_location: mongoId(location) ? location : undefined, action: validAction, adjust_by: mongoId(operator) ? operator : undefined,
      sku: sku.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&'), startDate: from && from + 'T00:00:00' + (region === 'BD' ? '+06:00' : 'Z'),
      endDate: to && to + 'T23:59:59.999' + (region === 'BD' ? '+06:00' : 'Z'),
    } : {}, auth, adjustment ? 100 : 250),
    adjustment ? api(url('/business-location', { region, limit: '10000' }), auth.token).then(result => arr(obj(result).businessLocations).map(obj)) : [],
    adjustment && has(auth.staff, 'user.view') ? posStaff(auth).catch(() => []) : [],
  ]);
  const placeIds = new Set(places.map(reference));
  const scoped = items.filter(row => {
    if (adjustment) return placeIds.has(reference(row.business_location));
    const source = obj(row.from), destination = obj(row.to);
    if (!reference(source) || !reference(destination) || (str(source.region) || 'BD') !== region || (str(destination.region) || 'BD') !== region) return false;
    if (!inventory) return true;
    return (str(source.type) || str(source.business_location_type)) === 'WAREHOUSE'
      && (str(destination.type) || str(destination.business_location_type)) === 'OUTLET';
  });
  const pageSize = limit === 'all' ? Math.max(scoped.length, 1) : Number(limit);
  const page = limit === 'all' ? 1 : Math.min(Math.max(1, Math.ceil(scoped.length / pageSize)), Math.max(1, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
  const rows = scoped.slice((page - 1) * pageSize, page * pageSize);
  const adjustmentStaff = new Map(staff.map(row => [row.id, row.name]));
  if (adjustment) for (const row of scoped) {
    const staffId = reference(row.adjust_by);
    const staffName = str(obj(row.adjust_by).full_name);
    if (staffId && staffName) adjustmentStaff.set(staffId, staffName);
  }
  const headers = adjustment ? ['Date','Items','Action','Total Amount','Location','Reason','Adjust By']
    : inventory ? ['SL','Transfer Date','From','To','Products','Transfared By'] : ['Date','Items','From','To','Expenses','Transfer By','Actions'];
  const pageLink = (number: number) => url(path, { ...query, limit, page: number === 1 ? undefined : String(number) });
  const locationSelect = <label className={styles.field}>Business Location<select defaultValue={location} name="location">
    <option value="">Select business location</option>{places.map(place => <option key={reference(place)} value={reference(place)}>{locationName(place)}</option>)}</select></label>;
  return <section className={styles.page}>
    <header className={styles.header}><h1>{adjustment ? 'All Stock Adjustments' : inventory ? 'Inventory Transfer History' : 'All Stock Transfers'}</h1></header>
    {adjustment && <form action={adminPath(path)} className="panel filters">
      {regionQuery && <input type="hidden" name="region" value={regionQuery}/>}
      <label className={styles.field}>SKU<input name="sku" defaultValue={sku} maxLength={80} placeholder="Search by sku"/></label>
      {locationSelect}
      <label className={styles.field}>Action<select defaultValue={validAction ?? ''} name="action"><option value="">Select action</option>
        <option value="ADDITION">Add Stock</option><option value="DEDUCTION">Deduct Stock</option></select></label>
      <label className={styles.field}>Adjust By<select defaultValue={operator} name="operator"><option value="">Select user</option>
        {[...adjustmentStaff.entries()].map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <label className={styles.field}>Date Range From<input name="from" defaultValue={from} type="date"/></label>
      <label className={styles.field}>Date Range To<input name="to" defaultValue={to} type="date"/></label>
      <button className={styles.primary}>Apply Filter</button><Link className={styles.outline} href={url(path, { region: regionQuery })}>Clear Filter</Link>
    </form>}
    <div className={layout.list}><table className={styles.table}>
      <thead><tr>{headers.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => adjustment ? <AdjustmentRow row={row} key={reference(row)} amount={amount}/> :
        <TransferRow row={row} key={reference(row)} index={(page - 1) * pageSize + index + 1} inventory={inventory} amount={amount}/>)}</tbody>
      {!rows.length && <tbody><tr><td colSpan={headers.length} className={styles.empty}>No data found!</td></tr></tbody>}
    </table></div>
    <nav className={design.pages} aria-label="Stock history pages">
      <RegistryPageSize path={path} params={query} choices={pageSizes} current={limit}/>
      {page > 1 ? <Link className={styles.outline} href={pageLink(page - 1)}>Previous</Link> : <button className={styles.outline} disabled>Previous</button>}
      {page * pageSize < scoped.length ? <Link className={styles.outline} href={pageLink(page + 1)}>Next</Link> : <button className={styles.outline} disabled>Next</button>}
    </nav>
  </section>;
}

function AdjustmentRow({ row, amount }: { row: RecordData; amount: Intl.NumberFormat }) {
  return <tr>
    <td>{asDate(row.activities_date ?? row.createdAt)}</td>
    <td>{arr(row.products).map(obj).map((product, index) => <div key={index}>
      {str(obj(product.product).name) || str(obj(product.selected_variant).sku)} · {asNumber(product.quantity)}
      {Boolean(obj(product.selected_variant).sku) && <small> {str(obj(product.selected_variant).sku)}</small>}
    </div>)}</td>
    <td>{row.action === 'ADDITION' ? 'Add Stock' : row.action === 'DEDUCTION' ? 'Deduct Stock' : str(row.action)}</td>
    <td>{amount.format(asNumber(row.total_amount))}</td><td>{locationName(row.business_location)}</td>
    <td>{str(row.note) || '—'}</td><td>{str(obj(row.adjust_by).full_name) || '—'}</td>
  </tr>;
}

function TransferRow({ row, index, inventory, amount }: { row: RecordData; index: number; inventory: boolean; amount: Intl.NumberFormat }) {
  const items = arr(row.items).map(obj).map(item => ({ sku: str(obj(item.variant).sku) || '—',
    attrs: variants(obj(item.variant).attribute_values), quantity: asNumber(item.qty) }));
  const record = { date: asDate(row.createdAt), from: locationName(row.from), to: locationName(row.to),
    operator: str(obj(row.transferBy).full_name) || '—', items, expenses: arr(row.expenses_applied).map(obj).map(item => `${str(item.type)} ${amount.format(asNumber(item.amount))}`) };
  return inventory ? <tr><td>{index}</td><td>{record.date}</td><td>{record.from}</td><td>{record.to}</td>
    <td>{items.map((item, i) => <div key={i}>SKU: {item.sku} {item.attrs && <span className={styles.activeBadge} data-active="false">{item.attrs}</span>} · {item.quantity}</div>)}</td>
    <td>{record.operator}</td></tr> : <tr><td>{record.date}</td><td><StockHistoryItems items={items}/></td><td>{record.from}</td><td>{record.to}</td>
    <td>{record.expenses.map(expense => <div key={expense}>{expense}</div>)}{!record.expenses.length && '—'}</td><td>{record.operator}</td>
    <td><StockTransferInvoice record={record}/></td></tr>;
}
