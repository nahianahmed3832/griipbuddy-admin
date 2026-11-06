import Link from 'next/link';
import { ArrowUpRight, Plus, Search } from 'lucide-react';
import { api, ApiError, arr, canWrite, legacyUrl, mongoId, obj, str, url, type Session } from '@/lib/api';
import { loadResource, param, permitted, printable, valueAt, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { has, type Column, type Region, type Resource, type Section } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { Badge, Table } from './tables';
import { MarketForm } from './market-form';
import { OperationActions } from './operation-actions';
import { advancedEnabled, loadLocations } from '@/lib/advanced';

const createPermissions: Record<string,string> = {
  'create-order':'order.create','pre-orders/create':'pre_order.create','create-product':'product.create','add-new-category':'product.create',
  'add-new-sub-category':'product.create','create-brand':'product.create','product-faqs/add-new-faq':'faq.create','add-new-return-policy':'product.create',
  'business-location/create':'business_locations.create','suppliers/create':'supplier.create','barcodes/default-rate':'defaults.purchase',
  'barcodes/generate':'barcode.generate','stock-adjustment/create':'stock.create','stock-transfer/create':'stock.transfer','create-customer':'user.create',
  'create-country':'manage-permissions','create-expense':'expense.create','create-coupon':'coupon.create','pos/create':'pos.create',
  'add-new-staff':'user.create','add-new-role':'role.create',
};

const detailPath: Record<string,string> = {
  '/order': '/order/', '/product/admin/all': '/product/admin/products/',
  '/country/admin/all': '/country/', '/stocks': '/stocks/variant/', '/product/admin/variants': '/product/variant/single/',
  '/purchase': '/purchase/', '/coupon/admin/all': '/coupon/', '/pos/sale': '/pos/sale/',
};
const hasDetail = (endpoint: string) => Boolean(detailPath[endpoint]) || endpoint === '/cms/admin/top-bar-messages';

const label = (value: string) => value.replaceAll('_',' ').replace(/^./, char => char.toUpperCase());
export async function ResourcePage({ section, view, resource, auth, q, region }: {
  section: Section; view: string; resource: Resource; auth: Session; q: Query; region: Region;
}) {
  const path = '/desk/' + section.id + '/' + view;
  const result = await loadResource(resource,auth,q,region);
  const writeKey = resource.legacyCreate && createPermissions[resource.legacyCreate];
  const create = writeKey && has(auth.staff, writeKey) && legacyUrl(resource.legacyCreate);
  const classic = legacyUrl(resource.legacy);
  const query = { region, q: result.search, filter: param(q,'filter'), from: param(q,'from'), to: param(q,'to'), location: param(q,'location') };
  const handover = section.id === 'shipping' && advancedEnabled() && canWrite(auth.staff)
    && has(auth.staff, 'courier.update') && has(auth.staff, 'business_locations.view')
    ? { locations: await loadLocations(auth, region), region } : undefined;
  const rows = result.rows.map((record,index) => {
    const id = str(record._id);
    const slug = str(record.slug);
    const detailId = resource.endpoint === '/stocks' ? str(obj(record.variant)._id) || str(record.variant) : id;
    const legacy = resource.legacyDetail?.replace(':id', id).replace(':slug',slug);
    const currency = str(record.currency) || (region === 'INTERNATIONAL' ? 'USD' : 'BDT');
    return {
      id: id || String(index), values: resource.columns.map(col => printable(valueAt(record,col.fields),col.kind,currency)),
      href: hasDetail(resource.endpoint) && mongoId(detailId) ? url(path+'/'+detailId,{region}) : undefined,
      legacy: legacy && !legacy.endsWith('/') && legacyUrl(legacy) || undefined,
    };
  });
  return <>
    <PageHeading eyebrow={section.group.toUpperCase()+' / '+section.label.toUpperCase()} title={resource.title} description={section.description}>
      {classic && <a className="button secondary" href={classic} target="_blank" rel="noreferrer">Preserved workflow <ArrowUpRight size={15}/></a>}
      {create && <a className="button primary" href={create} target="_blank" rel="noreferrer"><Plus size={17}/> Open create form</a>}
      {resource.endpoint === '/pos/sale' && region === 'BD' && advancedEnabled() && canWrite(auth.staff) && has(auth.staff, 'pos.create')
        && <Link className="button primary" href="/desk/pos/editor"><Plus size={16}/> New POS sale</Link>}
      <OperationActions endpoint={resource.endpoint} auth={auth} region={region}/>
    </PageHeading>
    {section.id === 'markets' && <div className="market-context"><span><strong>Country configuration</strong><small>Country activation and currency</small></span>
      <span><strong>Regional catalog</strong><small>Visibility and variant price overrides</small></span>
      <span><strong>Shipping and fallback</strong><small>Storefront runtime settings</small></span></div>}
    {section.id === 'shipping' && <div className="notice">Open an order to see its tracking record and available courier actions.</div>}
    <form action={adminPath(path)} className="panel filters">
      <input type="hidden" name="region" value={region}/>
      <label className="search-input"><Search size={17}/><input aria-label={resource.search ? 'Search records' : 'Search this page'} name="q" maxLength={80} placeholder={resource.search ? 'Search records…' : 'Filter visible records…'} defaultValue={result.search}/></label>
      {resource.filter && <label className="filter-label">{resource.filter.label}<select name="filter" defaultValue={param(q,'filter') ?? ''}><option value="">Any status</option>
        {resource.filter.options.map(option => <option key={option} value={option}>{option === 'true' ? 'Published' : option === 'false' ? 'Unpublished' : label(option.toLowerCase())}</option>)}</select></label>}
      {resource.endpoint === '/order' && <><label className="filter-label">From<input type="date" name="from" defaultValue={param(q,'from')}/></label>
        <label className="filter-label">To<input type="date" name="to" defaultValue={param(q,'to')}/></label></>}
      <button className="button primary">Apply filters</button><Link href={url(path,{region})} className="button subtle">Reset</Link>
    </form>
    <Table key={JSON.stringify(query)+result.page} title={resource.title} columns={resource.columns} rows={rows} page={result.page} total={result.total}
      previous={result.page > 1 ? url(path,{...query,page:String(result.page-1)}) : undefined}
      next={result.hasNext ? url(path,{...query,page:String(result.page+1)}) : undefined}
      handover={handover} empty={result.search ? 'Try a different search term or clear the filters.' : undefined}/>
  </>;
}

export async function ResourceDetail({ section, view, resource, id, auth, region }: {
  section: Section; view: string; resource: Resource; id: string; auth: Session; region: Region;
}) {
  const prefix = detailPath[resource.endpoint];
  if (!permitted(resource,auth)) throw new ApiError(403);
  if (!hasDetail(resource.endpoint) || !mongoId(id)) throw new ApiError(404);
  let raw = prefix ? obj(await api(prefix + id, auth.token)) : arr(await api(resource.endpoint, auth.token)).map(obj)
    .find(record => record._id === id);
  if (!raw || !Object.keys(raw).length) throw new ApiError(404);
  if (resource.endpoint === '/product/admin/variants') {
    const productId = str(obj(raw.product)._id) || str(raw.product);
    if (!mongoId(productId)) throw new ApiError(404);
    const product = obj(await api('/product/admin/products/'+productId,auth.token));
    raw = {...raw, region: product.region, product};
  }
  const locationScoped = ['/purchase', '/pos/sale'].includes(resource.endpoint);
  const recordRegion = locationScoped ? str(obj(raw.business_location).region)
    : str(raw.region) || str(obj(raw.product).region) || 'BD';
  const isShared = ['/cms/admin/top-bar-messages', '/coupon/admin/all'].includes(resource.endpoint);
  if (!isShared && resource.flags !== 'market' && recordRegion !== region) throw new ApiError(404);
  const columns = resource.columns;
  const slug = str(raw.slug);
  const classic = resource.legacyDetail?.replace(':id',id).replace(':slug',slug);
  const href = classic && !classic.endsWith('/') ? legacyUrl(classic) : legacyUrl(resource.legacy);
  const heading = resource.endpoint === '/stocks' ? str(obj(raw.variant).sku) : printable(valueAt(raw,columns[0].fields), columns[0].kind);
  const currency = str(raw.currency) || (region === 'INTERNATIONAL' ? 'USD' : 'BDT');
  const back = url('/desk/'+section.id+'/'+view,{region});
  return <>
    <PageHeading eyebrow={section.label.toUpperCase()+' / RECORD'} title={heading || resource.title} description="Record details from the recovery API.">
      <Link className="button secondary" href={back}>Back to {resource.title.toLowerCase()}</Link>
      {href && <a className="button secondary" href={href} target="_blank" rel="noreferrer">Open workflow <ArrowUpRight size={15}/></a>}
      {resource.flags === 'market' && canWrite(auth.staff) && <MarketForm id={id} name={str(raw.name)} code={str(raw.code)} currency={str(raw.currency)} active={raw.is_active === true}/>}
      {resource.endpoint === '/pos/sale' && region === 'BD' && advancedEnabled() && canWrite(auth.staff) && has(auth.staff, 'pos.update')
        && <Link className="button primary" href={'/desk/pos/editor/' + id}>Edit sale</Link>}
      <OperationActions endpoint={resource.endpoint} auth={auth} region={region} record={raw} id={id}/>
    </PageHeading>
    {resource.endpoint !== '/stocks' && <section className="panel"><div className="panel-header"><div><h2>Record summary</h2><p>{id}</p></div></div>
      <dl className="details-grid padded">{columns.map(col => {
        const value = printable(valueAt(raw,col.fields),col.kind,currency);
        return <div key={col.label}><dt>{col.label}</dt><dd>{value && col.kind === 'badge' ? <Badge value={value}/> : value || '—'}</dd></div>;
      })}</dl></section>}
    {resource.endpoint === '/order' && <>
      <ReadRows title="Order items" input={raw.products} columns={[
        {label:'Product',fields:'product.name|selected_variant.product_name|selected_variant.sku'},
        {label:'Quantity',fields:'total_quantity|quantity'}, {label:'SKU',fields:'selected_variant.sku|variant.sku'},
      ]}/>
      <ReadRows title="Order activity" input={raw.status_history} columns={[
        {label:'Status',fields:'status',kind:'badge'}, {label:'Date',fields:'date|createdAt|updated_at',kind:'date'},
        {label:'Note',fields:'note|remarks'},
      ]}/>
    </>}
    {resource.endpoint === '/product/admin/all' && <ReadRows title="Product variants" input={raw.variants} columns={[
      {label:'SKU',fields:'sku'}, {label:'Regular BDT',fields:'regular_price'}, {label:'Sale BDT',fields:'sale_price'},
      {label:'Currency prices',fields:'prices',kind:'list'}, {label:'Barcode',fields:'barcode'},
    ]}/>}
    {resource.endpoint === '/purchase' && <>
      <section className="panel padded"><h2>Purchase notes</h2><p>{str(raw.additional_notes) || 'No notes recorded.'}</p></section>
      <ReadRows title="Purchase lines" input={raw.items} columns={[
        {label:'Product',fields:'product.name'}, {label:'SKU',fields:'variant.sku'}, {label:'Quantity',fields:'qty'},
        ...(has(auth.staff,'purchase.price.view') ? [{label:'Cost per unit',fields:'unit_cost'}] : []),
      ]}/>
    </>}
    {resource.endpoint === '/pos/sale' && <ReadRows title="Sale items" input={raw.products} columns={[
      {label:'Product',fields:'product.name'}, {label:'SKU',fields:'selected_variant.sku'},
      {label:'Remaining quantity',fields:'quantity'}, {label:'Line amount',fields:'total_price',kind:'money'},
    ]}/>}
    {resource.endpoint === '/stocks' && <>
      <ReadRows title="Stock by location" input={raw.stocks_by_location} columns={[
        {label:'Location',fields:'location.name|location.business_location_name'}, {label:'On hand',fields:'available_quantity'},
        {label:'Lots',fields:'lots',kind:'count'},
      ]}/>
      <ReadRows title="Stock lots" input={arr(raw.stocks_by_location).flatMap(stock => arr(obj(stock).lots))} columns={[
        {label:'Lot',fields:'lot_number'}, {label:'Available',fields:'qty_available'}, {label:'Received',fields:'qty_total'},
        {label:'Status',fields:'status',kind:'badge'},
        ...(has(auth.staff,'purchase.price.view') ? [{label:'Cost per unit',fields:'cost_per_unit'}] : []),
      ]}/>
      <ReadRows title="Stock movements" input={obj(raw.stock_movements).data} columns={[
        {label:'Movement',fields:'movement_type|type|source_type'}, {label:'Quantity',fields:'qty|quantity'},
        {label:'Date',fields:'createdAt|created_at|date',kind:'date'},
      ]}/>
    </>}
  </>;
}

function ReadRows({title,input,columns}: {title:string;input:unknown;columns:Column[]}) {
  return <Table title={title} columns={columns} exportable={false} rows={arr(input).map((row,index) => ({
    id: str(obj(row)._id) || String(index), values: columns.map(col => printable(valueAt(row,col.fields),col.kind)),
  }))}/>;
}
