import { Boxes, CircleAlert, DollarSign, Filter, Package, RotateCcw, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { api, ApiError, arr, obj, str, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, type Query } from '@/lib/data';
import { posDay, posRanges, posRangeDates } from '@/lib/pos';
import { has, superAdmin, type Region } from '@/lib/sections';
import { loadHybridReportOrders } from '@/lib/hybrid-orders';
import { mergeHybridClassic } from '@/lib/hybrid-reporting';
import { ClassicOverviewFilters, ClassicOverviewTrend } from './production-classic-overview-controls';
import styles from './production-classic-overview.module.css';

const whole = (value: unknown) => Math.round(typeof value === 'number' ? value : 0).toLocaleString('en-IN');
const money = (value: unknown) => whole(value) + '\u00a0TK';
const units = (value: unknown) => whole(value) + ' Pcs';

export async function ProductionClassicOverview({ auth, region, q }: { auth: Session; region: Region; q: Query }) {
  if (!has(auth.staff, 'overview.view')) throw new ApiError(403);
  const fromQuery = param(q, 'from');
  const toQuery = param(q, 'to');
  const range = posRanges.find(value => value === param(q, 'selectedOption')) || (fromQuery || toQuery ? 'Custom Range' : 'Today');
  const today = posDay();
  const [from, to] = posRangeDates(range, today, fromQuery, toQuery);
  const locations = has(auth.staff, 'business_locations.view') ? await loadLocations(auth, region) : [];
  const requested = param(q, 'businessLocation') || '';
  const assigned = superAdmin(auth.staff) ? undefined : auth.staff.assignedLocation;
  const location = assigned || (locations.some(value => value.value === requested) ? requested : undefined);
  if (requested && requested !== location) throw new ApiError(403);
  const scopedLocations = assigned ? locations.filter(row => row.value === assigned) : locations;
  if (assigned && !scopedLocations.length) scopedLocations.push({ value: assigned, label: 'Assigned location' });

  const period = { from: from || '1970-01-01', to: to || today };
  const [legacy, hybrid] = await Promise.all([
    api(url('/report/business-report', { region, businessLocationId: location, startDate: period.from, endDate: period.to }), auth.token),
    loadHybridReportOrders(auth, region, { locations: location, ...period, milestones: true, returnCosts: true }),
  ]);
  const { report, note, returnNote } = mergeHybridClassic(obj(legacy), hybrid, period);
  const orderMoney = (value: unknown) => region === 'BD' ? money(value) : whole(value) + '\u00a0USD';
  const totals = obj(report.totals);
  const sales = obj(totals.orders);
  const purchases = obj(totals.purchases);
  const returns = obj(totals.returns);
  const daily = arr(report.daily).map(obj).filter(row => str(row.date) && Number.isFinite(Date.parse(str(row.date))))
    .map(row => ({ date: str(row.date), orders: typeof row.orders === 'number' ? row.orders : 0 }));
  const sections = [
    { title: 'Summary', kind: 'summary', Icon: DollarSign, cards: [
      ['Net Sales Amount', money(obj(totals.derived).netSalesAmount), TrendingUp],
    ] },
    { title: 'Online Orders', kind: 'orders', Icon: ShoppingCart, cards: [
      ['Total Orders Amount', orderMoney(sales.totalOrdersAmount), DollarSign],
      ['Total Orders Discount', orderMoney(sales.totalOrdersDiscount), CircleAlert],
      ['Total Due', orderMoney(sales.totalDue), CircleAlert],
      ...(has(auth.staff, 'potential.profit.view') ? [['Total Profit', orderMoney(sales.totalProfit), TrendingUp] as const] : []),
      ['Quantity Ordered', units(sales.total_quantity), Boxes],
      ['Order Count', whole(sales.count), Users],
    ] },
    { title: 'Purchases', kind: 'purchases', Icon: Package, cards: [
      ...(has(auth.staff, 'purchase.price.view') ? [['Total Purchase Cost', money(purchases.totalPurchasesCost), DollarSign] as const] : []),
      ['Total Supplier Paid', money(purchases.totalSupplierPaid), DollarSign],
      ['Total Supplier Due', money(purchases.totalSupplierDue), CircleAlert],
      ['Quantity Purchased', units(purchases.total_quantity), Boxes],
      ['Purchase Count', whole(purchases.count), Users],
    ] },
    { title: 'Returns', kind: 'returns', Icon: RotateCcw, cards: [
      ['Total Refund', money(returns.totalRefund), DollarSign],
      ...(has(auth.staff, 'purchase.price.view') ? [['Total Returned Cost',
        (typeof returns.totalReturnedCost === 'number' ? returns.totalReturnedCost : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + '\u00a0TK',
        Boxes] as const] : []),
      ['Quantity Returned', units(returns.total_quantity), Boxes],
      ['Return Count', whole(returns.count), Users],
    ] },
  ] as const;

  return <div className={styles.page}>
    <section className={styles.panel}>
      <header><span><Filter size={24}/></span><h2>Filter</h2></header>
      <ClassicOverviewFilters key={JSON.stringify([location, range, from, to])} locations={scopedLocations}
        location={location} region={region} range={range} from={from} to={to} today={today} assigned={Boolean(assigned)}/>
    </section>
    {sections.map(({ title, kind, Icon, cards }) => (
      <section className={styles.panel} key={kind} data-classic-tone={kind}>
        <header><span><Icon size={28}/></span><h2>{title}</h2></header>
        <div className={styles.cards}>{cards.map(([label, value, Icon]) => (
          <article key={label}><div><span><Icon size={23}/></span><div><p>{label}</p><strong>{value}</strong></div></div></article>
        ))}</div>
        {kind === 'orders' && daily.length > 0 && <ClassicOverviewTrend data={daily}/>}
        {kind === 'orders' && note && <p className="muted">{note}</p>}
        {kind === 'returns' && returnNote && <p className="muted">{returnNote}</p>}
      </section>
    ))}
  </div>;
}
