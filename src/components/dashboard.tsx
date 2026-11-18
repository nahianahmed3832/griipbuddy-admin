import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { canReadTransactions, readTransactions, transactionsPath } from '@/lib/transactions';
import { ArrowRight, BellRing, Boxes, ChevronRight, CircleAlert, ClipboardList, Info, Package, RefreshCw, ShoppingBag, TrendingUp, Truck, Wallet } from 'lucide-react';
import { api, arr, operationsEnabled, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, printable, valueAt, type Query } from '@/lib/data';
import { overviewQuery } from '@/lib/overview';
import { canReadHybridReports, loadHybridReportOrders } from '@/lib/hybrid-orders';
import { appendQuality, comparisonStart, mergeHybridOverview, trailingStart } from '@/lib/hybrid-reporting';
import { has, visibleSections, type Region } from '@/lib/sections';
import { SectionIcon } from './icons';
import { TrendChart } from './trend-chart';
import { ProductionReportChart } from './production-report-chart';
import { ProductThumbnail } from './product-thumbnail';
import { OverviewFilters } from './overview-filters';
import './production-overview.css';

export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const formatCount = (value: unknown, production = false) => number(value)?.toLocaleString(production ? 'en-IN' : 'en-US') ?? '—';
const percent = (value: unknown) => number(value) === undefined ? '—' : new Intl.NumberFormat('en', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value as number);
const days = (value: unknown) => number(value) === undefined ? '—' : Number(value).toFixed(1) + ' d';
const hours = (value: unknown) => number(value) === undefined ? '—' : Number(value) >= 48 ? days(Number(value) / 24) : Math.round(Number(value)) + ' h';

type MetricTone = 'success' | 'warning' | 'danger';
function rateTone(value: unknown, warn: number, alert: number): MetricTone | undefined {
  return typeof value !== 'number' ? undefined : value >= alert ? 'danger' : value >= warn ? 'warning' : 'success';
}

function Metric({ title, value, detail, current, prior, lowerIsBetter = false, definition, estimated, href, production, tone }: {
  title: string; value: string; detail?: string; current?: unknown; prior?: unknown; lowerIsBetter?: boolean;
  definition?: string; estimated?: string; href?: string; production?: boolean; tone?: MetricTone;
}) {
  const baseline = number(prior);
  const actual = number(current);
  const change = baseline && actual !== undefined ? (actual - baseline) / Math.abs(baseline) : undefined;
  const neutralChange = change !== undefined && Math.abs(change) < 0.0005;
  const name = production ? <span>{title}</span> : <h3>{title}</h3>;
  const body = <>
    <div className="overview-metric-title">{name}
      {definition && <span className="overview-metric-help">
        <button type="button" aria-label="What does this mean?"><Info size={14} aria-hidden="true"/></button>
        <span role="tooltip">{definition}</span>
      </span>}
      {estimated && <span className="overview-metric-help">
        <button type="button" className="overview-estimated">Estimated</button>
        <span role="tooltip">{estimated}</span>
      </span>}
    </div><div className="overview-value"><strong>{value}</strong>
      {change !== undefined && <span className={'overview-delta ' + (neutralChange ? 'neutral' : ((change < 0) === lowerIsBetter ? 'good' : 'bad'))}
        aria-label={percent(Math.abs(change)) + (neutralChange ? ' change' : change < 0 ? ' lower than previous period' : ' higher than previous period')}>
        {neutralChange ? '− ' : change < 0 ? '↘ ' : '↗ '}{percent(Math.abs(change))}
      </span>}
    </div>{detail && <p>{detail}</p>}
  </>;
  const className = 'overview-card' + (production ? ' overview-production-metric' : '') + (tone ? ' overview-metric-' + tone : '');
  return href ? <article className={className}><Link className="overview-metric-link" href={href} aria-label={title}/>{body}</article>
    : <article className={className}>{body}</article>;
}

function Panel({ title, detail, tone, icon, link, children, id, production = false }: {
  title: string; detail: string; tone: string; icon: React.ReactNode; link?: { href: string; label: string }; children: React.ReactNode; id?: string;
  production?: boolean;
}) {
  return <section id={id} className={'panel overview-block overview-' + tone}>
    <div className="overview-block-heading"><span className="overview-block-icon">{icon}</span>
      <div><h2>{title}</h2><p>{detail}</p></div>
      {link && <Link className="button secondary" href={link.href}>{link.label}{production ? <ChevronRight size={14}/> : <ArrowRight size={15}/>}</Link>}
    </div>
    <div className="overview-block-body">{children}</div>
  </section>;
}

type Bar = { name: string; value: number; formatted: string; suffix?: string };
function Bars({ title, bars }: { title: string; bars: Bar[] }) {
  const max = Math.max(1, ...bars.map(row => row.value));
  return <div className="overview-subpanel"><h3>{title}</h3>
    {bars.length ? <ul className="overview-bars">{bars.map(row => <li key={row.name}>
      <span>{row.name}</span><span><strong>{row.formatted}</strong>{row.suffix && <small> {row.suffix}</small>}</span>
      <div className="overview-bar" aria-hidden="true"><i style={{ width: Math.max(0, row.value / max * 100) + '%' }}/></div>
    </li>)}</ul> : <p className="muted">No data for this period</p>}
  </div>;
}

type Point = { key: string; booked: number; delivered: number };
function SalesChart({ points, currency, unit, production }: { points: Point[]; currency: string; unit: 'day' | 'week' | 'month'; production?: boolean }) {
  const money = (value: number) => printable(value, 'money', currency);
  return <div className="overview-subpanel"><h3>Booked vs delivered</h3>
    {production ? <ProductionReportChart showSinglePoint points={points} unit={unit} currency={currency} lines={[
      { key: 'booked', label: 'Booked value', color: '#4f46e5' }, { key: 'delivered', label: 'Delivered sales', color: '#059669' },
    ]}/> : <TrendChart label="Booked value and delivered sales by period" lines={['Booked value','Delivered sales']} format={money}
      points={points.map(point => ({key:point.key,label:point.key,tick:point.key.length === 10 ? point.key.slice(5) : point.key,
        values:[point.booked, point.delivered]}))}/>}
    {!production && points.length > 0 && <details className="chart-values"><summary>View chart data</summary>
      <div className="chart-values-scroll"><table><thead><tr><th scope="col">Period</th><th scope="col">Booked</th><th scope="col">Delivered</th></tr></thead>
        <tbody>{points.map(point => <tr key={point.key}><th scope="row">{point.key}</th><td>{money(point.booked)}</td><td>{money(point.delivered)}</td></tr>)}</tbody>
      </table></div>
    </details>}
  </div>;
}

