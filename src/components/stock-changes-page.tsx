import Link from 'next/link';
import { api, ApiError, canWrite, url, type Session } from '@/lib/api';
import type { Region } from '@/lib/sections';
import { canAccessStockChanges, isStockTransfer, stockChangeApi, stockChangeHistory, stockChangeTitle, type StockChangeLocation,
  type StockChangeMode } from '@/lib/stock-changes';
import { PageHeading } from './dashboard';
import { StockChangesForm } from './stock-changes-form';
import { WarehouseInventory } from './warehouse-inventory';

export async function StockChangesPage({ auth, region, mode, productionOutlet = false, outletId }: {
  auth: Session; region: Region; mode: StockChangeMode; productionOutlet?: boolean; outletId?: string;
}) {
  if (!canWrite(auth.staff) || !canAccessStockChanges(auth.staff, mode)) throw new ApiError(403);
  const locations = await api(url(stockChangeApi + '/locations', { region }), auth.token) as StockChangeLocation[];
  if (mode === 'warehouse-update') return <WarehouseInventory locations={locations} region={region}/>;
  const transfer = isStockTransfer(mode);
  if (productionOutlet) return <>
    <h1>Update Inventory (Warehouse to Outlet)</h1>
    <StockChangesForm locations={locations} region={region} mode={mode} productionOutlet
      initialOutlet={locations.find(location => location.type === 'OUTLET' && location.id === outletId)?.id}/>
  </>;
  return <>
    <PageHeading eyebrow="COMMERCE / INVENTORY" title={stockChangeTitle[mode]}
      description={transfer ? 'Choose where to move the stock and record any costs for the transfer.' : 'Record a stock addition or deduction across product variants.'}>
      <Link className="button secondary" href={stockChangeHistory(mode, region)}>{transfer ? 'Transfer history' : 'Adjustment history'}</Link>
    </PageHeading>
    <StockChangesForm locations={locations} region={region} mode={mode} />
  </>;
}
