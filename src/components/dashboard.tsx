import Link from 'next/link';
import { ArrowRight, CalendarDays, CircleAlert, CircleCheck, Package, ShoppingBag, Truck, Wallet, ArrowUpRight } from 'lucide-react';
import { api, arr, legacyUrl, obj, str, url, type Session } from '@/lib/api';
import { param, printable, reportQuery, valueAt, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { has, visibleSections, type Region } from '@/lib/sections';
import { SectionIcon } from './icons';

function label(value: unknown) { return typeof value === 'number' ? value.toLocaleString('en') : '—'; }
export function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}

export function Period({ q, region, path }: { q: Query; region: Region; path: string }) {
  return <form action={adminPath(path)} className="period-form">
    <input type="hidden" name="region" value={region} />
    <label><span>From</span><input name="from" aria-label="Start date" type="date" defaultValue={param(q,'from')}/></label>
    <label><span>To</span><input name="to" aria-label="End date" type="date" defaultValue={param(q,'to')}/></label>
    <button type="submit" className="button secondary"><CalendarDays size={15}/> Apply period</button>
  </form>;
}

export async function Dashboard({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  const authorized = has(auth.staff, 'overview.view');
  const scope = reportQuery(q, region);
  const names = ['sales','fulfilment','inventory','finance','actions', ...(region === 'BD' && has(auth.staff,'pre_order.view') ? ['preorders'] : [])];
  const data = authorized ? await Promise.allSettled(names.map(name => api(url('/analytics/overview/'+name, scope), auth.token))) : [];
  const sections = Object.fromEntries(names.map((name, index) => {
    const outcome = data[index];
    return [name, outcome?.status === 'fulfilled' ? obj(outcome.value) : {}];
  }));
  const { sales, fulfilment, inventory, finance, actions, preorders } = sections;
  const currency = str(obj(sales.meta).currency) || 'BDT';
  const money = (amount: unknown) => printable(amount, 'money', currency) || '—';
  const cards = [
    { label: 'Orders placed', value: label(obj(sales.bookings).orders), previous: label(valueAt(sales, 'bookings.previous.orders')), detail: 'Orders in the previous period', Icon: ShoppingBag, tone: 'purple' },
    { label: 'Delivered product value', value: money(obj(sales.delivered).productValue), previous: money(valueAt(sales, 'delivered.previous.productValue')), detail: 'Value in the previous period', Icon: Wallet, tone: 'green' },
    { label: 'With courier', value: label(obj(fulfilment.funnel).with_courier), detail: 'Orders in the fulfilment pipeline', Icon: Truck, tone: 'amber' },
    { label: 'Units on hand', value: label(obj(inventory.position).units), detail: 'Physical stock across locations', Icon: Package, tone: 'blue' },
  ];
  const points = arr(obj(sales.series).points).map(obj).filter(point =>
    typeof point.key === 'string' && typeof point.deliveredValue === 'number' && typeof point.bookedValue === 'number')
    .map(point => ({ key: point.key as string, delivered: point.deliveredValue as number, booked: point.bookedValue as number }));
  const maximum = Math.max(1, ...points.map(point => Math.max(point.delivered, point.booked)));
  const rq = region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '';
  const success = obj(fulfilment.deliverySuccess);
  const rate = typeof success.successRate === 'number' && success.successRate >= 0 && success.successRate <= 1
    ? new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 }).format(success.successRate) : undefined;
  const period = [str(obj(sales.meta).from), str(obj(sales.meta).to)].filter(Boolean).join(' – ');
  const queue = [
    { label: 'Orders to confirm', value: valueAt(actions, 'orders.toConfirm.orders'), href: '/desk/orders' + rq },
    { label: 'Payments to verify', value: valueAt(actions, 'orders.paymentsToVerify.orders'), href: '/desk/payments/transactions' + rq },
    { label: 'Low stock SKUs', value: valueAt(actions, 'stock.lowStock'), href: '/desk/inventory' + rq },
    { label: 'Pre-orders awaiting advance', value: valueAt(actions, 'preorders.awaitingAdvance'), href: '/desk/orders/preorders' + rq },
  ].filter(item => typeof item.value === 'number' && (
    item.href.startsWith('/desk/inventory') ? has(auth.staff,'stock.view') :
      item.href.includes('/preorders') ? has(auth.staff,'pre_order.view') : has(auth.staff,'order.view')
  ));
  const quick = visibleSections(auth.staff).filter(item => !['overview','workflows','settings'].includes(item.id));
  const legacy = legacyUrl('overview');
  return <>
    <section className="overview-heading">
      <PageHeading eyebrow="WORKSPACE / OPERATIONS" title="Commerce overview" description="Track order demand, delivered sales and inventory across your store.">
        {has(auth.staff,'order.view') && <Link className="button primary" href={'/desk/orders'+rq}>Open orders <ArrowUpRight size={16}/></Link>}
      </PageHeading>
      {authorized && <div className="overview-period"><span><CalendarDays size={16}/> {period || 'Reporting period'}</span>
        <Period q={q} region={region} path="/desk/overview"/>
      </div>}
    </section>
    {authorized ? <>
      {data.some((result,index) => result.status === 'rejected' && index < 5) && <div className="notice warn"><CircleAlert size={17}/> Some overview metrics are unavailable for this account.</div>}
      <div className="metric-grid">{cards.map(({label,value,previous,detail,Icon,tone}) => <article className={'panel metric metric-'+tone} key={label}>
        <div className="metric-top"><span>{label}</span><span className={'tile-icon '+tone}><Icon size={19}/></span></div>
        <strong>{value}</strong><small>{previous && previous !== '—' ? <><b>{previous}</b> · </> : null}{detail}</small>
      </article>)}</div>
      <div className="overview-grid">
        <section className="panel trend">
          <div className="panel-header"><div><h2>Sales activity</h2><p>Booked and delivered product value</p></div><span className="light-tag">{currency}</span></div>
          {points.length > 0 && <div className="chart-legend"><span><i/> Booked</span><span><i/> Delivered</span></div>}
          {points.some(point => point.booked > 0 || point.delivered > 0)
            ? <div className="sales-plot" aria-hidden="true">
              <div className="empty-chart"><i/><i/><i/><i/><i/></div>
              <div className="bars">{points.map((point,index) => <div className="bar-wrap" key={point.key}>
                <div className="bar-pair" title={point.key + ' · Booked ' + money(point.booked) + ' · Delivered ' + money(point.delivered)}>
                  <span className="booked-bar" style={{height: (point.booked / maximum * 100) + '%'}}/>
                  <span className="delivered-bar" style={{height: (point.delivered / maximum * 100) + '%'}}/>
                </div>
                <span>{index % Math.ceil(points.length / 7) === 0 ? point.key.slice(5) || point.key : ''}</span>
              </div>)}</div>
            </div>
            : <div className="trend-empty"><div className="empty-chart" aria-hidden><i/><i/><i/><i/></div>
              <strong>{points.length ? 'No sales activity in this period' : 'Sales history is unavailable'}</strong>
              <p>{points.length ? 'Choose another date range to review earlier activity.' : 'Try refreshing the workspace.'}</p>
            </div>}
          <div className="panel-foot">
            {points.length > 0 && <details className="chart-values"><summary>View chart data</summary>
              <div className="chart-values-scroll"><table><thead><tr><th scope="col">Period</th><th scope="col">Booked</th><th scope="col">Delivered</th></tr></thead>
                <tbody>{points.map(point => <tr key={point.key}><th scope="row">{point.key}</th><td>{money(point.booked)}</td><td>{money(point.delivered)}</td></tr>)}</tbody>
              </table></div>
            </details>}
            {has(auth.staff,'report.sales_summary.view') && <Link href={url('/desk/reports/sales-summary',scope)}>Sales summary <ArrowRight size={15}/></Link>}
          </div>
        </section>
        <section className="panel delivery-panel">
          <div className="panel-header"><div><h2>Delivery outcomes</h2><p>{typeof success.windowDays === 'number' ? 'Resolved shipments dispatched in the past ' + success.windowDays + ' days' : 'Resolved shipments'}</p></div><span className="tile-icon green"><Truck size={18}/></span></div>
          <div className="delivery-ring" style={{ '--completion': (rate ? Number(success.successRate) : 0) * 360 + 'deg' } as React.CSSProperties}>
            <div><strong>{rate || '—'}</strong><small>Delivered</small></div>
          </div>
          <dl className="delivery-stats"><div><dt>Delivered</dt><dd>{label(success.delivered)}</dd></div><div><dt>Returned to sender</dt><dd>{label(success.returnedToSender)}</dd></div></dl>
        </section>
      </div>
      <div className="overview-grid overview-secondary">
        <section className="panel work-queue" id="work-queue"><div className="panel-header"><div><h2>Needs attention</h2><p>Open work by department</p></div><span className="tile-icon amber"><CircleAlert size={18}/></span></div>
          {queue.length ? <div className="queue-list">{queue.map(item => <Link href={item.href} key={item.label}>
            <span>{item.label}</span><strong>{label(item.value)}</strong><ArrowRight size={15}/></Link>)}</div>
            : <p className="padded muted">No accessible work queues for this account.</p>}
          <div className="panel-foot"><span><CircleCheck size={15}/> Scoped to your permissions</span></div>
        </section>
        <div className="overview-side">
        <section className="panel"><div className="panel-header"><div><h2>Cash with courier</h2><p>Outstanding COD in the recovered order ledger</p></div></div>
          <div className="compact-value">{printable(valueAt(finance,'codWithCourier.amount'),'money',currency) || '—'}<small>{label(valueAt(finance,'codWithCourier.orders'))} orders</small></div></section>
        {preorders && Object.keys(preorders).length > 0 && <section className="panel"><div className="panel-header"><div><h2>Pre-order pipeline</h2><p>Awaiting payment and delivery</p></div></div>
          <div className="compact-value">{label(preorders.outstandingOrders)}<small>Outstanding pre-orders</small></div></section>}
        </div>
      </div>
    </> : <div className="notice" id="work-queue"><CircleAlert size={17}/> Overview metrics require the Overview permission. Your available modules are below.</div>}
    <div className="section-line"><div><h2>Quick access</h2><p>Open tools available to your account.</p></div>
      {legacy && authorized && <a className="button secondary" href={legacy} target="_blank" rel="noreferrer">Preserved overview</a>}
    </div>
    <div className="quick-grid">{quick.map(item => <Link key={item.id} className="panel quick-card" href={'/desk/'+item.id+rq}><span className="tile-icon purple"><SectionIcon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRight size={16}/></Link>)}</div>
    {!quick.length && <p className="muted">Your account has no module permissions assigned.</p>}
  </>;
}
