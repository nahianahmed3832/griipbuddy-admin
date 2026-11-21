import { Boxes, CircleAlert, DollarSign, Filter, Package, RotateCcw, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { api, ApiError, arr, obj, str, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, type Query } from '@/lib/data';
import { posDay, posRanges, posRangeDates, validPosDay } from '@/lib/pos';
import { has, superAdmin, type Region } from '@/lib/sections';
import { loadHybridReportOrders } from '@/lib/hybrid-orders';
import { mergeHybridClassic } from '@/lib/hybrid-reporting';
import { reportNumber, reportValue } from '@/lib/report-format';
import { ClassicOverviewFilters, ClassicOverviewTrend } from './production-classic-overview-controls';
import styles from './production-classic-overview.module.css';

const whole = (value: unknown) => reportNumber(value)?.toLocaleString('en-IN') ?? '—';
const money = (value: unknown, currency = 'BDT') => reportNumber(value) === null ? '—' :
  reportValue(value, 'money', currency) + '\u00a0' + currency;
const units = (value: unknown) => reportNumber(value) === null ? '—' : whole(value) + ' units';

export async function ProductionClassicOverview({ auth, region, q }: { auth: Session; region: Region; q: Query }) {
  if (!has(auth.staff, 'overview.view')) throw new ApiError(403);
  const fromQuery = param(q, 'from');
  const toQuery = param(q, 'to');
  const range = posRanges.find(value => value === param(q, 'selectedOption')) || (fromQuery || toQuery ? 'Custom Range' : 'Today');
  const today = posDay();
  const [from, to] = posRangeDates(range, today, fromQuery, toQuery);
  const valid = from <= to && (!fromQuery || validPosDay(fromQuery)) && (!toQuery || validPosDay(toQuery));
  const locations = has(auth.staff, 'business_locations.view') ? await loadLocations(auth, region) : [];
  const requested = param(q, 'businessLocation') || '';
  const assigned = superAdmin(auth.staff) ? undefined : auth.staff.assignedLocation;
  const location = assigned || (locations.some(value => value.value === requested) ? requested : undefined);
  if (requested && requested !== location) throw new ApiError(403);
  const scopedLocations = assigned ? locations.filter(row => row.value === assigned) : locations;
  if (assigned && !scopedLocations.length) scopedLocations.push({ value: assigned, label: 'Assigned location' });

  const period = { from: from || '1970-01-01', to: to || today };
  const includeProfit = has(auth.staff, 'potential.profit.view');
  const [legacy, hybrid] = valid ? await Promise.all([
    api(url('/report/business-report', { region, businessLocationId: location, startDate: period.from, endDate: period.to }), auth.token),
    loadHybridReportOrders(auth, region, { locations: location, ...period, milestones: true, returnCosts: true, profit: includeProfit }),
  ]) : [null, null] as const;
  const native = obj(legacy);
  const { report, note, returnNote } = mergeHybridClassic(native, hybrid, period, includeProfit);
  const currency = str(obj(native.meta).currency) || (region === 'BD' ? 'BDT' : 'USD');
  const orderMoney = (value: unknown) => money(value, currency);
  const totals = obj(report.totals);
  const sales = obj(totals.orders);
  const purchases = obj(totals.purchases);
  const returns = obj(totals.returns);
  const daily = arr(report.daily).map(obj).flatMap(row => {
    const orders = reportNumber(row.orders);
    const date = str(row.date);
    return date && Number.isFinite(Date.parse(date)) && orders !== null ? [{ date, orders }] : [];
  });
  const canReadCost = has(auth.staff, 'purchase.price.view');
  const sections = [
    ...(region === 'BD' ? [{ title: 'Legacy POS', kind: 'summary', Icon: DollarSign, cards: [
      ['Legacy POS sales, net of recorded returns', money(obj(totals.derived).netSalesAmount), TrendingUp],
      ['Legacy POS refunds posted', money(obj(obj(native.totals).returns).totalRefund), RotateCcw],
    ] as const }] : []),
    { title: 'Online Orders', kind: 'orders', Icon: ShoppingCart, cards: [
      ['Total Orders Amount', orderMoney(sales.totalOrdersAmount), DollarSign],
      ['Total Orders Discount', orderMoney(sales.totalOrdersDiscount), CircleAlert],
      ['Total Due', orderMoney(sales.totalDue), CircleAlert],
      ...(includeProfit ? [['Total Profit', orderMoney(sales.totalProfit), TrendingUp] as const] : []),
      ['Quantity Ordered', units(sales.total_quantity), Boxes],
      ['Order Count', whole(sales.count), Users],
    ] },
    { title: 'Purchases', kind: 'purchases', Icon: Package, cards: [
      ...(canReadCost ? [
        ['Total Purchase Cost', money(purchases.totalPurchasesCost), DollarSign],
        ['Total Supplier Paid', money(purchases.totalSupplierPaid), DollarSign],
        ['Total Supplier Due', money(purchases.totalSupplierDue), CircleAlert],
      ] as const : []),
      ['Quantity Purchased', units(purchases.total_quantity), Boxes],
      ['Purchase Count', whole(purchases.count), Users],
    ] },
    ...(region === 'BD' ? [{ title: 'Recorded returns', kind: 'returns', Icon: RotateCcw, cards: [
      ['Refunds posted', money(returns.totalRefund), DollarSign],
      ...(canReadCost ? [['Total Returned Cost', money(returns.totalReturnedCost), Boxes] as const] : []),
      ['Quantity Returned', units(returns.total_quantity), Boxes],
      ['Return Count', whole(returns.count), Users],
    ] as const }] : []),
  ] as const;

  return <div className={styles.page}>
    <section className={styles.panel}>
      <header><span><Filter size={24}/></span><h2>Filter</h2></header>
      <ClassicOverviewFilters key={JSON.stringify([location, range, from, to])} locations={scopedLocations}
        location={location} region={region} range={range} from={from} to={to} today={today} assigned={Boolean(assigned)}/>
    </section>
    {!valid && <p className="notice warn" role="alert">Choose a valid start and end date.</p>}
    {valid && sections.map(({ title, kind, Icon, cards }) => (
      <section className={styles.panel} key={kind} data-classic-tone={kind}>
        <header><span><Icon size={28}/></span><h2>{title}</h2></header>
        <div className={styles.cards}>{cards.map(([label, value, Icon]) => (
          <article key={label}><div><span><Icon size={23}/></span><div><p>{label}</p><strong>{value}</strong></div></div></article>
        ))}</div>
        {kind === 'orders' && daily.length > 0 && <ClassicOverviewTrend data={daily} currency={currency}/>}
        {kind === 'orders' && note && <p className="muted">{note}</p>}
        {kind === 'returns' && returnNote && <p className="muted">{returnNote}</p>}
      </section>
    ))}
  </div>;
}
