import { BarChart3, Clock3, DollarSign, Filter, Percent, ShoppingCart, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { api, ApiError, mongoId, obj, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, type Query } from '@/lib/data';
import { posDay, posRangeDates, posRanges, validPosDay } from '@/lib/pos';
import { counterHistoryPath } from '@/lib/counter-pos-contract';
import { reportNumber } from '@/lib/report-format';
import { has, superAdmin, type Region } from '@/lib/sections';
import { PosRangeFilter, PosRegisterFilterForm } from './production-pos-register-controls';
import styles from './production-pos-report.module.css';

const path = '/dashboard/pos/report';
const metrics = [
  ['Sale value', 'totalSales', DollarSign],
  ['Recorded profit', 'totalProfit', TrendingUp],
  ['Recorded cost', 'totalCost', ShoppingCart],
  ['Discounts', 'totalDiscount', Percent],
  ['Amount due', 'totalDue', Clock3],
  ['Sales', 'numberOfSales', BarChart3],
] as const;

export async function ProductionPosReport({ auth, q, region, counterAvailable }: {
  auth: Session; q: Query; region: Region; counterAvailable: boolean;
}) {
  if (region !== 'BD' || !['pos.view', 'purchase.price.view', 'potential.profit.view'].every(permission => has(auth.staff, permission))) throw new ApiError(403);
  const today = posDay();
  const fromQuery = param(q, 'from');
  const toQuery = param(q, 'to');
  const range = posRanges.find(value => value === param(q, 'selectedOption')) || (fromQuery || toQuery ? 'Custom Range' : 'Today');
  const [from, to] = posRangeDates(range, today, fromQuery, toQuery);
  const scope = superAdmin(auth.staff) ? undefined : auth.staff.assignedLocation;
  const locations = has(auth.staff, 'business_locations.view') ? await loadLocations(auth, region) : [];
  const selected = param(q, 'location') ?? '';
  const location = scope || selected;
  if (scope && selected && selected !== scope) throw new ApiError(403);
  if (location && (!mongoId(location) || (!scope && !locations.some(row => row.value === location)))) throw new ApiError(403);
  const validRange = from <= to && (!fromQuery || validPosDay(fromQuery)) && (!toQuery || validPosDay(toQuery));
  const report = validRange ? obj(await api(url('/pos/admin/report', { business_location_id: location, startDate: from || '1970-01-01', endDate: to || today }), auth.token)) : {};
  const count = new Intl.NumberFormat('en-BD');
  const money = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', currencyDisplay: 'code' });
  return <section className={styles.page}>
    <h1>Legacy POS sales</h1>
    <p className="muted">Recorded sales at Bangladesh locations, in BDT and Bangladesh time (Asia/Dhaka).</p>
    {counterAvailable && <Link className="table-link" href={counterHistoryPath}>Managed counter sales</Link>}
    <details className={styles.filter} open>
      <summary><Filter size={19}/> Filter</summary>
      <PosRegisterFilterForm className={styles.form} path={path}>
        <label>Business Location<select name="location" aria-label="Business Location" defaultValue={location} disabled={Boolean(scope)}>
          <option value="">All</option>
          {locations.filter(row => !scope || row.value === scope).map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
          {scope && !locations.some(row => row.value === scope) && <option value={scope}>Assigned location</option>}
        </select></label>
        <PosRangeFilter key={JSON.stringify([range, from, to])} from={from} to={to} range={range} today={today}/>
      </PosRegisterFilterForm>
    </details>
    {validRange ? <div className={styles.metrics}>
      {metrics.map(([label, key, Icon]) => <article key={key} className={styles.metric}>
        <header><h2>{label}</h2><span><Icon size={16}/></span></header>
        <p>{reportNumber(report[key]) === null ? 'Unavailable' : (key === 'numberOfSales' ? count : money).format(Number(report[key]))}</p>
      </article>)}
    </div> : <p className="notice warn" role="alert">Choose an end date on or after the start date.</p>}
  </section>;
}
