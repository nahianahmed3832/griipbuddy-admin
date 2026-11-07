import Link from 'next/link';
import { Barcode, Search } from 'lucide-react';
import { ApiError, str, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { barcodeConditions, barcodeStatuses } from '@/lib/barcode-data';
import { param, perPage, type Query } from '@/lib/data';
import { canOperate } from '@/lib/operations';
import { adminPath } from '@/lib/paths';
import { has, type Region } from '@/lib/sections';
import { barcodeHistory, inventoryPath, listBarcodes } from '@/lib/smart-inventory';
import { GenerateBarcodes, ReceiveBarcodes } from './barcode-forms';
import { BarcodeRegister } from './barcode-register';
import { PageHeading } from './dashboard';
import { Badge, Empty } from './tables';

const eyebrow = 'INVENTORY / SMART INVENTORY';
const barcodesPath = inventoryPath + '/barcodes';
const logsPath = inventoryPath + '/barcode-logs';

function readable(value: string) {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, first => first.toUpperCase());
}

export async function AllBarcodes({ auth, region, q }: { auth: Session; region: Region; q: Query }) {
  const { rows, total, page, filters } = await listBarcodes(auth, region, q);
  return <>
    <PageHeading eyebrow={eyebrow} title={`All Barcodes (${total.toLocaleString('en')})`} description="Find individual units, print labels, and review stock history.">
      {canOperate(auth.staff, 'barcode-generate') && <Link href={url(inventoryPath + '/generate-barcodes', { region })} className="button primary">
        <Barcode size={16}/> Generate labels
      </Link>}
    </PageHeading>
    <form key={JSON.stringify(filters)} action={adminPath(barcodesPath)} className="panel filters barcode-filters">
      <input type="hidden" name="region" value={region}/>
      <label className="filter-label">SKU<input name="sku" defaultValue={filters.sku} maxLength={100} placeholder="Exact variant SKU"/></label>
      <label className="filter-label">Barcode<input name="barcode" defaultValue={filters.barcode} maxLength={60} placeholder="Scan or type code"/></label>
      <label className="filter-label">Used barcode<select name="is_used_barcode" defaultValue={filters.is_used_barcode}>
        <option value="">All</option><option value="false">Unused</option><option value="true">Used</option>
      </select></label>
      <label className="filter-label">Status<select name="status" defaultValue={filters.status}>
        <option value="">All statuses</option>{barcodeStatuses.map(status => <option key={status} value={status}>{readable(status)}</option>)}
      </select></label>
      <label className="filter-label">Condition<select name="conditions" defaultValue={filters.conditions}>
        <option value="">All conditions</option>{barcodeConditions.map(condition => <option key={condition} value={condition}>{readable(condition)}</option>)}
      </select></label>
      <div className="page-actions"><button className="button primary"><Search size={16}/> Apply filters</button>
        <Link href={url(barcodesPath, { region })} className="button subtle">Clear filters</Link></div>
    </form>
    <BarcodeRegister key={JSON.stringify(filters) + page} rows={rows} history={url(logsPath, { region })}/>
    {(page > 1 || total > perPage) && <nav className="panel pagination" aria-label="Barcode pages">
      <span>Page {page} of {Math.max(1, Math.ceil(total / perPage))}</span><div>
        {page > 1 && <Link href={url(barcodesPath, { ...filters, page: String(page - 1) })} className="button secondary">Previous</Link>}
        {page * perPage < total && <Link href={url(barcodesPath, { ...filters, page: String(page + 1) })} className="button secondary">Next</Link>}
      </div>
    </nav>}
  </>;
}

export function GenerateInventoryLabels({ auth, region }: { auth: Session; region: Region }) {
  if (!canOperate(auth.staff, 'barcode-generate')) throw new ApiError(403);
  return <>
    <PageHeading eyebrow={eyebrow} title="Generate Barcodes" description="Create unique EAN-13 labels for individual units. Receive the labels to add the units to stock."/>
    <GenerateBarcodes key={region} region={region}/>
  </>;
}

export async function ScanToReceive({ auth, region }: { auth: Session; region: Region }) {
  if (!canOperate(auth.staff, 'barcode-receive')) throw new ApiError(403);
  const locations = await loadLocations(auth, region);
  return <>
    <PageHeading eyebrow={eyebrow} title="Scan to Receive" description="Receive labeled units at a business location and record their purchase and stock lots."/>
    <ReceiveBarcodes key={region} locations={locations} region={region} purchases={has(auth.staff, 'purchase.view') ? inventoryPath + '/purchases' : undefined}/>
  </>;
}

export async function BarcodeLogs({ auth, region, q }: { auth: Session; region: Region; q: Query }) {
  if (!has(auth.staff, 'barcode.view')) throw new ApiError(403);
  const code = (param(q, 'barcode') ?? '').trim().slice(0, 61);
  let history: Awaited<ReturnType<typeof barcodeHistory>> | undefined;
  let error = '';
  if (code) {
    try { history = await barcodeHistory(code, auth, region); }
    catch (caught) {
      if (!(caught instanceof ApiError) || ![400, 404].includes(caught.status)) throw caught;
      error = caught.status === 404 ? 'No unit matches that barcode in this market.' : caught.message;
    }
  }
  return <>
    <PageHeading eyebrow={eyebrow} title="Barcode Logs" description="Scan or enter a unit barcode to see its inventory history."/>
    <form action={adminPath(logsPath)} className="panel filters barcode-filters" key={code + region}>
      <input type="hidden" name="region" value={region}/>
      <label className="filter-label">Scan or type a barcode<input name="barcode" maxLength={60} defaultValue={code} autoComplete="off" required/></label>
      <button className="button primary"><Search size={16}/> Load history</button>
    </form>
    {error && <p className="notice warn" role="alert">{error}</p>}
    {history && <section className="panel">
      <div className="panel-header"><div><h2><code>{history.unit.barcode}</code></h2><p>{[history.unit.sku, history.unit.product].filter(Boolean).join(' · ')}</p></div>
        {history.unit.status && <Badge value={history.unit.status}/>}
      </div>
      {history.logs.length ? <ol className="barcode-history" aria-label="Barcode history">{history.logs.map((log, index) => {
        const date = str(log.date);
        return <li key={date + '-' + index}>
          <strong>{str(log.system_message) || 'Inventory update'}</strong>
          <span className="dim">{[str(log.name), str(log.role)].filter(Boolean).join(' · ')}</span>
          {str(log.admin_note) && <p>{str(log.admin_note)}</p>}
          {date && <time dateTime={date}>{date.slice(0, 16).replace('T', ' ')} UTC</time>}
        </li>;
      })}</ol> : <Empty title="No history recorded" detail="This unit has no inventory events on file."/>}
    </section>}
  </>;
}
