import Link from 'next/link';
import { ArrowRight, CalendarDays, CircleAlert, CircleCheck, Package, ShoppingBag, Truck, Wallet } from 'lucide-react';
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
  const cards = [
    { label: 'Orders placed', value: label(obj(sales.bookings).orders), detail: 'Order demand in the selected period', Icon: ShoppingBag, tone: 'purple' },
    { label: 'Delivered revenue', value: printable(obj(sales.delivered).productValue,'money',currency) || '—', detail: 'Product value on delivered orders', Icon: Wallet, tone: 'green' },
    { label: 'With courier', value: label(obj(fulfilment.funnel).with_courier), detail: 'Orders in the fulfilment pipeline', Icon: Truck, tone: 'amber' },
    { label: 'Units on hand', value: label(obj(inventory.position).units), detail: 'Physical stock across locations', Icon: Package, tone: 'blue' },
  ];
  const points = arr(obj(sales.series).points).map(obj).slice(-21).map((point,index) => {
    const metric = valueAt(point, 'deliveredValue|deliveredProductValue|revenue|delivered|bookedProductValue|bookings');
    const value = typeof metric === 'number' ? metric : obj(metric).productValue;
    return { key: str(point.key) || str(point.date) || str(point.label) || String(index + 1), value: typeof value === 'number' ? value : 0 };
  });
  const maximum = Math.max(1, ...points.map(point => point.value));
  const rq = region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '';
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
    <PageHeading eyebrow="WORKSPACE / OPERATIONS" title="Commerce overview" description="Track order demand, delivered sales and inventory from one workspace.">
      {authorized && <Period q={q} region={region} path="/desk/overview"/>}
    </PageHeading>
    {authorized ? <>
      {data.some((result,index) => result.status === 'rejected' && index < 5) && <div className="notice warn"><CircleAlert size={17}/> Some overview metrics are unavailable for this account.</div>}
      <div className="metric-grid">{cards.map(({label,value,detail,Icon,tone}) => <article className="panel metric" key={label}>
        <div className="metric-top"><span className={'tile-icon '+tone}><Icon size={19}/></span><span>{label}</span></div>
        <strong>{value}</strong><small>{detail}</small>
      </article>)}</div>
      <div className="overview-grid">
        <section className="panel trend"><div className="panel-header"><div><h2>Sales activity</h2><p>Delivered product value over time</p></div><span className="light-tag"><span className="environment-dot"/> {currency}</span></div>
          {points.length && points.some(point => point.value > 0) ? <div className="bars" aria-label="Delivered value by date">{points.map((point,index) =>
            <div className="bar-wrap" key={point.key + index} title={point.key + ': ' + printable(point.value,'money',currency)}>
              <span className="bar" style={{height: (point.value > 0 ? Math.max(3, point.value / maximum * 100) : 0) + '%'}}/><span>{index % 4 === 0 ? (point.key.length === 10 ? point.key.slice(5) : point.key) : ''}</span>
            </div>)}</div> : <div className="trend-empty"><div className="empty-chart" aria-hidden><i/><i/><i/><i/></div>
            <strong>No delivered sales in this period</strong><p>Adjust the date range to review earlier activity.</p></div>}
          <div className="panel-foot"><span>Source · order analytics</span>{has(auth.staff,'report.sales_summary.view') && <Link href={'/desk/reports/sales-summary'+rq}>Sales summary <ArrowRight size={15}/></Link>}</div>
        </section>
        <section className="panel work-queue" id="work-queue"><div className="panel-header"><div><h2>Needs attention</h2><p>Open work by department</p></div><span className="tile-icon amber"><CircleAlert size={18}/></span></div>
          {queue.length ? <div className="queue-list">{queue.map(item => <Link href={item.href} key={item.label}>
            <span>{item.label}</span><strong>{label(item.value)}</strong><ArrowRight size={15}/></Link>)}</div>
            : <p className="padded muted">No accessible work queues for this account.</p>}
          <div className="panel-foot"><span><CircleCheck size={15}/> Scoped to your permissions</span></div>
        </section>
      </div>
      <div className="overview-grid overview-secondary">
        <section className="panel"><div className="panel-header"><div><h2>Cash with courier</h2><p>Outstanding COD in the recovered order ledger</p></div></div>
          <div className="compact-value">{printable(valueAt(finance,'codWithCourier.amount'),'money',currency) || '—'}<small>{label(valueAt(finance,'codWithCourier.orders'))} orders</small></div></section>
        {preorders && <section className="panel"><div className="panel-header"><div><h2>Pre-order pipeline</h2><p>Awaiting payment and delivery</p></div></div>
          <div className="compact-value">{label(preorders.outstandingOrders)}<small>Outstanding pre-orders</small></div></section>}
      </div>
    </> : <div className="notice" id="work-queue"><CircleAlert size={17}/> Overview metrics require the Overview permission. Your available modules are below.</div>}
    <div className="section-line"><div><h2>Quick access</h2><p>Open tools available to your account.</p></div>
      {legacy && authorized && <a className="button secondary" href={legacy} target="_blank" rel="noreferrer">Preserved overview</a>}
    </div>
    <div className="quick-grid">{quick.map(item => <Link key={item.id} className="panel quick-card" href={'/desk/'+item.id+rq}><span className="tile-icon purple"><SectionIcon name={item.icon}/></span><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRight size={16}/></Link>)}</div>
    {!quick.length && <p className="muted">Your account has no module permissions assigned.</p>}
  </>;
}
