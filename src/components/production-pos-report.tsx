import { BarChart3, Clock3, DollarSign, Filter, Percent, ShoppingCart, TrendingUp } from 'lucide-react';
import { api, ApiError, mongoId, obj, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { has, superAdmin, type Region } from '@/lib/sections';
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

function reportDay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

export async function ProductionPosReport({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  if (region !== 'BD' || !['pos.view', 'purchase.price.view', 'potential.profit.view'].every(permission => has(auth.staff, permission))) throw new ApiError(403);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format();
  const from = reportDay(param(q, 'from')) ?? today;
  const to = reportDay(param(q, 'to')) ?? today;
  const scope = superAdmin(auth.staff) ? undefined : auth.staff.assignedLocation;
  const locations = has(auth.staff, 'business_locations.view') ? await loadLocations(auth, region) : [];
  const selected = param(q, 'location') ?? '';
  const location = scope || selected;
  if (location && (!mongoId(location) || (!scope && !locations.some(row => row.value === location)))) throw new ApiError(403);
  const validRange = from <= to;
  const report = validRange ? obj(await api(url('/pos/admin/report', { business_location_id: location, startDate: from, endDate: to }), auth.token)) : {};
  const fmt = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
  return <section className={styles.page}>
    <h1>Pos Sales Report</h1>
    <details className={styles.filter} open={Boolean(param(q, 'from') || param(q, 'to') || selected)}>
      <summary><Filter size={19}/> Filter</summary>
      <form className={styles.form} action={adminPath(path)}>
        <label>Business Location<select name="location" aria-label="Business Location" defaultValue={location} disabled={Boolean(scope)}>
          <option value="">All</option>
          {locations.filter(row => !scope || row.value === scope).map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
          {scope && !locations.some(row => row.value === scope) && <option value={scope}>Assigned location</option>}
        </select></label>
        <fieldset><legend>Date Range</legend><div className={styles.dates}>
          <input type="date" aria-label="Start date" name="from" max={today} defaultValue={from} required/>
          <input type="date" aria-label="End date" name="to" max={today} defaultValue={to} required/>
        </div></fieldset>
        <button type="submit" className="button primary">Apply</button>
      </form>
    </details>
    {validRange ? <div className={styles.metrics}>
      {metrics.map(([label, key, Icon]) => <article key={key} className={styles.metric}>
        <header><h2>{label}</h2><span><Icon size={16}/></span></header>
        <p>{fmt.format(Number(report[key]) || 0)}</p>
      </article>)}
    </div> : <p className="notice warn" role="alert">Choose an end date on or after the start date.</p>}
  </section>;
}
