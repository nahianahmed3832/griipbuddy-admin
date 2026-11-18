import Link from 'next/link';
import { Coins, File, FileSpreadsheet, PackageOpen, TrendingUp, Wallet } from 'lucide-react';
import { ApiError, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { loadProductionStock, loadProductionStockDetail, stockCurrency, stockReference, stockValue, type StockViewRow, type StockSummary } from '@/lib/production-stock';
import { stockPageSizes, stockSearchPath } from '@/lib/production-stock-query';
import type { Region } from '@/lib/sections';
import { ProductThumbnail } from './product-thumbnail';
import { ProductionStockDialog, ProductionStockFiltersForm, ProductionStockPageSize } from './production-stock-controls';
import styles from './production-stock-report.module.css';

const displayQuantity = (count: number) => `${count.toLocaleString('en')} Pair/pcs`;
const locationLabel = (item: unknown) => str(obj(item).name) || str(obj(item).business_location_name) || 'N/A';

export async function ProductionStockReport({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  const state = await loadProductionStock(auth, region, q);
  const { active, rows, total, page, size, filters, summary, locations, selected, permissions } = state;
  const pageSize = size === 'all' ? Math.max(1, rows.length) : Number(size);
  const query = { page: page > 1 ? String(page) : undefined, limit: size === '20' ? undefined : size };
  const detail = param(q, 'variantId');
  const closeUrl = stockSearchPath(filters, query);
  const exportUrl = (format: string) => adminPath(url('/api/stock-report', { ...filters, format }));
  const selection = locations.filter(location => selected.includes(location.value));
  return <section className={styles.report} aria-label="Stocks Report">
    <h1>Stocks Report</h1>
    <ProductionStockFiltersForm key={region} filters={filters} locations={locations} selected={selected} />
    <div className={styles.toolbar}>
      <div className={styles.summary}>{!active ? <span className={styles.muted}>No filters applied</span> :
        summary && rows.length ? <>
          <div><strong>Total SKU:</strong> {summary.products}, &nbsp;<strong>Available Qty:</strong> {summary.quantity}</div>
          {summary.categories.length > 0 && <div><strong>Category:</strong> {summary.categories.map(item => `${item.name} Qty ${item.quantity} (Sold ${item.sold})`).join(', ')}</div>}
          {selection.length > 0 && <div><strong>Selected Locations:</strong> {selection.map(location => location.label).join(', ')}</div>}
        </> : <div><strong>Total SKU:</strong> <span className={styles.bad}>N/A</span>, &nbsp;<strong>Available Qty:</strong> <span className={styles.bad}>N/A</span></div>}
      </div>
      <div className={styles.exports}>
        <ExportButton active={rows.length > 0} href={exportUrl('production-summary-pdf')} title="Stock Summary PDF" primary />
        <ExportButton active={rows.length > 0} href={exportUrl('production-xlsx')} title="Download Excel" spreadsheet />
        <ExportButton active={rows.length > 0} href={exportUrl('production-pdf')} title="Download PDF" primary />
      </div>
    </div>
    {!active ? <div className={styles.intro}>
      <p>Select business locations or start searching to view stock data</p>
      <div>You can either:<br/>1. Select one or more business locations<br/>2. Search by SKU (searches across all locations)<br/>
        3. Use the general search (searches across all locations)</div>
    </div> : rows.length ? <>
      <StockTable rows={rows} permissions={permissions} details={id => stockSearchPath(filters, { ...query, variantId: id })} />
      {summary && <StockMetrics summary={summary} permissions={permissions}/>}
      <nav className={styles.pagination} aria-label="Stock pages">
        <ProductionStockPageSize filters={filters} size={size} options={stockPageSizes} />
        <span>{(page - 1) * pageSize + 1} - {Math.min(total, (page - 1) * pageSize + rows.length)} of {total}</span>
        <div className={styles.pageButtons}>
          {page > 1 ? <Link href={stockSearchPath(filters, { ...query, page: String(page - 1) })}>Previous</Link> : <button disabled>Previous</button>}
          {size !== 'all' && page * pageSize < total ? <Link href={stockSearchPath(filters, { ...query, page: String(page + 1) })}>Next</Link> : <button disabled>Next</button>}
        </div>
      </nav>
    </> : <div className={styles.noData}>
      <div className={styles.noDataIcon}><PackageOpen size={32} strokeWidth={1.5} /></div>
      <h2>No Stock Data Found</h2>
      <p>No stock data available for the selected business location.<br/>Try selecting a different location or check if products are assigned to this location.</p>
    </div>}
    {mongoId(detail ?? '') && <StockDetail auth={auth} id={detail!} region={region} locations={locations} closeUrl={closeUrl} canSeeCost={permissions.cost} />}
  </section>;
}

function ExportButton({ active, href, title, primary, spreadsheet }: {
  active: boolean; href: string; title: string; primary?: boolean; spreadsheet?: boolean;
}) {
  const Icon = spreadsheet ? FileSpreadsheet : File;
  const contents = <><Icon size={16} aria-hidden="true"/> {title}</>;
  const className = primary ? styles.green : styles.outline;
  return active ? <a className={className} href={href}>{contents}</a> : <button className={className} type="button" disabled>{contents}</button>;
}

function StockTable({ rows, permissions, details }: {
  rows: StockViewRow[]; permissions: { cost: boolean; profit: boolean }; details: (id: string) => string;
}) {
  const columns = ['Product Name', 'SKU', ...(permissions.cost ? ['Avg Purchase Price'] : []), 'Unit Selling Price', 'Current Stock',
    ...(permissions.cost ? ['Current Stock Value (by purchase price)'] : []), 'Current Sale Value (by sale price)',
    ...(permissions.profit ? ['Potential Profit'] : []), 'Available In Locations', 'Total Sold'];
  return <div className={styles.tableWrap} role="region" aria-label="Stock table" tabIndex={0}>
    <table className={styles.grid}><thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{mongoId(row.id) ? <Link href={details(row.id)} scroll={false}>{row.title}</Link> : row.title}</td><td>{row.sku}</td>
        {permissions.cost && <td>{stockCurrency(row.cost)}</td>}
        <td>{stockCurrency(row.price)}</td><td>{displayQuantity(row.quantity)}</td>
        {permissions.cost && <td>{stockCurrency(stockValue(row.cost, row.quantity))}</td>}
        <td>{stockCurrency(stockValue(row.price, row.quantity))}</td>
        {permissions.profit && <td>{stockCurrency(row.profit)}</td>}
        <td>{row.locations.length ? row.locations.map(location => <div key={location.id} className={styles.locationRow}>
          {location.label} – <span>{location.quantity}</span></div>) : <span className={styles.stockOut}>Stock Out</span>}</td>
        <td>{displayQuantity(row.sold)}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function StockMetrics({ summary, permissions }: { summary: StockSummary; permissions: { cost: boolean; profit: boolean } }) {
  const metrics = [
    ...(permissions.cost ? [{ title: 'Current Stock Value (by purchase rate)', value: stockCurrency(summary.cost), icon: Wallet, tone: 'green' }] : []),
    { title: 'Potential Sale Value (by sale price)', value: stockCurrency(summary.sale), icon: TrendingUp, tone: 'blue' },
    ...(permissions.profit ? [{ title: 'Potential Profit Value (by sale price)', value: stockCurrency(summary.profit), icon: TrendingUp, tone: 'orange' }] : []),
    { title: 'Total Sold Value (sell)', value: stockCurrency(summary.sold), icon: Coins, tone: 'purple' },
  ];
  return <>
    <div className={styles.metrics}>{metrics.map(({ title, value, icon: Icon, tone }) =>
      <article key={title} data-tone={tone}><div>{title}<Icon size={16} aria-hidden="true"/></div><p>{value}</p></article>)}</div>
    <div className={styles.metricStatus}><span>Real-time data</span><span>Analytics ready</span></div>
  </>;
}

async function StockDetail({ auth, region, id, closeUrl, locations, canSeeCost }: {
  auth: Session; region: Region; id: string; closeUrl: string; locations: { value: string; label: string }[]; canSeeCost: boolean;
}) {
  let data;
  try { data = await loadProductionStockDetail(auth, region, id, locations); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    return <ProductionStockDialog label="Stock Details" closeUrl={closeUrl}><p>No stock data found for this market.</p></ProductionStockDialog>;
  }
  const { product, variant, stocks, movements, siblings } = data;
  const channels = Object.entries(obj(product.sale_channels)).filter(([, used]) => used === true)
    .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1)).join(', ');
  const time = new Intl.DateTimeFormat('en-US', { timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC',
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return <ProductionStockDialog label={str(product.name)} closeUrl={closeUrl}>
    <div className={styles.detailHead}>
      <div><p><b>Product:</b> {str(product.name)}</p><p><b>SKU:</b> {str(variant.sku)}</p>
        <b>Available in locations:</b>{stocks.length ? stocks.map(stock => <p key={str(obj(stock.location)._id)}>{locationLabel(stock.location)}</p>) : <p>N/A</p>}</div>
      <div><p><b>Sale Channels:</b> {channels}</p><p><b>Total Sold:</b> {Number(product.total_sold) || 0}</p><p><b>Warranty:</b> {str(product.warranty) || 'N/A'}</p></div>
      <ProductThumbnail source={product.thumbnail} size={240} />
    </div>
    <DetailTable title="Current Stocks" columns={['Variations','SKU','Qty (Pcs/pair)','Available In Locations']} rows={stocks}
      values={item => [stockReference(variant), str(variant.sku), Number(item.available_quantity) || 0, locationLabel(item.location)]} />
    <DetailTable title="Stock Movements" columns={['SKU','Qty (Pcs/pair)','Type',...(canSeeCost ? ['Purchase Cost'] : []),'Sale Price','Business Location','Action Date','System Note']}
      rows={movements} values={item => {
        const date = Date.parse(str(item.createdAt));
        return [
          str(obj(item.variant).sku) || str(variant.sku), Number(item.qty) || 0, str(item.type).replaceAll('_', ' ').toLowerCase(),
          ...(canSeeCost ? [stockCurrency(stockValue(Number(item.cost_per_unit) || 0, Number(item.qty) || 0))] : []),
          stockCurrency(obj(item.variant).sale_price), locationLabel(item.business_location),
          Number.isFinite(date) ? time.format(date) : 'N/A', str(item.note) || 'N/A',
        ];
      }}/>
    <DetailTable title="All Variations" columns={['Variations','SKU',...(canSeeCost ? ['Purchase Price'] : []),'Regular Price','Sale Price']}
      rows={siblings} values={item => [stockReference(item), str(item.sku), ...(canSeeCost ? [stockCurrency(item.avg_purchase_price)] : []),
        stockCurrency(item.regular_price), stockCurrency(item.sale_price)]}/>
  </ProductionStockDialog>;
}

function DetailTable({ title, columns, rows, values }: {
  title: string; columns: string[]; rows: RecordData[]; values: (row: RecordData) => (string | number)[];
}) {
  return <section className={styles.detailTable}><h3>{title}</h3><div>
    <table className={styles.grid}><thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={str(row._id) || rowIndex}>
        {values(row).map((value, index) => <td key={index}>{value}</td>)}
      </tr>)}</tbody></table>
    {!rows.length && <p>No data found</p>}
  </div></section>;
}
