import Link from 'next/link';
import { ArrowRight, CircleAlert, ClipboardList, Package, RefreshCw, ShoppingBag, Truck, Wallet } from 'lucide-react';
import { api, arr, legacyUrl, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { printable, valueAt, type Query } from '@/lib/data';
import { overviewQuery } from '@/lib/overview';
import { has, visibleSections, type Region } from '@/lib/sections';
import { SectionIcon } from './icons';
import { OverviewFilters } from './overview-filters';

export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const count = (value: unknown) => number(value)?.toLocaleString('en') ?? '—';
const percent = (value: unknown) => number(value) === undefined ? '—' : new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(value as number);
const days = (value: unknown) => number(value) === undefined ? '—' : Number(value).toFixed(1) + ' d';
const hours = (value: unknown) => number(value) === undefined ? '—' : Number(value) >= 24 ? days(Number(value) / 24) : Number(value).toFixed(1) + ' h';

function Metric({ title, value, detail, current, prior, lowerIsBetter = false }: {
  title: string; value: string; detail?: string; current?: unknown; prior?: unknown; lowerIsBetter?: boolean;
}) {
  const baseline = number(prior);
  const actual = number(current);
  const change = baseline && actual !== undefined ? (actual - baseline) / Math.abs(baseline) : undefined;
  return <article className="overview-card">
    <h3>{title}</h3><div className="overview-value"><strong>{value}</strong>
      {change !== undefined && <span className={'overview-delta ' + (change === 0 ? 'neutral' : ((change < 0) === lowerIsBetter ? 'good' : 'bad'))}
        aria-label={percent(Math.abs(change)) + (change < 0 ? ' lower than previous period' : change > 0 ? ' higher than previous period' : ' change')}>
        {change < 0 ? '↘ ' : change > 0 ? '↗ ' : ''}{percent(Math.abs(change))}
      </span>}
    </div>{detail && <p>{detail}</p>}
  </article>;
}

function Panel({ title, detail, tone, icon, link, children, id }: {
  title: string; detail: string; tone: string; icon: React.ReactNode; link?: { href: string; label: string }; children: React.ReactNode; id?: string;
}) {
  return <section id={id} className={'panel overview-block overview-' + tone}>
    <div className="overview-block-heading"><span className="overview-block-icon">{icon}</span>
      <div><h2>{title}</h2><p>{detail}</p></div>
      {link && <Link className="button secondary" href={link.href}>{link.label}<ArrowRight size={15}/></Link>}
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
function SalesChart({ points, currency }: { points: Point[]; currency: string }) {
  const money = (value: number) => printable(value, 'money', currency);
  const maximum = Math.max(1, ...points.map(point => Math.max(point.booked, point.delivered)));
  const x = (index: number) => points.length > 1 ? 62 + index * 621 / (points.length - 1) : 373;
  const y = (value: number) => 166 - value / maximum * 146;
  const ticks = [1,.75,.5,.25,0];
  const mark = (key: 'booked' | 'delivered', color: string) => <g className={color}>
    {points.length > 1 && <polyline points={points.map((point,index) => x(index) + ',' + y(point[key])).join(' ')}/>}
    {points.map((point,index) => <circle key={point.key} cx={x(index)} cy={y(point[key])} r={points.length > 32 ? 1.5 : 3.5}>
      <title>{point.key} · {money(point[key])}</title>
    </circle>)}
  </g>;
  return <div className="overview-subpanel"><h3>Booked vs delivered</h3>
    {points.some(point => point.booked || point.delivered) ?
      <svg className="overview-chart" viewBox="0 0 700 199" aria-hidden="true">
        {ticks.map(tick => <g key={tick}><line x1="61" x2="685" y1={y(maximum * tick)} y2={y(maximum * tick)}/>
          <text x="54" y={y(maximum * tick) + 4} textAnchor="end">{new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(maximum * tick)}</text></g>)}
        {mark('booked','overview-booked')}{mark('delivered','overview-delivered')}
        {points.map((point,index) => index % Math.ceil(points.length / 6) === 0 &&
          <text key={point.key} x={x(index)} y="188" textAnchor="middle">{point.key.length === 10 ? point.key.slice(5) : point.key}</text>)}
      </svg> : <p className="overview-chart-empty muted">No sales activity in this period</p>}
    <div className="overview-chart-key"><span>Booked value</span><span>Delivered sales</span></div>
    {points.length > 0 && <details className="chart-values"><summary>View chart data</summary>
      <div className="chart-values-scroll"><table><thead><tr><th scope="col">Period</th><th scope="col">Booked</th><th scope="col">Delivered</th></tr></thead>
        <tbody>{points.map(point => <tr key={point.key}><th scope="row">{point.key}</th><td>{money(point.booked)}</td><td>{money(point.delivered)}</td></tr>)}</tbody>
      </table></div>
    </details>}
  </div>;
}

function Thumbnail({ source }: { source: unknown }) {
  const configured = process.env.GRIIP_ADMIN_IMAGE_ORIGIN;
  if (configured && typeof source === 'string') {
    try {
      const image = new URL(source);
      if (image.protocol === 'https:' && image.origin === configured && !image.username && !image.password) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img className="overview-thumbnail" src={image.href} width={32} height={32} alt="" loading="lazy" referrerPolicy="no-referrer"/>;
      }
    } catch { /* Old records can contain incomplete asset URLs. */ }
  }
  return <span className="overview-thumbnail overview-placeholder" aria-hidden="true"><Package size={15}/></span>;
}

function ProductTable({ products, currency, region, canOpen }: { products: RecordData[]; currency: string; region: Region; canOpen: boolean }) {
  return <div className="overview-subpanel"><h3>Top products (orders placed)</h3>
    {products.length ? <div className="overview-product-table" tabIndex={0} role="region" aria-label="Top products table"><table><thead><tr>
      <th scope="col">Product</th><th scope="col">SKU</th><th scope="col">Units</th><th scope="col">Value</th>
    </tr></thead><tbody>{products.map((row,index) => {
      const name = str(row.name) || 'Unnamed product';
      const id = str(row.productId);
      return <tr key={index}><td><div className="overview-product"><Thumbnail source={row.image}/>
        {canOpen && mongoId(id) ? <Link className="table-link" href={url('/desk/catalog/products/' + id, {region})}>{name}</Link> : name}</div></td>
        <td>{str(row.sku) || '—'}</td><td>{count(row.units)}</td><td>{printable(row.value,'money',currency) || '—'}</td></tr>;
    })}</tbody></table></div> : <p className="muted">No booked products in this period</p>}
  </div>;
}

const outcomes = [
  ['open','Not dispatched yet','slate'], ['with_courier','With courier','blue'], ['delivered','Delivered','green'],
  ['returning','Coming back','amber'], ['returned','Returned to sender','orange'], ['cancelled','Cancelled','red'], ['other','Other','grey'],
] as const;

function Funnel({ data }: { data: RecordData }) {
  const total = number(data.total) ?? 0;
  return <div className="overview-subpanel"><h3>Where the orders placed in this period are now</h3>
    <p className="muted">Customer returns after delivery count as delivered. Returned to sender means the parcel never reached the customer.</p>
    {total > 0 && <div className="overview-funnel" aria-hidden="true">{outcomes.map(([key,,tone]) =>
      <span key={key} className={'outcome-' + tone} style={{ width: ((number(data[key]) ?? 0) / total * 100) + '%' }}/>)}</div>}
    <ul className="overview-funnel-labels">{outcomes.filter(([key]) => key !== 'other' || number(data.other)).map(([key,label,tone]) =>
      <li key={key}><i className={'outcome-' + tone}/>{label} <b>{count(data[key])}</b>{total > 0 && <small>{percent((number(data[key]) ?? 0) / total)}</small>}</li>)}</ul>
  </div>;
}

export async function Dashboard({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  const grant = (permission: string) => has(auth.staff,permission);
  const authorized = grant('overview.view');
  const { period, scope, refresh } = overviewQuery(q,region);
  const names = ['actions','sales','fulfilment','inventory','finance', ...(region === 'BD' && grant('pre_order.view') ? ['preorders'] : [])];
  const [results, locations] = authorized ? await Promise.all([
    Promise.allSettled(names.map(name => api(url('/analytics/overview/' + name,{ ...scope, refresh }),auth.token))),
    grant('business_locations.view') ? loadLocations(auth,region).catch(() => []) : [],
  ]) : [[],[]] as const;
  const payload = Object.fromEntries(names.map((name,index) => {
    const entry = results[index];
    return [name, entry?.status === 'fulfilled' && entry.value ? obj(entry.value) : null];
  }));
  const { actions, sales, fulfilment, inventory, finance, preorders } = payload;
  const currency = str(obj(sales?.meta).currency) || scope.currency || (region === 'BD' ? 'BDT' : 'USD');
  const money = (value: unknown) => printable(value,'money',currency) || '—';
  const cost = (value: unknown) => printable(value,'money','BDT') || '—';
  const link = (id: string, permission: string, title: string, filters = {}) => grant('report.' + permission + '.view')
    ? { href:url('/desk/reports/' + id,{ ...scope,...filters }),label:title } : undefined;
  const meta = obj(sales?.meta);
  const comparison = obj(meta.compare);
  const asOf = Object.values(payload).map(item => str(obj(item?.meta).generated_at)).filter(Boolean).sort()[0];
  const reportDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')) : '';
  const previous = str(comparison.from) ? [reportDate(comparison.from), ...(comparison.from !== comparison.to ? [reportDate(comparison.to)] : [])].join(' – ') : '';
  const current = [reportDate(meta.from || scope.from), ...(scope.from !== scope.to ? [reportDate(meta.to || scope.to)] : [])].join(' – ');
  const quick = visibleSections(auth.staff).filter(item => !['overview','workflows','settings'].includes(item.id));
  const points = arr(obj(sales?.series).points).map(obj).flatMap(row => {
    const booked = number(row.bookedValue);
    const delivered = number(row.deliveredValue);
    return str(row.key) && booked !== undefined && delivered !== undefined ? [{key:str(row.key),booked,delivered}] : [];
  });
  const bookings = obj(sales?.bookings);
  const delivered = obj(sales?.delivered);
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
    ? link('pending-fulfilment','pending_fulfilment','Open queue',{type})?.href
      ?? (filter ? url('/desk/orders/orders',{region,filter}) : undefined) : undefined;
  const queue = [
    { title:'Orders to confirm', value:confirm.orders, level:'urgent', href:orderQueue('to_confirm'), notes:[money(confirm.value), 'Oldest waiting ' + hours(confirm.oldestHours), count(confirm.over48h) + ' waiting over 48 h'] },
    { title:'Awaiting stock', value:waiting.orders, level:'check', href:orderQueue('awaiting_stock','AWAITING_STOCK'), images:needed,
      notes:[money(waiting.value), ...(needed[0] ? ['Most needed: ' + str(needed[0].sku) + ' (' + count(needed[0].units) + ' units)'] : [])] },
    { title:'Payments to verify', value:verify.orders, level:'check', href:orderQueue('payment_proof','INCOMPLETE'), notes:[money(verify.claimedAmount) + ' claimed'] },
    { title:'Customer not reachable', value:response.orders, level:'check', href:orderQueue('no_response','NO_RESPONSE'), notes:['Oldest waiting ' + hours(response.oldestHours)] },
    { title:'Overdue with courier', value:courier.overdue, level:'urgent', href:orderQueue('courier_overdue'), notes:[money(courier.overdueCod) + ' COD at risk', count(courier.inTransit) + ' parcels with the courier'] },
    { title:'Returns to handle', value:number(courier.returnRequested) !== undefined && number(courier.pendingReturn) !== undefined ? Number(courier.returnRequested) + Number(courier.pendingReturn) : undefined,
      level:'check', href:orderQueue('returns','PENDING_RETURN'), notes:[count(courier.returnRequested) + ' requested by customers',count(courier.pendingReturn) + ' on the way back'] },
    { title:'Out of stock', value:stock.outOfStock, level:'urgent', href:link('low-stock','low_stock','Stock alerts',{status:'out'})?.href, images:depleted,
      notes:[count(stock.outOfStockWithDemand) + ' with orders waiting',count(stock.lowStock) + ' running low',...(depleted[0] ? ['Example: ' + str(depleted[0].sku)] : [])] },
    { title:'Pre-orders to act on', value:preActions.total, level:'check', href:grant('pre_order.view') ? '/desk/orders/preorders?filter=ACTION_REQUIRED' : undefined,
      notes:[count(preActions.notQuoted) + ' waiting for a quote',count(preActions.awaitingAdvance) + ' awaiting advance',count(preActions.notShipped) + ' arrived, awaiting shipment'] },
  ];
  const dispatch = obj(fulfilment?.dispatch);
  const success = obj(fulfilment?.deliverySuccess);
  const deliveryTime = obj(fulfilment?.deliveryTime);
  const position = obj(inventory?.position);
  const value = obj(inventory?.value);
  const aging = obj(inventory?.aging);
  const dead = obj(inventory?.deadStock);
  const expenses = obj(finance?.expenses);
  const received = obj(finance?.stockReceived);
  const cod = obj(finance?.codWithCourier);
  const phases = obj(preorders?.phases);
  const phaseCount = preorders ? ['request','chinaToBd','bdToCustomer','onHold'].reduce((sum,key) => sum + (number(phases[key]) ?? 0),0) : undefined;
  const bars = (rows: unknown, name: string, valueKey: string, suffix?: string, moneyFormat?: (value: unknown) => string): Bar[] =>
    arr(rows).map(obj).flatMap(row => {
      const amount = number(row[valueKey]);
      return amount === undefined ? [] : [{name:str(row[name]),value:amount,formatted:moneyFormat ? moneyFormat(amount) : count(amount),
        suffix:suffix && number(row[suffix]) !== undefined ? count(row[suffix]) + ' units' : undefined}];
    });
  const legacy = legacyUrl('overview');
  return <>
    <PageHeading eyebrow="WORKSPACE / OPERATIONS" title="Commerce overview"
      description={[region === 'BD' ? 'Bangladesh' : 'International',currency,current,previous && 'compared with ' + previous].filter(Boolean).join(' · ')}>
      {legacy && authorized && <a className="button subtle" href={legacy} target="_blank" rel="noreferrer">Previous overview</a>}
      {authorized && asOf && Number.isFinite(Date.parse(asOf)) && <time className="muted" dateTime={asOf}>Data as of {new Intl.DateTimeFormat('en-GB',{timeStyle:'short',timeZone:'Asia/Dhaka'}).format(new Date(asOf))} Dhaka</time>}
      {authorized && <Link prefetch={false} className="button secondary" href={url('/desk/overview',{...scope,period,refresh:'1'})}><RefreshCw size={15}/> Refresh</Link>}
    </PageHeading>
    {authorized ? <>
      <OverviewFilters key={JSON.stringify([period,scope])} region={region} period={period} from={scope.from} to={scope.to} compare={scope.compare !== 'none'}
        selected={scope.locations?.split(',') ?? []} currency={currency} locations={locations}/>
      {results.some(result => result.status === 'rejected') && <div className="notice warn"><CircleAlert size={17}/> Some overview sections could not load.</div>}
      {actions && <Panel id="work-queue" title="Needs attention" detail="Current queues are independent of the selected period. Open a tile to review matching records."
        tone="attention" icon={<CircleAlert size={23}/>} link={openOrders}>
        <div className="overview-metrics attention-metrics">{queue.filter(item => number(item.value) !== undefined).map(item => {
          const level = item.value === 0 ? 'clear' : item.level;
          const body = <><div className="attention-card-heading"><h3>{item.title}</h3>
            <span className="attention-pill">{level === 'clear' ? 'All clear' : level === 'urgent' ? 'Act now' : 'Check'}</span></div>
            <strong>{count(item.value)}</strong>
            {item.value !== 0 && <>{item.images?.length ? <div className="overview-thumbnails">{item.images.slice(0,4).map((row,index) =>
              <Thumbnail source={row.image} key={index}/>)}</div> : null}<p>{item.notes.map(note => <span key={note}>{note}</span>)}</p></>}
          </>;
          return item.href ? <Link key={item.title} className={'overview-card attention-' + level} href={item.href}>{body}</Link>
            : <article key={item.title} className={'overview-card attention-' + level}>{body}</article>;
        })}</div>
        {warnings.length > 0 && <div className="notice warn"><CircleAlert size={17}/><p><b>Data health</b> · {warnings.join(' · ')}. Stock and cost figures may be affected.
          {link('data-health','data_health','See the records') && <> <Link className="table-link" href={link('data-health','data_health','See the records')!.href}>See the records</Link></>}</p></div>}
      </Panel>}
      {sales && <Panel title="Sales" detail="Bookings track orders placed. Delivered sales track product value on delivered orders."
        tone="sales" icon={<ShoppingBag size={23}/>} link={link('sales-summary','sales_summary','Sales report')}>
        <div className="overview-metrics">
          <Metric title="Orders placed" value={count(bookings.orders)} current={bookings.orders} prior={obj(bookings.previous).orders} detail={money(bookings.orderValue) + ' including delivery'}/>
          <Metric title="Booked value" value={money(bookings.productValue)} current={bookings.productValue} prior={obj(bookings.previous).productValue} detail={'Average ' + money(bookings.avgProductValue) + ' per order'}/>
          <Metric title="Delivered sales" value={money(delivered.productValue)} current={delivered.productValue} prior={obj(delivered.previous).productValue}
            detail={count(delivered.orders) + ' orders · ' + count(delivered.units) + ' units · ' + money(delivered.deliveryIncome) + ' delivery income'}/>
          <Metric title="Average order value" value={money(delivered.avgOrderValue)} current={delivered.avgOrderValue} prior={obj(delivered.previous).avgOrderValue} detail="Delivered orders"/>
          <Metric title="Cancelled before dispatch" value={percent(bookings.cancellationRate)} current={bookings.cancellationRate} prior={obj(bookings.previous).cancellationRate}
            detail={count(bookings.cancelledBeforeDispatch) + ' of ' + count(bookings.orders) + ' orders'} lowerIsBetter/>
        </div>
        <div className="overview-split"><SalesChart points={points} currency={currency}/>
          <div className="overview-stack">
            <Bars title="Booked value by category" bars={bars(sales.categoryMix,'name','value','units',money)}/>
            <Bars title="Orders by source" bars={bars(bookings.bySource,'source','orders').map(row => ({...row,name:row.name.replaceAll('_',' ').replace(/^./, c => c.toUpperCase())}))}/>
          </div>
        </div>
        <div className="overview-split"><ProductTable products={arr(sales.topProducts).map(obj)} currency={currency} region={region} canOpen={grant('product.view')}/>
          <div className="overview-stack"><Metric title="Returns processed" value={count(obj(sales.returns).orders)} detail={money(obj(sales.returns).value) + ' returned'}/>
            {sales.pos ? <Metric title="Point-of-sale value" value={money(obj(sales.pos).amount)} current={obj(sales.pos).amount}
              prior={valueAt(sales.pos,'previous.amount')} detail={count(obj(sales.pos).sales) + ' sales'}/> : null}</div>
        </div>
        <Quality data={sales.quality}/>
      </Panel>}
      {fulfilment && <Panel title="Fulfilment" detail="Dispatch speed, delivery outcomes and time to reach the customer."
        tone="fulfilment" icon={<Truck size={23}/>} link={link('order-status','order_status','Order status report')}>
        <Funnel data={obj(fulfilment.funnel)}/>
        <div className="overview-metrics overview-metrics-three">
          <Metric title="Dispatched" value={count(dispatch.orders)} current={dispatch.orders} prior={obj(dispatch.previous).orders}
            detail={'Median ' + hours(dispatch.medianHours) + ' from order · 90% within ' + hours(dispatch.p90Hours)}/>
          <Metric title="Delivery success" value={percent(success.successRate)}
            detail={count(success.delivered) + ' delivered · ' + count(success.returnedToSender) + ' returned to sender (' + percent(success.rtsRate) + ') · ' + count(success.pending) + ' still open · ' + count(success.windowDays) + '-day dispatch window'}/>
          <Metric title="Delivery time" value={days(deliveryTime.medianDays)} detail={'90% within ' + days(deliveryTime.p90Days) + ' · ' + count(deliveryTime.measured) + ' orders measured'}/>
        </div>
        <Quality data={fulfilment.quality}/>
      </Panel>}
      {inventory && <Panel title="Inventory" detail="Current stock in the selected locations." tone="inventory" icon={<Package size={23}/>}
        link={link('stock-valuation','stock_valuation','Stock valuation')}>
        <div className="overview-metrics">
          <Metric title="Units on hand" value={count(position.units)} detail={count(position.skusInStock) + ' SKUs in stock'}/>
          {grant('purchase.price.view') && <Metric title="Value at cost" value={cost(value.costValue)}/>}
          <Metric title="Value at selling price" value={money(value.retailValue)} detail={number(value.potentialMargin) !== undefined && grant('potential.profit.view') ? 'Potential margin ' + percent(value.potentialMargin) : undefined}/>
          <Metric title="Older than 180 days" value={count(aging.over180Units)} detail={[grant('purchase.price.view') && cost(aging.over180Value) + ' at cost',count(aging.over90Units) + ' units over 90 days'].filter(Boolean).join(' · ')}/>
          <Metric title={'No sale in ' + (number(dead.days) ?? 60) + ' days'} value={count(dead.skus)} detail={[count(dead.units) + ' units',grant('purchase.price.view') && cost(dead.value) + ' at cost'].filter(Boolean).join(' · ')}/>
        </div>
        <Bars title="Stock age (units)" bars={bars(aging.buckets,'bucket','units').map((row,index) => ({...row,name:row.name.replace('-', '–') + ' days',
          suffix:grant('purchase.price.view') ? cost(obj(arr(aging.buckets)[index]).value) : undefined}))}/>
        {link('inventory-aging','inventory_aging','Inventory aging report',{show:'dead'}) && <Link className="table-link" href={link('inventory-aging','inventory_aging','Inventory aging report',{show:'dead'})!.href}>Inventory aging report</Link>}
        <Quality data={inventory.quality}/>
      </Panel>}
      {finance && <Panel title="Money" detail="Operating expenses, cash still with the courier and stock received." tone="money" icon={<Wallet size={23}/>}>
        <div className="overview-split">
          <div className="overview-metrics overview-metrics-two">
            {finance.expenses ? <>
              <Metric title="Operating expenses" value={money(expenses.total)} current={expenses.total} prior={obj(expenses.previous).total} lowerIsBetter detail={count(expenses.entries) + ' entries'}/>
              <Metric title="Ad spend" value={money(expenses.adSpend)} current={expenses.adSpend} prior={obj(expenses.previous).adSpend} detail={number(delivered.productValue) && number(expenses.adSpend) !== undefined ? percent(Number(expenses.adSpend) / Number(delivered.productValue)) + ' of delivered sales' : undefined}/>
            </> : null}
            <Metric title="COD with courier" value={money(cod.amount)} detail={count(cod.orders) + ' parcels'}/>
            <Metric title="Stock received" value={grant('purchase.price.view') ? cost(received.cost) : count(received.units) + ' units'}
              current={grant('purchase.price.view') ? received.cost : received.units} prior={grant('purchase.price.view') ? obj(received.previous).cost : obj(received.previous).units}
              detail={count(received.purchases) + ' purchases · ' + count(received.units) + ' units'}/>
          </div>
          {finance.expenses ? <Bars title="Expenses by category" bars={bars(expenses.byCategory,'name','amount',undefined,money)}/> : null}
        </div>
      </Panel>}
      {preorders && <Panel title="Pre-orders" detail="Requests sourced from China. Advances remain deposits until delivery." tone="preorders"
        icon={<ClipboardList size={23}/>} link={{href:'/desk/orders/preorders',label:'Open pre-orders'}}>
        <div className="overview-metrics attention-metrics">
          <Metric title="In progress" value={count(phaseCount)} detail={count(phases.request) + ' quoting · ' + count(phases.chinaToBd) + ' China → BD · ' + count(phases.bdToCustomer) + ' BD → customer' + (phases.onHold ? ' · ' + count(phases.onHold) + ' on hold' : '')}/>
          <Metric title="Advances received" value={money(preorders.advancesReceived)} current={preorders.advancesReceived} prior={obj(preorders.previous).advancesReceived} detail={count(preorders.advancesCount) + ' pre-orders'}/>
          <Metric title="Balance still due" value={money(preorders.outstandingDue)} detail={count(preorders.outstandingOrders) + ' pre-orders'}/>
          <Metric title="Delivered" value={money(preorders.deliveredValue)} current={preorders.deliveredValue} prior={obj(preorders.previous).deliveredValue} detail={count(preorders.deliveredCount) + ' pre-orders'}/>
        </div><Quality data={preorders.quality}/>
      </Panel>}
    </> : <div className="notice" id="work-queue"><CircleAlert size={17}/> Overview metrics require the Overview permission. Your available modules are below.</div>}
    <div className="section-line"><div><h2>Quick access</h2><p>Open tools available to your account.</p></div></div>
    <div className="quick-grid">{quick.map(item => <Link key={item.id} className="panel quick-card" href={url('/desk/'+item.id,{region})}><span className="tile-icon purple"><SectionIcon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRight size={16}/></Link>)}</div>
    {!quick.length && <p className="muted">Your account has no module permissions assigned.</p>}
  </>;
}

function Quality({data}: {data: unknown}) {
  const messages = arr(data).map(row => str(obj(row).message)).filter(Boolean);
  return messages.length ? <div className="notice warn"><CircleAlert size={17}/><ul>{messages.map(message => <li key={message}>{message}</li>)}</ul></div> : null;
}
