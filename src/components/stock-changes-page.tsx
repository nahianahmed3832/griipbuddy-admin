import Link from 'next/link';
import { api, ApiError, canWrite, url, type Session } from '@/lib/api';
import type { Region } from '@/lib/sections';
import { canAccessStockChanges, isStockTransfer, stockChangeApi, stockChangeHistory, stockChangeTitle, type StockChangeLocation,
  type StockChangeMode } from '@/lib/stock-changes';
import { PageHeading } from './dashboard';
import { StockChangesForm } from './stock-changes-form';

export async function StockChangesPage({ auth, region, mode }: { auth: Session; region: Region; mode: StockChangeMode }) {
  if (!canWrite(auth.staff) || !canAccessStockChanges(auth.staff, mode)) throw new ApiError(403);
  const locations = await api(url(stockChangeApi + '/locations', { region }), auth.token) as StockChangeLocation[];
  const transfer = isStockTransfer(mode);
  return <>
    <PageHeading eyebrow="COMMERCE / INVENTORY" title={stockChangeTitle[mode]}
      description={transfer ? 'Choose where to move the stock and record any costs for the transfer.' : 'Record a stock addition or deduction across product variants.'}>
      <Link className="button secondary" href={stockChangeHistory(mode, region)}>{transfer ? 'Transfer history' : 'Adjustment history'}</Link>
    </PageHeading>
    <StockChangesForm locations={locations} region={region} mode={mode} />
  </>;
}
