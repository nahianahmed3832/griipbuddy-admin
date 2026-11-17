import { Activity, BadgePercent, BarChart3, CircleMinus, Clock3, Filter, TrendingUp } from 'lucide-react';
import { ApiError, canWrite, url, type Session } from '@/lib/api';
import type { Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { posMoney, posRegisterPath } from '@/lib/pos';
import { advancedEnabled } from '@/lib/advanced';
import { loadPosRegisterPage, loadPosRegisterTotals, posRegisterFilters, posRegisterTitle, posStaff } from '@/lib/production-pos';
import { has, type Region } from '@/lib/sections';
import { PosRegisterFilterForm, PosRegisterTable, PosRangeFilter } from './production-pos-register-controls';
import styles from './production-pos-register.module.css';

const metrics = [
  ['sales', 'TOTAL SALES VALUE', Activity], ['profit', 'TOTAL PROFIT VALUE', TrendingUp], ['cost', 'TOTAL PURCHASE VALUE', CircleMinus],
  ['discount', 'TOTAL DISCOUNT GIVEN', BadgePercent], ['due', 'AMOUNT DUE', Clock3], ['count', 'NUMBER OF SALES', BarChart3],
] as const;

export async function ProductionPosRegister({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  if (region !== 'BD') throw new ApiError(404);
  const filters = await posRegisterFilters(q, auth);
  const [{ rows, total }, totals, staff] = await Promise.all([
    loadPosRegisterPage(auth, filters), loadPosRegisterTotals(auth, filters),
    filters.canViewStaff ? posStaff(auth) : [],
  ]);
  const { serial, location, creator, range, from, to, page, size, today } = filters;
  const active = {
    serial, location, creator, range, from: range === 'Custom' ? from : '', to: range === 'Custom' ? to : '', size: String(size),
  };
  const writable = advancedEnabled() && canWrite(auth.staff);
  return <section className={styles.root}>
    <h1>Sales Reports{from && <> for <strong>{posRegisterTitle(filters)}</strong></>}</h1>
    <details className={styles.filter} open>
      <summary><Filter size={19}/> Filter</summary>
      <PosRegisterFilterForm>
        <input type="hidden" name="size" value={size}/>
        <label>Business Location<select name="location" defaultValue={location} disabled={Boolean(filters.assigned)} aria-label="Business Location">
          <option value="">All</option>
          {filters.locations.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}
          {filters.assigned && !filters.locations.some(row => row.value === filters.assigned) && <option value={filters.assigned}>Assigned location</option>}
        </select></label>
        <label>Sale Serial Id<input type="search" name="serial" defaultValue={serial} placeholder="Search by sale id" inputMode="numeric" pattern="[0-9]*"/></label>
        {filters.canViewStaff && <label>Sale Created By<select name="creator" defaultValue={creator} aria-label="Sale Created By">
          <option value="">All</option>{staff.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>}
        <PosRangeFilter from={from || today} to={to || today} range={range}/>
        <div className={styles.filterButtons}>
          <a className={styles.primary} href={adminPath(url(posRegisterPath, { size: String(size) }))}>Clear Filter</a>
        </div>
      </PosRegisterFilterForm>
    </details>
    {!filters.valid && <p role="alert">Enter a numeric sale ID and a valid date range.</p>}
    <div className={styles.metrics}>
      {metrics.filter(([key]) => Object.hasOwn(totals, key)).map(([key, label, Icon]) => <article key={key} data-metric={key}>
        <span><Icon size={15}/></span><div>{label}</div><strong>{key !== 'count' && '৳ '}{posMoney(totals[key] ?? 0)}</strong></article>)}
    </div>
    <PosRegisterTable rows={rows} total={total} active={active} page={page} size={size} canSeeCost={filters.canSeeCost}
      canSeeProfit={filters.canSeeProfit} canEdit={writable && has(auth.staff, 'pos.update')}
      canDelete={writable && has(auth.staff, 'pos.delete')}/>
  </section>;
}