function ProductTable({ products, currency, region, canOpen, production }: { products: RecordData[]; currency: string; region: Region; canOpen: boolean; production?: boolean }) {
  return <div className="overview-subpanel"><h3>Top products (orders placed)</h3>
    {products.length ? <div className="overview-product-table" tabIndex={0} role="region" aria-label="Top products table"><table><thead><tr>
      <th scope="col">Product</th><th scope="col">SKU</th><th scope="col">Units</th><th scope="col">Value</th>
    </tr></thead><tbody>{products.map((row,index) => {
      const name = str(row.name) || 'Unnamed product';
      const id = str(row.productId);
      return <tr key={index}><td><div className="overview-product"><ProductThumbnail source={row.image}/>
        {canOpen && mongoId(id) ? <Link className="table-link" href={url((production ? '/dashboard/product-details/' : '/desk/catalog/products/') + id, {region})}>{name}</Link> : name}</div></td>
        <td>{str(row.sku) || '—'}</td><td>{formatCount(row.units, production)}</td><td>{printable(row.value,'money',currency) || '—'}</td></tr>;
    })}</tbody></table></div> : <p className="muted">{production ? 'No orders placed in this period' : 'No booked products in this period'}</p>}
  </div>;
}

const outcomes = [
  ['open','Not dispatched yet','slate'], ['with_courier','With courier','blue'], ['delivered','Delivered','green'],
  ['returning','Coming back','amber'], ['returned','Returned to sender','orange'], ['cancelled','Cancelled','red'], ['other','Other','grey'],
] as const;

function Funnel({ data, production }: { data: RecordData; production?: boolean }) {
  const visible = outcomes.filter(([key]) => !production || key !== 'other');
  const total = production ? visible.reduce<number>((sum,[key]) => sum + (number(data[key]) ?? 0),0) : number(data.total) ?? 0;
  return <div className={"overview-subpanel" + (production ? " production-overview-funnel" : "")}><h3>Where the orders placed in this period are now</h3>
    <p className="muted">{production ? 'Orders a customer returned after delivery count as delivered; returned to sender means it never reached them.' :
      'Customer returns after delivery count as delivered. Returned to sender means the parcel never reached the customer.'}</p>
    {total > 0 && <div className="overview-funnel" aria-hidden="true">{visible.map(([key,,tone]) =>
      <span key={key} className={'outcome-' + tone} style={{ width: ((number(data[key]) ?? 0) / total * 100) + '%' }}/>)}</div>}
    {production && total === 0 ? <p className="muted overview-funnel-empty">No orders placed in this period</p> :
      <ul className="overview-funnel-labels">{visible.filter(([key]) => key !== 'other' || number(data.other)).map(([key,label,tone]) =>
        <li key={key}><i className={'outcome-' + tone}/>{label}{production ? ': ' : ' '}<b>{formatCount(data[key], production)}</b>{total > 0 && <small>{production ? '(' + Math.round((number(data[key]) ?? 0) / total * 100) + '%)' : percent((number(data[key]) ?? 0) / total)}</small>}</li>)}</ul>}
  </div>;
}

export async function Dashboard({ auth, q, region, production = false }: { auth: Session; q: Query; region: Region; production?: boolean }) {
  const grant = (permission: string) => has(auth.staff,permission);
  const authorized = grant('overview.view');
  const query = overviewQuery(q,region);
  const { scope, refresh } = query;
  const names: OverviewSection[] = ['actions', 'sales', 'fulfilment', 'inventory', 'finance'];
  if (region === 'BD' && grant('pre_order.view')) names.push('preorders');
  const retry = production ? param(q, 'retry') : undefined;
  const hybridScope = production && authorized && canReadHybridReports(auth, region, scope.locations);
  const requests = authorized ? names.map(section =>
    api(url('/analytics/overview/' + section, { ...scope, refresh: retry === section ? '1' : refresh,
      hybridMerge: hybridScope && section === 'fulfilment' ? '1' : undefined }), auth.token)
      .then(result => result ? obj(result) : null, () => null)) : [];
  const loadStoreLocations = authorized && grant('business_locations.view') ? loadLocations(auth, region).catch(() => []) : [];
  if (production && authorized) {
    const current = loadHybridReportOrders(auth, region, { locations: scope.locations, milestones: true, active: true,
      from: trailingStart(30), to: trailingStart(1) });
    const dated = loadHybridReportOrders(auth, region, {
      locations: scope.locations, milestones: true, from: comparisonStart(scope.from, scope.to, scope.compare !== 'none'), to: scope.to,
    });
    const combined = names.map(async (section, index) => {
      const data = await requests[index];
      if (!data) return data;
      if (section === 'actions' || section === 'finance') return mergeHybridOverview(section, data, await current);
      if (section === 'sales') return mergeHybridOverview(section, data, await dated);
      if (section === 'fulfilment') {
        const [selected, recent] = await Promise.all([dated, current]);
        if (!selected || selected.issue) return mergeHybridOverview(section, data, selected);
        const byOrder = new Map([...recent?.orders ?? [], ...selected.orders].map(order => [order.id, order]));
        const merged = mergeHybridOverview(section, data, { orders: [...byOrder.values()] });
        return recent?.issue ? appendQuality(merged, recent.issue) : merged;
      }
      return data;
    });
    const sales = combined[names.indexOf('sales')];
    const locations = await loadStoreLocations;
    const scopeKey = JSON.stringify(scope);
    const sections = names.map((section, index) => {
      const common = { auth, region, query, section };
      return <Suspense key={[section, scopeKey, refresh, retry === section ? param(q, 'attempt') : undefined].join(':')}
        fallback={<OverviewPanelState {...common}/>}>
        <LoadedOverviewSection {...common} request={combined[index]} sales={sales}/>
      </Suspense>;
    });
    return renderDashboard({ auth, region, query, locations, production, sections, sales });
  }
  const paymentScope = { region, from: scope.from, to: scope.to, currency: scope.currency };
  const showPayments = !production && authorized && !scope.locations && canReadTransactions(auth);
  const [results, locations, payments] = await Promise.all([
    Promise.all(requests),
    loadStoreLocations,
    showPayments ? Promise.allSettled([
      readTransactions(auth, paymentScope),
      readTransactions(auth, { ...paymentScope, source: 'attempts' }),
    ]) : undefined,
  ]);
  const payload = Object.fromEntries(names.map((name, index) => [name, results[index] ?? null]));
  return renderDashboard({ auth, region, query, locations, production, payload, payments, failed: results.includes(null) });
}

