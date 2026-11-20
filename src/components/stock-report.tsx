import Link from 'next/link';
import { api, ApiError, arr, mongoId, obj, str, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, printable, valueAt, type Query } from '@/lib/data';
import { canOperate } from '@/lib/operations';
import { adminPath } from '@/lib/paths';
import { has, type Region } from '@/lib/sections';
import { stockColumns, stockEndpoint, stockFilters, stockPath } from '@/lib/stock-report';
import { PageHeading } from './dashboard';
import { Table } from './tables';
import { PrintReport } from './print-report';
import { ProductionStockReport } from './production-stock-report';

export async function StockReport({ auth, q, region, action, production = false }: {
  auth: Session; q: Query; region: Region; action?: 'stock-adjust' | 'stock-transfer'; production?: boolean;
}) {
  if (!has(auth.staff, 'stock.view') || action && !canOperate(auth.staff, action)) throw new ApiError(403);
  if (production && !action) return <ProductionStockReport auth={auth} q={q} region={region}/>;
  const filters = stockFilters(q, region);
  const printing = !action && param(q,'print') === '1';
  const page = printing ? 1 : Math.min(10000, Math.max(1, Number.parseInt(param(q,'page') ?? '', 10) || 1));
  const path = !action ? stockPath : '/desk/inventory/' + (action === 'stock-adjust' ? 'adjustments' : 'transfers') + '/new';
  const [raw, locations] = await Promise.all([
    api(url(stockEndpoint, { ...filters, page: String(page), print: printing ? '1' : undefined }), auth.token).then(obj),
    !printing && has(auth.staff, 'business_locations.view') ? loadLocations(auth, region).catch(() => []) : [],
  ]);
  const meta = obj(raw.meta);
  const total = Number(meta.total) || 0;
  const perPage = Number(meta.limit) || 20;
  const records = arr(raw.data).map(obj);
  const rows = records.map((row,index) => {
    const id = str(obj(row.variant)._id);
    return { id: str(row._id) || String(index), values: stockColumns.map(column => printable(valueAt(row, column.fields))),
      href: !printing && mongoId(id) ? url(stockPath + '/' + id, { region, action }) : undefined };
  });
  return <div className={printing ? 'stock-print stock-report' : 'stock-report'}>
    <PageHeading eyebrow="INVENTORY / STOCK" title={action ? (action === 'stock-adjust' ? 'Adjust stock' : 'Transfer stock') : 'Stocks report'}
      description={action ? 'Find the variant you need, then open its record to select the location and quantity.' : 'Review available stock and units reserved, received or sold by location.'}>
      {printing ? <><PrintReport/><Link className="button secondary" href={url(path, filters)}>Back to stock</Link></> : !action &&
        <><a className="button secondary" href={adminPath(url('/api/stock-report', filters))}>Download Excel</a>
          <Link className="button secondary" href={url(path,{ ...filters, print:'1' })}>Print / PDF</Link></>}
    </PageHeading>
    {!printing && <form action={adminPath(path)} className="panel filters">
      <input type="hidden" name="region" value={region}/>{filters.product && <input type="hidden" name="product" value={filters.product}/>}
      <label className="filter-label">Product, SKU or barcode<input type="search" name="q" maxLength={100} defaultValue={filters.q}/></label>
      {locations.length > 0 && <label className="filter-label">Location<select name="location" defaultValue={filters.location || ''}>
        <option value="">All locations</option>{locations.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>}
      <label className="filter-label">Minimum on hand<input type="number" min={0} max={99999999} name="min" defaultValue={filters.min}/></label>
      <label className="filter-label">Maximum on hand<input type="number" min={0} max={99999999} name="max" defaultValue={filters.max}/></label>
      <label className="filter-label">Sort by<select name="sort" defaultValue={filters.sort || 'recent'}><option value="recent">Last updated</option>
        <option value="product">Product</option><option value="sku">SKU</option><option value="quantity">On hand</option></select></label>
      <label className="filter-label">Order<select name="order" defaultValue={filters.order || 'desc'}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
      <button className="button primary">Apply filters</button><Link className="button subtle" href={url(path, {region})}>Reset</Link>
    </form>}
    {printing && total > perPage && <p className="notice">The print view shows the first {perPage} of {total} rows. Narrow the filters or use Excel for all matching rows.</p>}
    <Table title="Stock by location" columns={stockColumns} rows={rows} exportable={false} page={printing ? undefined : page} total={total}
      previous={!printing && page > 1 ? url(path,{ ...filters, page:String(page-1) }) : undefined}
      next={!printing && page*perPage < total ? url(path,{ ...filters, page:String(page+1) }) : undefined}/>
  </div>;
}
