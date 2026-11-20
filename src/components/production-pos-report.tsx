import { BarChart3, Clock3, DollarSign, Filter, Percent, ShoppingCart, TrendingUp } from 'lucide-react';
import { api, ApiError, mongoId, obj, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, type Query } from '@/lib/data';
import { posDay, posRangeDates, posRanges } from '@/lib/pos';
import { has, superAdmin, type Region } from '@/lib/sections';
import { PosRangeFilter, PosRegisterFilterForm } from './production-pos-register-controls';
import styles from './production-pos-report.module.css';

const path = '/dashboard/pos/report';
const metrics = [
  ['Total Sales', 'totalSales', DollarSign],
  ['Total Profit', 'totalProfit', TrendingUp],
  ['Total Cost', 'totalCost', ShoppingCart],
  ['Total Discount', 'totalDiscount', Percent],
  ['Amount Due', 'totalDue', Clock3],
  ['Number of Sales', 'numberOfSales', BarChart3],
] as const;

export async function ProductionPosReport({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
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
  if (location && (!mongoId(location) || (!scope && !locations.some(row => row.value === location)))) throw new ApiError(403);
  const validRange = from <= to;
  const report = validRange ? obj(await api(url('/pos/admin/report', { business_location_id: location, startDate: from || '1970-01-01', endDate: to || today }), auth.token)) : {};
  const fmt = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
  return <section className={styles.page}>
    <h1>Pos Sales Report</h1>
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
        <p>{fmt.format(Number(report[key]) || 0)}</p>
      </article>)}
    </div> : <p className="notice warn" role="alert">Choose an end date on or after the start date.</p>}
  </section>;
}