type OverviewSection = 'actions' | 'sales' | 'fulfilment' | 'inventory' | 'finance' | 'preorders';
type OverviewQuery = ReturnType<typeof overviewQuery>;
type OverviewResponse = Promise<RecordData | null>;
type PanelRequest = { auth: Session; region: Region; query: OverviewQuery; section: OverviewSection };
type PaymentResult = PromiseSettledResult<Awaited<ReturnType<typeof readTransactions>>>;

const productionPanels = {
  actions: { title: 'Needs attention', detail: 'Live counts, independent of the selected period. Click a tile to open the list.', tone: 'attention', icon: BellRing,
    count: 8, report: ['pending-fulfilment', 'pending_fulfilment', 'Every order needing action'] },
  sales: { title: 'Sales', detail: 'Orders placed (demand) and orders delivered (revenue) are counted separately.', tone: 'sales', icon: TrendingUp,
    count: 5, report: ['sales-summary', 'sales_summary', 'Sales report'] },
  fulfilment: { title: 'Fulfilment', detail: 'How quickly orders go out, and how many reach the customer.', tone: 'fulfilment', icon: Truck,
    count: 3, report: ['order-status', 'order_status', 'Order status report'] },
  inventory: { title: 'Inventory', detail: 'Stock as of now, in the selected locations.', tone: 'inventory', icon: Boxes,
    count: 4, report: ['stock-valuation', 'stock_valuation', 'Stock valuation'] },
  finance: { title: 'Money', detail: 'Operating expenses, cash still with the courier, and stock bought. Profit figures will come with the P&L report.',
    tone: 'money', icon: Wallet, count: 4 },
  preorders: { title: 'Pre-orders', detail: 'Customer requests sourced from China. Advances are deposits until the pre-order is delivered.',
    tone: 'preorders', icon: ClipboardList, count: 4 },
} as const;

function OverviewPanelState({ auth, region, query, section, error }: PanelRequest & { error?: boolean }) {
  const config = productionPanels[section];
  const { title, detail, tone, icon: Icon, count } = config;
  const report = 'report' in config ? config.report : undefined;
  const { period, scope } = query;
  const link = report && has(auth.staff, 'report.' + report[1] + '.view')
    ? { href: url('/dashboard/reports/' + report[0], { region: region === 'BD' ? undefined : region, ...(section === 'sales' || section === 'fulfilment' ? { period } : {}) }), label: report[2] }
    : undefined;
  return <Panel title={title} detail={detail} tone={tone} icon={<Icon size={20}/>} link={link}
    id={section === 'actions' ? 'work-queue' : undefined} production>
    {error ? <div className="overview-section-error" role="alert"><span>Couldn&apos;t load this section.</span>
      <Link prefetch={false} replace scroll={false} href={url('/dashboard/overview', { ...scope, period, retry: section, attempt: String(Date.now()) })}>Retry</Link>
    </div> : <div className="overview-metrics overview-section-loading" aria-busy="true" aria-label={'Loading ' + title}>
      {Array.from({ length: count }, (_, index) => <div key={index}/>)}
    </div>}
  </Panel>;
}

async function LoadedOverviewSection({ request, sales, ...props }: PanelRequest & {
  request: OverviewResponse; sales: OverviewResponse;
}) {
  const data = await request;
  if (!data) return <OverviewPanelState {...props} error/>;
  return renderDashboard({ ...props, production: true, payload: { [props.section]: data }, sales });
}

function overviewReportDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z')) : '';
}

async function OverviewHeaderMeta({ sales, query, region, asOf }: {
  sales: OverviewResponse; query: OverviewQuery; region: Region; asOf?: boolean;
}) {
  const meta = obj((await sales)?.meta);
  if (asOf) {
    const date = str(meta.generated_at);
    return date && Number.isFinite(Date.parse(date)) ? <time dateTime={date}>Data as of {
      new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(date))
    }</time> : null;
  }
  const { scope } = query;
  const currency = str(meta.currency) || scope.currency || (region === 'BD' ? 'BDT' : 'USD');
  const compare = obj(meta.compare);
  const current = [overviewReportDate(meta.from || scope.from), ...(scope.from !== scope.to ? [overviewReportDate(meta.to || scope.to)] : [])].join(' – ');
  const previous = str(compare.from)
    ? [overviewReportDate(compare.from), ...(compare.from !== compare.to ? [overviewReportDate(compare.to)] : [])].join(' – ') : '';
  return <p>{[region === 'BD' ? 'Bangladesh' : 'International', currency, current, previous && 'compared with ' + previous].filter(Boolean).join(' · ')}</p>;
}

async function ProductionAdSpend({ sales, details, spending }: {
  sales: OverviewResponse; details: Parameters<typeof Metric>[0]; spending: unknown;
}) {
  const delivered = number(obj((await sales)?.delivered).productValue);
  const spend = number(spending);
  return <Metric {...details} detail={delivered && spend !== undefined ? percent(spend / delivered) + ' of delivered sales' : undefined}/>;
}

function renderDashboard({ auth, region, query, production, payload = {}, locations = [], payments, failed, section, sections, sales: salesResource }: {
  auth: Session; region: Region; query: OverviewQuery; production: boolean; payload?: Partial<Record<OverviewSection, RecordData | null>>;
  locations?: Awaited<ReturnType<typeof loadLocations>>; payments?: PaymentResult[]; failed?: boolean; section?: OverviewSection;
  sections?: ReactNode; sales?: OverviewResponse;
}) {
  const count = (value: unknown) => formatCount(value, production);
  const counted = (value: unknown, singular: string, plural = singular + 's') => count(value) + ' ' + (value === 1 ? singular : plural);
  const grant = (permission: string) => has(auth.staff, permission);
  const authorized = grant('overview.view');
  const { period, scope } = query;
  const paymentScope = { region, from: scope.from, to: scope.to, currency: scope.currency };
  const showPayments = Boolean(payments);
  const paymentCount = (source: number, state: string) => {
    const result = payments?.[source];
    return result?.status === 'fulfilled'
      ? result.value.summary.filter(entry => entry.state === state).reduce((sum, entry) => sum + entry.count, 0)
      : undefined;
  };
  const amountByCurrency = (state: string) => {
    const result = payments?.[0];
    return result?.status === 'fulfilled' ? result.value.summary.filter(entry => entry.state === state && entry.currency && entry.amount !== null)
      .map(entry => printable(entry.amount, 'money', entry.currency) + ' ' + entry.currency).join(' · ') : undefined;
  };
  const { actions, sales, fulfilment, inventory, finance, preorders } = payload;
  const currency = str(obj(sales?.meta).currency) || scope.currency || (region === 'BD' ? 'BDT' : 'USD');
  const formatMoney = (value: unknown, code: string) => {
    const amount = number(value);
    if (production && amount !== undefined) {
      return new Intl.NumberFormat(code === 'BDT' ? 'en-IN' : 'en-US', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Math.round(amount));
    }
    return printable(value, 'money', code) || '—';
  };
  const money = (value: unknown) => formatMoney(value, currency);
  const cost = (value: unknown) => formatMoney(value, 'BDT');
  const overviewPath = production ? '/dashboard/overview' : '/desk/overview';
  const reportPath = production ? '/dashboard/reports/' : '/desk/reports/';
  const link = (id: string, permission: string, title: string, filters = {}) => grant('report.' + permission + '.view')
    ? { href:url(reportPath + id, production ? { region: region === 'BD' ? undefined : region, ...filters } : { ...scope,...filters }),label:title } : undefined;
  const meta = obj(sales?.meta);
  const comparison = obj(meta.compare);
  const asOf = Object.values(payload).map(item => str(obj(item?.meta).generated_at)).filter(Boolean).sort()[0];
  const previous = str(comparison.from) ? [overviewReportDate(comparison.from), ...(comparison.from !== comparison.to ? [overviewReportDate(comparison.to)] : [])].join(' – ') : '';
  const current = [overviewReportDate(meta.from || scope.from), ...(scope.from !== scope.to ? [overviewReportDate(meta.to || scope.to)] : [])].join(' – ');
  const quick = visibleSections(auth.staff).filter(item => !['overview','workflows','settings'].includes(item.id) &&
    (item.id !== 'operations' || operationsEnabled()));
  const points = arr(obj(sales?.series).points).map(obj).flatMap(row => {
    const booked = number(row.bookedValue);
    const delivered = number(row.deliveredValue);
    return str(row.key) && booked !== undefined && delivered !== undefined ? [{key:str(row.key),booked,delivered}] : [];
  });
  const seriesUnit = obj(sales?.series).unit;
  const unit = seriesUnit === 'week' || seriesUnit === 'month' ? seriesUnit : 'day';
  const bookings = obj(sales?.bookings);
  const delivered = obj(sales?.delivered);
  const estimatedDelivery = arr(sales?.quality).map(obj).find(flag => flag.code === 'DELIVERED_DATE_ESTIMATED');
  const returns = obj(sales?.returns);
  const stock = obj(actions?.stock);
  const health = obj(actions?.dataHealth);
  const healthLabels = [
    ['negativeStockRows','stock rows below zero'], ['stockLotMismatch','stock and lot mismatches'],
    ['deliveredWithoutStockOut','delivered orders with no stock-out'], ['courierCancelledNotRestocked','courier-cancelled orders still missing restock'],
    ...(grant('purchase.price.view') ? [['zeroCostLots','lots without recorded cost']] : []),
  ];
  const warnings = healthLabels.filter(([key]) => (number(health[key]) ?? 0) > 0).map(([key,label]) => count(health[key]) + ' ' + label);
  const actionOrders = obj(actions?.orders);
  const confirm = obj(actionOrders.toConfirm);
  const waiting = obj(actionOrders.awaitingStock);
  const verify = obj(actionOrders.paymentsToVerify);
  const response = obj(actionOrders.noResponse);
  const courier = obj(actionOrders.courier);
  const preActions = obj(actions?.preorders);
  const needed = arr(waiting.topSkus).map(obj);
  const depleted = arr(stock.topOutOfStock).map(obj);
  const openOrders = link('pending-fulfilment','pending_fulfilment','Every order needing action');
  const orderQueue = (type: string, filter?: string) => grant('order.view')
    ? production ? url('/dashboard/orders', { status: filter, region: region === 'BD' ? undefined : region })
      : link('pending-fulfilment','pending_fulfilment','Open queue',{type})?.href
      ?? (filter ? url('/desk/orders/orders',{region,filter}) : undefined) : undefined;
  const legacyQueue = [
    { title:'Orders to confirm', value:confirm.orders, level:'urgent', href:orderQueue('to_confirm','PLACED,ACCEPTED,PROCESSING'), notes:[money(confirm.value), 'Oldest waiting ' + hours(confirm.oldestHours), count(confirm.over48h) + ' waiting over 48 h'] },
    { title:'Awaiting stock', value:waiting.orders, level:'check', href:orderQueue('awaiting_stock','AWAITING_STOCK'), images:needed,
      notes:[money(waiting.value), ...(needed[0] ? ['Most needed: ' + str(needed[0].sku) + ' (' + count(needed[0].units) + ' units)'] : [])] },
    { title:'Payments to verify', value:verify.orders, level:'check', href:orderQueue('payment_proof','INCOMPLETE'), notes:[money(verify.claimedAmount) + ' claimed'] },
    { title:'Customer not reachable', value:response.orders, level:'check', href:orderQueue('no_response','NO_RESPONSE'), notes:['Oldest waiting ' + hours(response.oldestHours)] },
    { title:'Overdue with courier', value:courier.overdue, level:'urgent', href:orderQueue('courier_overdue','IN_REVIEW,HANDED_OVER_TO_COURIER,IN_TRANSIT'), notes:[money(courier.overdueCod) + ' COD at risk', count(courier.inTransit) + ' parcels with the courier'] },
    { title:'Returns to handle', value:number(courier.returnRequested) !== undefined && number(courier.pendingReturn) !== undefined ? Number(courier.returnRequested) + Number(courier.pendingReturn) : undefined,
      level:'check', href:orderQueue('returns','RETURN_REQUESTED,PENDING_RETURN'), notes:[count(courier.returnRequested) + ' requested by customers',count(courier.pendingReturn) + ' on the way back'] },
    { title:'Out of stock', value:stock.outOfStock, level:'urgent', href:link('low-stock','low_stock','Stock alerts',{status:'out'})?.href, images:depleted,
      notes:[count(stock.outOfStockWithDemand) + ' with orders waiting',count(stock.lowStock) + ' running low',...(depleted[0] ? ['Example: ' + str(depleted[0].sku)] : [])] },
    { title:'Pre-orders to act on', value:preActions.total, level:'check', href:grant('pre_order.view') ? (production ? '/dashboard/pre-orders' : '/desk/orders/preorders?filter=ACTION_REQUIRED') : undefined,
      notes:[count(preActions.notQuoted) + ' waiting for a quote',count(preActions.awaitingAdvance) + ' awaiting advance',count(preActions.notShipped) + ' arrived, awaiting shipment'] },
  ];
  const queueLevel = (value: unknown, urgent = false) => Number(value) > 0 ? urgent ? 'urgent' : 'check' : 'clear';
  const queue = production ? [
    { title:'Orders to confirm', value:confirm.orders, level:Number(confirm.over48h) > 0 ? 'urgent' : queueLevel(confirm.over24h),
      href:orderQueue('to_confirm','PLACED,ACCEPTED,PROCESSING'),
      notes:[...(Number(confirm.orders) > 0 ? [money(confirm.value)] : []), ...(number(confirm.oldestHours) !== undefined ? ['Oldest waiting ' + hours(confirm.oldestHours)] : []),
        ...(Number(confirm.over48h) > 0 ? [count(confirm.over48h) + ' waiting over 48 h'] : [])] },
    { title:'Awaiting stock', value:waiting.orders, level:queueLevel(waiting.orders), images:needed, href:orderQueue('awaiting_stock','AWAITING_STOCK'),
      notes:[...(Number(waiting.orders) > 0 ? [money(waiting.value)] : []), ...(needed[0] ? ['Most needed: ' + str(needed[0].sku) + ' (' + counted(needed[0].units,'unit') + ')'] : [])] },
    { title:'Payments to verify', value:verify.orders, level:queueLevel(verify.orders), href:orderQueue('payment_proof','INCOMPLETE'),
      notes:Number(verify.orders) > 0 ? [money(verify.claimedAmount) + ' claimed (bKash/Nagad proof)'] : [] },
    { title:'Customer not reachable', value:response.orders, level:queueLevel(response.orders), href:orderQueue('no_response','NO_RESPONSE'),
      notes:number(response.oldestHours) !== undefined ? ['Oldest ' + hours(response.oldestHours)] : [] },
    { title:'Overdue with courier', value:courier.overdue, level:queueLevel(courier.overdue,true), href:orderQueue('courier_overdue','IN_REVIEW,HANDED_OVER_TO_COURIER,IN_TRANSIT'),
      notes:[...(Number(courier.overdue) > 0 ? [money(courier.overdueCod) + ' COD at risk'] : []), counted(courier.inTransit,'parcel') + ' with the courier'] },
    { title:'Returns to handle', value:Number(courier.returnRequested || 0) + Number(courier.pendingReturn || 0),
      level:queueLevel(Number(courier.returnRequested || 0) + Number(courier.pendingReturn || 0)), href:orderQueue('returns','RETURN_REQUESTED,PENDING_RETURN'),
      notes:[count(courier.returnRequested) + ' requested by customers', count(courier.pendingReturn) + ' on the way back'] },
    { title:'Out of stock', value:stock.outOfStock, level:Number(stock.outOfStockWithDemand) > 0 ? 'urgent' : queueLevel(stock.outOfStock),
      href:link('low-stock','low_stock','Stock alerts')?.href ?? '/dashboard/check-outlet-stocks', images:depleted.slice(0,4),
      notes:[...(Number(stock.outOfStockWithDemand) > 0 ? [count(stock.outOfStockWithDemand) + ' with orders waiting'] : []),
        count(stock.lowStock) + ' running low (under 7 days of stock)', ...(depleted[0] ? ['e.g. ' + str(depleted[0].sku)] : [])] },
    ...(actions?.preorders ? [{ title:'Pre-orders to act on', value:preActions.total, level:queueLevel(preActions.total), href:'/dashboard/pre-orders',
      notes:[...(Number(preActions.notQuoted) > 0 ? [count(preActions.notQuoted) + ' waiting for a quote'] : []),
        ...(Number(preActions.awaitingAdvance) > 0 ? [count(preActions.awaitingAdvance) + ' quoted, no advance yet'] : []),
        ...(Number(preActions.notShipped) > 0 ? [count(preActions.notShipped) + ' arrived, not shipped'] : [])] }]
      : [{ title:'Data health', value:healthLabels.reduce((sum,[key]) => sum + Number(health[key] || 0),0),
        level:queueLevel(healthLabels.reduce((sum,[key]) => sum + Number(health[key] || 0),0)), href:link('data-health','data_health','Data health')?.href, notes:warnings }]),
  ] : legacyQueue;
  const dispatch = obj(fulfilment?.dispatch);
  const success = obj(fulfilment?.deliverySuccess);
  const deliveryTime = obj(fulfilment?.deliveryTime);
  const position = obj(inventory?.position);
  const value = obj(inventory?.value);
  const aging = obj(inventory?.aging);
  const dead = obj(inventory?.deadStock);
  const productionMetric = (definition: string, href?: string, tone?: MetricTone) => production ? { definition, href, tone, production } : {};
  const expenses = obj(finance?.expenses);
  const spendMetric = {
    title: 'Ad spend', value: money(expenses.adSpend), current: expenses.adSpend, prior: obj(expenses.previous).adSpend, lowerIsBetter: production,
    ...productionMetric('Recorded advertising expenses during the selected period.'),
  };
  const received = obj(finance?.stockReceived);
  const cod = obj(finance?.codWithCourier);
  const phases = obj(preorders?.phases);
  const phaseCount = preorders ? ['request','chinaToBd','bdToCustomer', ...(production ? [] : ['onHold'])].reduce((sum,key) => sum + (number(phases[key]) ?? 0),0) : undefined;
  const bars = (rows: unknown, name: string, valueKey: string, suffix?: string, moneyFormat?: (value: unknown) => string): Bar[] =>
    arr(rows).map(obj).flatMap(row => {
      const amount = number(row[valueKey]);
      return amount === undefined ? [] : [{name:str(row[name]),value:amount,formatted:moneyFormat ? moneyFormat(amount) : count(amount),
        suffix:suffix && number(row[suffix]) !== undefined ? count(row[suffix]) + ' units' : undefined}];
    });
  const description = [region === 'BD' ? 'Bangladesh' : 'International',currency,current,previous && 'compared with ' + previous].filter(Boolean).join(' · ');
  const asOfTime = asOf && Number.isFinite(Date.parse(asOf))
    ? new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(asOf)) : undefined;
  const header = !section && (production ? <header className="production-overview-header">
      <div><h1>Overview</h1>{salesResource ? <Suspense fallback={<p>{description}</p>}>
        <OverviewHeaderMeta sales={salesResource} query={query} region={region}/>
      </Suspense> : <p>{description}</p>}</div>
      {authorized && <div className="production-overview-actions">
        <Link href={url('/dashboard/overview', { view: 'classic', region: region === 'BD' ? undefined : region })}>Previous overview</Link>
        {salesResource && <Suspense><OverviewHeaderMeta sales={salesResource} query={query} region={region} asOf/></Suspense>}
        <Link prefetch={false} className="production-overview-refresh" href={url(overviewPath, { ...scope, period, refresh: '1' })}><RefreshCw size={16}/> Refresh</Link>
      </div>}
    </header> : <PageHeading eyebrow="WORKSPACE / OPERATIONS" title="Commerce overview" description={description}>
      {authorized && <Link className="button subtle" href={url("/desk/overview/classic", { ...scope, period })}>Previous overview</Link>}
      {authorized && asOfTime && <time className="muted" dateTime={asOf}>Data as of {asOfTime} Dhaka</time>}
      {authorized && <Link prefetch={false} className="button secondary" href={url('/desk/overview',{...scope,period,refresh:'1'})}><RefreshCw size={15}/> Refresh</Link>}
    </PageHeading>);
  const content = <>
      {actions && <Panel id="work-queue" title="Needs attention" production={production}
        detail={production ? 'Live counts, independent of the selected period. Click a tile to open the list.' : 'Current queues are independent of the selected period. Open a tile to review matching records.'}
        tone="attention" icon={production ? <BellRing size={20}/> : <CircleAlert size={23}/>} link={openOrders}>
        <div className="overview-metrics attention-metrics">{queue.filter(item => number(item.value) !== undefined).map(item => {
          const level = item.value === 0 ? 'clear' : item.level;
          const showNotes = item.value !== 0;
          const body = <><div className="attention-card-heading">{production ? <span className="attention-title">{item.title}</span> : <h3>{item.title}</h3>}
            <span className="attention-pill">{level === 'clear' ? 'All clear' : level === 'urgent' ? 'Act now' : 'Check'}</span></div>
            <strong>{count(item.value)}</strong>
            {production ? <>
              {item.images?.length ? <div className="overview-thumbnails">{item.images.map((row,index) =>
                <ProductThumbnail source={row.image} key={index} size={28} emptyPlaceholder/>)}</div> : null}
              <div className="production-attention-notes">{item.notes.map(note => <div key={note}>{note}</div>)}</div>
            </> : showNotes && <>{item.images?.length ? <div className="overview-thumbnails">{item.images.slice(0,4).map((row,index) =>
              <ProductThumbnail source={row.image} key={index} size={32}/>)}</div> : null}<p>{item.notes.map(note => <span key={note}>{note}</span>)}</p></>}
          </>;
          return item.href ? <Link key={item.title} className={'overview-card attention-' + level} href={item.href}>{body}</Link>
            : <article key={item.title} className={'overview-card attention-' + level}>{body}</article>;
        })}</div>
        {warnings.length > 0 && <div className="notice warn"><CircleAlert size={17}/><p><b>Data health</b> · {warnings.join(' · ')}. Stock and cost figures may be affected.
          {link('data-health','data_health','See the records') && <> <Link className="table-link" href={link('data-health','data_health','See the records')!.href}>See the records</Link></>}</p></div>}
        {production && <Quality data={actions.quality}/>}
      </Panel>}
      {sales && <Panel title="Sales" production={production}
        detail={production ? 'Orders placed (demand) and orders delivered (revenue) are counted separately.' : 'Bookings track orders placed. Delivered sales track product value on delivered orders.'}
        tone="sales" icon={production ? <TrendingUp size={20}/> : <ShoppingBag size={23}/>} link={link('sales-summary','sales_summary','Sales report', production ? {period} : {})}>
        <div className="overview-metrics">
          <Metric title="Orders placed" value={count(bookings.orders)} current={bookings.orders} prior={obj(bookings.previous).orders} detail={money(bookings.orderValue) + (production ? ' incl. delivery' : ' including delivery')}
            {...productionMetric('Orders placed during the selected period.', grant('order.view') ? '/dashboard/orders' : undefined)}/>
          <Metric title="Booked value" value={money(bookings.productValue)} current={bookings.productValue} prior={obj(bookings.previous).productValue} detail={(production ? 'Avg ' : 'Average ') + money(bookings.avgProductValue) + ' per order'}
            {...productionMetric('Product value of orders placed during the selected period.')}/>
          <Metric title="Delivered sales" value={money(delivered.productValue)} current={delivered.productValue} prior={obj(delivered.previous).productValue}
            detail={count(delivered.orders) + ' orders · ' + count(delivered.units) + ' units · ' + (production ? '+' : '') + money(delivered.deliveryIncome) + ' delivery income'}
            estimated={production && estimatedDelivery ? count(estimatedDelivery.affected) + ' of ' + count(estimatedDelivery.total) + ' delivered orders have no recorded delivery time; their last update time is used.' : undefined}
            {...productionMetric('Product value on orders delivered during the selected period.')}/>
          <Metric title="Average order value" value={money(delivered.avgOrderValue)} current={delivered.avgOrderValue} prior={obj(delivered.previous).avgOrderValue} detail={production ? undefined : 'Delivered orders'}
            {...productionMetric('Average order value for delivered orders.')}/>
          <Metric title="Cancelled before dispatch" value={production && number(bookings.cancellationRate) !== undefined ? (Number(bookings.cancellationRate) * 100).toFixed(1) + '%' : percent(bookings.cancellationRate)} current={bookings.cancellationRate} prior={obj(bookings.previous).cancellationRate}
            detail={count(bookings.cancelledBeforeDispatch) + ' of ' + count(bookings.orders) + ' orders'} lowerIsBetter {...productionMetric('Share of orders placed in the period that were cancelled before dispatch.', undefined, rateTone(bookings.cancellationRate, 0.05, 0.15))}/>
        </div>
        <div className="overview-split"><SalesChart points={points} currency={currency} unit={unit} production={production}/>
          <div className={'overview-stack' + (production ? ' production-overview-combined' : '')}>
            <Bars title="Booked value by category" bars={bars(sales.categoryMix,'name','value','units',money)}/>
            <Bars title="Orders by source" bars={bars(bookings.bySource,'source','orders').map(row => ({...row,name:row.name.replaceAll('_',' ').replace(/^./, c => c.toUpperCase())}))}/>
          </div>
        </div>
        <div className="overview-split"><ProductTable products={arr(sales.topProducts).map(obj)} currency={currency} region={region} canOpen={grant('product.view')} production={production}/>
          <div className="overview-stack"><Metric title="Returns processed" value={count(returns.orders)} detail={money(returns.value) + ' returned'}
            estimated={production && Number(returns.estimatedValues) > 0 ? "Some returns don't record a refund amount; their value is estimated from the order lines." : undefined}
            {...productionMetric('Orders returned by the customer after delivery. Returns from the courier before delivery are counted in Fulfilment as return-to-sender.', orderQueue('returns','RETURNED,PARTIAL'))}/>
            {sales.pos ? <Metric title={production ? 'POS sales' : 'Point-of-sale value'} value={money(obj(sales.pos).amount)} current={obj(sales.pos).amount}
              prior={valueAt(sales.pos,'previous.amount')} detail={count(obj(sales.pos).sales) + (Number(obj(sales.pos).sales) === 1 ? ' sale' : ' sales')}
              {...productionMetric('In-store (POS) sales by sale date. POS returns already reduce the stored sale.')}/> : null}</div>
        </div>
        <Quality data={sales.quality}/>
      </Panel>}
      {fulfilment && <Panel title="Fulfilment" production={production}
        detail={production ? 'How quickly orders go out, and how many reach the customer.' : 'Dispatch speed, delivery outcomes and time to reach the customer.'}
        tone="fulfilment" icon={<Truck size={production ? 20 : 23}/>} link={link('order-status','order_status','Order status report', production ? {period} : {})}>
        <Funnel data={obj(fulfilment.funnel)} production={production}/>
        <div className="overview-metrics overview-metrics-three">
          <Metric title="Dispatched" value={count(dispatch.orders)} current={dispatch.orders} prior={obj(dispatch.previous).orders}
            detail={'Median ' + hours(dispatch.medianHours) + ' from order · 90% within ' + hours(dispatch.p90Hours)}
            {...productionMetric('Orders handed to a courier during the selected period.')}/>
          <Metric title="Delivery success" value={percent(success.successRate)}
            detail={count(success.delivered) + ' delivered · ' + count(success.returnedToSender) + ' returned to sender (' + percent(success.rtsRate) + ') · ' + count(success.pending) + ' still open' + (production ? '' : ' · ' + count(success.windowDays) + '-day dispatch window')}
            {...productionMetric('Of orders dispatched in the last ' + count(success.windowDays) + ' days that reached a final state, the share that was delivered.', undefined, rateTone(success.rtsRate, 0.1, 0.2))}/>
          <Metric title="Delivery time" value={days(deliveryTime.medianDays)} detail={'90% within ' + days(deliveryTime.p90Days) + ' · ' + count(deliveryTime.measured) + ' orders measured'}
            {...productionMetric('Median time from dispatch to delivery.')}/>
        </div>
        <Quality data={fulfilment.quality}/>
      </Panel>}
      {inventory && <Panel title="Inventory" production={production} detail={production ? 'Stock as of now, in the selected locations.' : 'Current stock in the selected locations.'}
        tone="inventory" icon={production ? <Boxes size={20}/> : <Package size={23}/>}
        link={link('stock-valuation','stock_valuation','Stock valuation')}>
        <div className="overview-metrics">
          <Metric title="Units on hand" value={count(position.units)} detail={count(position.skusInStock) + ' SKUs in stock'}
            {...productionMetric('Physical units in the selected locations.', grant('stock.view') ? '/dashboard/check-outlet-stocks' : undefined)}/>
          {grant('purchase.price.view') && <Metric title="Value at cost" value={cost(value.costValue)}
            detail={production && (number(value.zeroCostUnits) ?? 0) > 0 ? counted(value.zeroCostUnits, 'unit') + ' without a recorded cost'
              : production && str(value.retailCurrency) && value.retailCurrency !== 'BDT' ? 'Purchase costs are recorded in BDT' : undefined}
            {...productionMetric('Remaining stock valued at the purchase cost of its lots, oldest lots first.')}/>}
          <Metric title="Value at selling price" value={formatMoney(value.retailValue, production && str(value.retailCurrency) || currency)} detail={number(value.potentialMargin) !== undefined && grant('potential.profit.view') ? 'Potential margin ' + percent(value.potentialMargin) : undefined}
            {...productionMetric('Estimated selling value of units currently on hand.')}/>
          <Metric title="Older than 180 days" value={count(aging.over180Units)} detail={[grant('purchase.price.view') && cost(aging.over180Value) + ' at cost',count(aging.over90Units) + ' units over 90 days'].filter(Boolean).join(' · ')}
            {...productionMetric('Units from lots received more than 180 days ago that are still in stock.', link('inventory-aging','inventory_aging','Inventory aging')?.href,
              (number(aging.over180Units) ?? 0) > 0 ? 'warning' : 'success')}/>
          <Metric title={'No sale in ' + (number(dead.days) ?? 60) + ' days'} value={count(dead.skus)} detail={[count(dead.units) + ' units',grant('purchase.price.view') && cost(dead.value) + ' at cost'].filter(Boolean).join(' · ')}
            {...productionMetric('SKUs with stock and no sales during the displayed number of days.', link('inventory-aging','inventory_aging','Inventory aging',{show:'dead'})?.href,
              (number(dead.skus) ?? 0) > 0 ? 'danger' : 'success')}/>
        </div>
        <Bars title="Stock age (units)" bars={bars(aging.buckets,'bucket','units').map((row,index) => ({...row,name:(production ? row.name : row.name.replace('-', '–')) + ' days',
          suffix:grant('purchase.price.view') ? cost(obj(arr(aging.buckets)[index]).value) : undefined}))}/>
        {!production && link('inventory-aging','inventory_aging','Inventory aging report',{show:'dead'}) && <Link className="table-link" href={link('inventory-aging','inventory_aging','Inventory aging report',{show:'dead'})!.href}>Inventory aging report</Link>}
        {production && <OverviewRestriction values={inventory.restricted} inventory/>}
        <Quality data={inventory.quality}/>
      </Panel>}
      {showPayments && <Panel title="Payment activity" detail="Recorded transactions and payment attempts for the selected period. Includes dev simulations."
        tone="money" icon={<Wallet size={23}/>} link={{href:url(transactionsPath, paymentScope),label:'Open transactions'}}>
        <div className="overview-metrics">
          <Metric title="Successful transactions" value={count(paymentCount(0, 'success'))} detail={amountByCurrency('success')}/>
          <Metric title="Refunds posted" value={count(paymentCount(0, 'refunded'))} detail={amountByCurrency('refunded')}/>
          <Metric title="Pending attempts" value={count(paymentCount(1, 'pending'))} detail="Awaiting provider action or receipt review"/>
          <Metric title="Failed attempts" value={count(paymentCount(1, 'failed'))} detail="Declined or rejected attempts"/>
        </div>
      </Panel>}
      {finance && <Panel title="Money" production={production}
        detail={production ? 'Operating expenses, cash still with the courier, and stock bought. Profit figures will come with the P&L report.' : 'Operating expenses, cash still with the courier and stock received.'}
        tone="money" icon={<Wallet size={production ? 20 : 23}/>}>
        <div className="overview-split">
          <div className="overview-metrics overview-metrics-two">
            {finance.expenses ? <>
              <Metric title="Operating expenses" value={money(expenses.total)} current={expenses.total} prior={obj(expenses.previous).total} lowerIsBetter detail={counted(expenses.entries, 'entry', 'entries')}
                {...productionMetric('Recorded operating expenses in the selected period.', grant('expense.view') ? '/dashboard/expense-report' : undefined)}/>
              {salesResource ? <Suspense fallback={<Metric {...spendMetric}/>}>
                <ProductionAdSpend sales={salesResource} details={spendMetric} spending={expenses.adSpend}/>
              </Suspense> : <Metric {...spendMetric} detail={number(delivered.productValue) && number(expenses.adSpend) !== undefined
                ? percent(Number(expenses.adSpend) / Number(delivered.productValue)) + ' of delivered sales' : undefined}/>}
            </> : null}
            <Metric title="COD with courier" value={money(cod.amount)} detail={count(cod.orders) + (production && cod.orders === 1 ? ' parcel' : ' parcels')}
              {...productionMetric('Cash-on-delivery value of parcels still with the courier.', orderQueue('courier_overdue','IN_REVIEW,HANDED_OVER_TO_COURIER,IN_TRANSIT'))}/>
            <Metric title="Stock received" value={number(received.cost) !== undefined && grant('purchase.price.view') ? cost(received.cost) : counted(received.units, 'unit')}
              current={grant('purchase.price.view') ? received.cost : received.units} prior={grant('purchase.price.view') ? obj(received.previous).cost : obj(received.previous).units}
              detail={count(received.purchases) + ' purchases · ' + count(received.units) + ' units'}
              {...productionMetric('New stock received in the selected period.', grant('purchase.view') ? '/dashboard/purchase/all' : undefined)}/>
          </div>
          {finance.expenses ? <div className="overview-stack">
            <Bars title="Expenses by category" bars={bars(expenses.byCategory,'name','amount',undefined,money)}/>
            {production && arr(expenses.adsByChannel).length > 0 && <Bars title="Ad spend by channel" bars={bars(expenses.adsByChannel,'name','amount',undefined,money)}/>}
          </div> : null}
        </div>
        {production && <OverviewRestriction values={finance.restricted}/>}
        {production && <Quality data={finance.quality}/>}
      </Panel>}
      {preorders && <Panel title="Pre-orders" production={production}
        detail={production ? 'Customer requests sourced from China. Advances are deposits until the pre-order is delivered.' : 'Requests sourced from China. Advances remain deposits until delivery.'} tone="preorders"
        icon={<ClipboardList size={production ? 20 : 23}/>} link={production ? undefined : {href:'/desk/orders/preorders',label:'Open pre-orders'}}>
        <div className="overview-metrics attention-metrics">
          <Metric title="In progress" value={count(phaseCount)} detail={count(phases.request) + ' quoting · ' + count(phases.chinaToBd) + ' China → BD · ' + count(phases.bdToCustomer) + ' BD → customer' + (phases.onHold ? ' · ' + count(phases.onHold) + ' on hold' : '')}
            {...productionMetric('Pre-orders currently active at any stage.', '/dashboard/pre-orders')}/>
          <Metric title="Advances received" value={cost(preorders.advancesReceived)} current={preorders.advancesReceived} prior={obj(preorders.previous).advancesReceived} detail={count(preorders.advancesCount) + ' pre-orders'}
            {...productionMetric('Advance deposits collected on pre-orders.')}/>
          <Metric title="Balance still due" value={cost(preorders.outstandingDue)} detail={count(preorders.outstandingOrders) + ' pre-orders'}
            {...productionMetric('Remaining balance to be collected on outstanding pre-orders.')}/>
          <Metric title="Delivered" value={cost(preorders.deliveredValue)} current={preorders.deliveredValue} prior={obj(preorders.previous).deliveredValue} detail={count(preorders.deliveredCount) + ' pre-orders'}
            {...productionMetric('Value of pre-orders delivered during the selected period.')}/>
        </div><Quality data={preorders.quality}/>
      </Panel>}
  </>;
  if (section) return content;
  const dashboard = <>
    {header}
    {authorized ? <>
      <OverviewFilters key={production ? region : JSON.stringify([period,scope])} region={region} period={period} from={scope.from} to={scope.to} compare={scope.compare !== 'none'}
        selected={scope.locations?.split(',') ?? []} currency={currency} locations={locations} production={production}/>
      {failed && <div className="notice warn"><CircleAlert size={17}/> Some overview sections could not load.</div>}
      {sections ?? content}
      {production && scope.locations && <p className="overview-location-note">The location filter applies to dispatch, delivery, stock and purchases. Orders that haven’t been dispatched have no location yet.</p>}
    </> : <div className="notice" id="work-queue"><CircleAlert size={17}/> Overview metrics require the Overview permission. Your available modules are below.</div>}
    {!production && <><div className="section-line"><div><h2>Quick access</h2><p>Open tools available to your account.</p></div></div>
    <div className="quick-grid">{quick.map(item => <Link key={item.id} className="panel quick-card" href={url('/desk/'+item.id,{region})}><span className="tile-icon purple"><SectionIcon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRight size={16}/></Link>)}</div>
    {!quick.length && <p className="muted">Your account has no module permissions assigned.</p>}</>}
  </>;
  return production ? <div className="production-overview">{dashboard}</div> : dashboard;
}

function Quality({data}: {data: unknown}) {
  const messages = arr(data).map(row => str(obj(row).message)).filter(Boolean);
  return messages.length ? <div className="notice warn"><CircleAlert size={17}/><ul>{messages.map(message => <li key={message}>{message}</li>)}</ul></div> : null;
}

function OverviewRestriction({ values, inventory }: { values: unknown; inventory?: boolean }) {
  const restricted = arr(values).map(str).filter(Boolean);
  if (!restricted.length) return null;
  const text = inventory
    ? (restricted.includes('cost') ? restricted.includes('profit') ? 'Purchase cost and margin figures are hidden for your role.' : 'Purchase cost figures are hidden for your role.'
      : 'Margin figures are hidden for your role.')
    : 'Hidden for your role: ' + restricted.map(value => value === 'cost' ? 'purchase cost' : value).join(', ') + '.';
  return <p className="overview-location-note">{text}</p>;
}
