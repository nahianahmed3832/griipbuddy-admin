import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, MapPin, Package, Pencil, Plus, Search } from 'lucide-react';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { locationsEndpoint, locationsPath, locationTypes, marketLabel, type LocationRecord } from '@/lib/locations';
import { adminPath } from '@/lib/paths';
import { has, type Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { LocationForm } from './location-form';
import { ProductThumbnail } from './product-thumbnail';
import { BarcodeImage } from './barcode-labels';
import { ProductionLocationDirectory, ProductionLocationManagement, type DirectoryLocation } from './production-locations';
import styles from './warehouse-inventory.module.css';
import editor from './production-product-editor.module.css';

function record(raw: unknown): LocationRecord {
  const row = obj(raw);
  const address = obj(row.address);
  return {
    id: str(row._id), revision: str(row.updatedAt) || null,
    name: str(row.name) || str(row.business_location_name),
    type: str(row.type) || str(row.business_location_type),
    address: {
      local_address: str(address.local_address), division: str(address.division), district: str(address.district),
      thana: str(address.thana), zip_code: str(address.zip_code),
    },
    manager_name: str(row.manager_name),
    pickup_enabled: row.pickup_enabled === true, pickup_contact: str(row.pickup_contact), country_code: str(row.country_code) || undefined,
    contact_numbers: (Array.isArray(row.contact_numbers) ? row.contact_numbers : str(row.contact_numbers).split(','))
      .map(str).map(phone => phone.trim()).filter(Boolean),
  };
}

function TypeBadge({ type }: { type: string }) {
  const known = Object.hasOwn(locationTypes, type);
  const label = known ? locationTypes[type as keyof typeof locationTypes] : type || 'Unspecified';
  return <span className={'location-type' + (type === 'WAREHOUSE' ? ' location-type-warehouse' : '')}>{label}</span>;
}

function Address({ address }: { address: LocationRecord['address'] }) {
  const area = [address.thana, address.district, address.division, address.zip_code]
    .filter(Boolean).filter((part, index, parts) => parts.findIndex(value => value.toLowerCase() === part.toLowerCase()) === index).join(', ');
  return <>
    {address.local_address || (!area && <span className="dim">Address missing</span>)}
    {area && <small className="location-secondary">{area}</small>}
  </>;
}

async function Directory({ auth, region, q, allowCreate }: { auth: Session; region: Region; q: Query; allowCreate: boolean }) {
  const search = param(q, 'q')?.trim().slice(0, 100) || '';
  const type = param(q, 'type') || '';
  const filters = { region, q: search, type: Object.hasOwn(locationTypes, type) ? type : '',
    sort: param(q, 'sort') === 'desc' ? 'desc' : 'asc' };
  const pageQuery = param(q, 'page');
  const result = obj(await api(url(locationsEndpoint, { ...filters, page: pageQuery }), auth.token));
  const rows = arr(result.rows).map(record);
  const total = Number(result.total);
  const page = Number(result.page);
  const pages = Number(result.pages);
  const pageSize = Number(result.pageSize);
  const reset = url(locationsPath, { region });
  const filtered = Boolean(search || filters.type);
  return <>
    <PageHeading eyebrow="INVENTORY / LOCATIONS" title="Locations"
      description="Find and manage the outlets and warehouses that support your operations.">
      {allowCreate && <Link className="button primary" href={url(locationsPath + '/create', { region })}><Plus size={16}/> Add location</Link>}
    </PageHeading>
    <section className="panel location-directory" aria-labelledby="location-directory-title">
      <header className="panel-header">
        <div><h2 id="location-directory-title">Location directory</h2>
          <p>{total.toLocaleString('en')} {total === 1 ? 'location' : 'locations'} {filtered ? 'found' : 'in this region'}</p>
        </div>
        <span className="location-market"><MapPin size={14} aria-hidden="true"/>{marketLabel(region)}</span>
      </header>
      <form key={JSON.stringify(filters)} className="location-filters" action={adminPath(locationsPath)}>
        <input type="hidden" name="region" value={region}/>
        <label className="location-search"><span>Search locations</span>
          <span className="location-search-control"><Search size={16} aria-hidden="true"/>
            <input type="search" name="q" placeholder="Name, address or manager" maxLength={100} defaultValue={search}/>
          </span>
        </label>
        <label>Type<select name="type" defaultValue={filters.type}>
          <option value="">All types</option>
          {Object.entries(locationTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Sort by<select name="sort" defaultValue={filters.sort}>
          <option value="asc">Name A–Z</option><option value="desc">Name Z–A</option>
        </select></label>
        <div className="location-filter-actions"><button className="button secondary" type="submit">Apply</button>
          {(filtered || filters.sort === 'desc') && <Link className="button subtle" href={reset}>Reset</Link>}
        </div>
      </form>
      {rows.length ? <div className="table-scroll location-table" tabIndex={0} role="region" aria-label="Location results">
        <table>
          <thead><tr><th scope="col">Location</th><th scope="col">Type</th><th scope="col">Address</th>
            <th scope="col" className="location-manager">Manager</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <th scope="row"><Link className="table-link location-row-link" href={url(locationsPath + '/' + row.id, { region })}>
              {row.name || 'Unnamed location'}<ChevronRight size={14} aria-hidden="true"/>
            </Link></th>
            <td><TypeBadge type={row.type}/></td>
            <td><Address address={row.address}/></td>
            <td className="location-manager">{row.manager_name || <span className="dim">—</span>}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="empty">
        <span className="empty-icon"><MapPin size={21} aria-hidden="true"/></span>
        <h3>{filtered ? 'No matching locations' : 'No locations in this region'}</h3>
        <p>{filtered ? 'Try a different search or reset the filters.' : 'Locations added to this operating region will appear here.'}</p>
      </div>}
      {pages > 1 && <nav className="pagination" aria-label="Location pages">
        <span>{(page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} of {total}</span>
        <div>{page > 1 && <Link className="button secondary" href={url(locationsPath, { ...filters, page: String(page - 1) })}>
          <ArrowLeft size={14} aria-hidden="true"/> Previous</Link>}
        {page < pages && <Link className="button secondary" href={url(locationsPath, { ...filters, page: String(page + 1) })}>
          Next <ArrowRight size={14} aria-hidden="true"/></Link>}</div>
      </nav>}
    </section>
  </>;
}

export async function LocationsPage({ auth, region, q, id, production = false }: { auth: Session; region: Region; q: Query; id?: string; production?: boolean }) {
  if (!has(auth.staff, 'business_locations.view')) throw new ApiError(403);
  const inventory = param(q, 'inventoryView');
  if (!id && (inventory === 'warehouse' || inventory === 'outlet')) {
    return <LocationInventory auth={auth} region={region} q={q} type={inventory}/>;
  }
  const allowCreate = canWrite(auth.staff) && has(auth.staff, 'business_locations.create');
  const allowEdit = canWrite(auth.staff) && has(auth.staff, 'business_locations.update');
  if (!id && production) {
    const management = param(q, 'locationView') === 'management';
    const requested = param(q, 'limit') ?? '';
    const limit = management ? 'all' : ['20','40','60','80','100','all'].includes(requested) ? requested : '20';
    const page = limit === 'all' ? 1 : Math.min(10000, Math.max(1, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
    const payload = obj(await api(url('/business-location', { region, page: String(page), limit: limit === 'all' ? '10000' : limit }), auth.token));
    const rows: DirectoryLocation[] = arr(payload.businessLocations).map(raw => {
      const original = obj(raw);
      const geo = obj(original.location);
      return { ...record(raw), created: str(original.createdAt), latitude: coordinate(geo.latitude), longitude: coordinate(geo.longitude) };
    }).filter(row => mongoId(row.id));
    if (management) return <ProductionLocationManagement rows={rows}/>;
    return <ProductionLocationDirectory rows={rows} region={region} limit={limit} page={page} total={Number(obj(payload.meta).total) || 0}
      canEdit={allowEdit} canDelete={canWrite(auth.staff) && has(auth.staff, 'business_locations.delete')}/>;
  }
  if (!id) return Directory({ auth, region, q, allowCreate });

  const listHref = url(locationsPath, { region });
  const creating = id === 'create';
  const editing = !creating && param(q, 'edit') === '1';
  if (creating && !allowCreate || editing && !allowEdit) throw new ApiError(403);
  if (!creating && !mongoId(id)) throw new ApiError(404);
  const location = creating ? undefined : record(await api(url(locationsEndpoint + '/' + id, { region }), auth.token));
  const detailHref = url(locationsPath + '/' + id, { region });
  if (production && (creating || editing)) {
    const back = url('/dashboard/business-location/all', { region: region === 'INTERNATIONAL' ? region : undefined });
    return <section className={editor.editor}>
      <header className={editor.pageHeading}><Link className={editor.back} href={back} aria-label="Back to business locations"><ChevronLeft size={16}/></Link>
        <h1 className={editor.heading}>{editing ? 'Edit Business Location' : 'Create Business Location'}</h1></header>
      <LocationForm key={id} location={location} region={region} cancelHref={back} production/>
    </section>;
  }
  if (creating || editing) return <>
    <Link className="location-back" href={editing ? detailHref : listHref}><ArrowLeft size={15} aria-hidden="true"/>
      {editing ? 'Back to location' : 'All locations'}</Link>
    <PageHeading eyebrow="INVENTORY / LOCATIONS" title={editing ? 'Edit location' : 'Add location'}
      description={editing ? location?.name || 'Update this location’s details.' : 'Set up a new outlet or warehouse.'}/>
    <LocationForm key={id} location={location} region={region} cancelHref={editing ? detailHref : listHref}/>
  </>;

  if (!location?.id) throw new ApiError(404);
  const saved = param(q, 'saved');
  return <>
    <Link className="location-back" href={listHref}><ArrowLeft size={15} aria-hidden="true"/> All locations</Link>
    <PageHeading eyebrow="INVENTORY / LOCATION DETAILS" title={location.name || 'Unnamed location'}
      description={marketLabel(region) + ' operating region'}>
      {has(auth.staff, 'stock.view') && <Link className="button secondary"
        href={url('/desk/inventory/stock', { region, location: id })}><Package size={16} aria-hidden="true"/> View stock</Link>}
      {allowEdit && <Link className="button primary" href={url(locationsPath + '/' + id, { region, edit: '1' })}>
        <Pencil size={15} aria-hidden="true"/> Edit location</Link>}
    </PageHeading>
    {(saved === 'created' || saved === 'updated') && <div className="notice location-success" role="status">
      <CheckCircle2 size={17} aria-hidden="true"/> {saved === 'created' ? 'Location added.' : 'Location changes saved.'}
    </div>}
    <div className="location-details">
      <section className="panel">
        <div className="panel-header"><h2>Location details</h2></div>
        <dl><div><dt>Type</dt><dd><TypeBadge type={location.type}/></dd></div>
          <div><dt>Address</dt><dd><Address address={location.address}/></dd></div>
          {location.type === 'OUTLET' && <div><dt>Pickup directory</dt><dd>{location.pickup_enabled ? `${location.country_code} · ${location.pickup_contact}` : 'Unlisted'}</dd></div>}</dl>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Contacts</h2></div>
        <dl><div><dt>Manager</dt><dd>{location.manager_name || 'Unassigned'}</dd></div>
          <div><dt>Phone numbers</dt><dd>{location.contact_numbers.length ? <ul className="location-phones">
            {location.contact_numbers.map((phone, index) => <li key={index}>{phone}</li>)}
          </ul> : 'None added'}</dd></div></dl>
      </section>
    </div>
  </>;
}

const coordinate = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function InventoryBarcode({ code }: { code: string }) {
  return code && /^[\x20-\x7e]{1,80}$/.test(code)
    ? <span className={styles.barcode}><BarcodeImage code={code}/><small>{code}</small></span> : <span>{code || '—'}</span>;
}

function outletGroups(payload: Record<string, unknown>) {
  const inventory = arr(payload.inventory).map(obj);
  if (inventory.length) return inventory.map(row => ({ product: obj(row.product), variants: arr(row.variants).map(obj) }));
  const groups = new Map<string, { product: Record<string, unknown>; variants: Record<string, unknown>[] }>();
  for (const raw of arr(payload.data)) {
    const row = obj(raw);
    const product = obj(row.product);
    const id = str(product._id);
    if (!mongoId(id)) continue;
    const group = groups.get(id) ?? { product, variants: [] };
    group.variants.push({ ...row, ...obj(row.variant) });
    groups.set(id, group);
  }
  return [...groups.values()];
}

async function LocationInventory({ auth, region, q, type }: { auth: Session; region: Region; q: Query; type: 'warehouse' | 'outlet' }) {
  if (!has(auth.staff, 'stock.view')) throw new ApiError(403);
  const path = '/dashboard/inventory/view/' + type;
  const label = type === 'warehouse' ? 'Warehouse' : 'Outlet';
  const key = type + '_id';
  const selected = param(q, key);
  const directory = obj(await api(url(locationsEndpoint, { region, type: type.toUpperCase() }), auth.token));
  const locations = arr(directory.rows).map(record).filter(location => mongoId(location.id));
  let location = locations.find(row => row.id === selected);
  if (selected && !location) {
    if (!mongoId(selected)) throw new ApiError(404, 'Choose a location in the selected region.');
    const bookmarked = record(await api(url(locationsEndpoint + '/' + selected, { region }), auth.token));
    if (bookmarked.type !== type.toUpperCase()) throw new ApiError(404, 'Choose a location in the selected region.');
    locations.push(bookmarked);
    location = bookmarked;
  }
  const warehouseRows = type === 'warehouse';
  const limitOptions = ['20', '40', '60', '80', '100', ...(warehouseRows ? ['all'] : [])];
  const requested = param(q, 'limit') ?? '20';
  const size = limitOptions.includes(requested) ? requested : '20';
  const page = size === 'all' ? 1 : Math.min(10000, Math.max(1, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
  const loadPage = async (number: number) => location ? obj(await api(url(warehouseRows ? '/stocks/workspace/warehouse-inventory/records' : '/business-location/inventories/' + location.id, {
    region, ...(warehouseRows && { warehouse: location.id }), page: String(number), limit: warehouseRows ? size === 'all' ? '100' : size : '10000',
  }), auth.token)) : {};
  const payload = await loadPage(warehouseRows ? page : 1);
  const rows = arr(payload.rows).map(obj);
  const outlets = outletGroups(payload);
  const total = warehouseRows ? Number(payload.total) || 0 : outlets.length;
  if (size === 'all' && total > rows.length) {
    for (let number = 2; number <= Math.ceil(total / 100); number += 8) {
      const rest = await Promise.all(Array.from({ length: Math.min(8, Math.ceil(total / 100) - number + 1) }, (_, index) => loadPage(number + index)));
      rows.push(...rest.flatMap(result => arr(result.rows).map(obj)));
    }
  }
  const link = (number: number) => url(path, { region, [key]: selected, limit: size, page: String(number) });
  const amount = (value: unknown) => typeof value === 'number' ? new Intl.NumberFormat('en').format(value) : '—';
  const currency = (value: number) => (region === 'BD' ? '৳' : '') + amount(value);
  const range = (variants: Record<string, unknown>[], field: string) => {
    const values = variants.map(variant => typeof variant[field] === 'number' ? Number(variant[field]) : 0);
    const minimum = Math.min(...values), maximum = Math.max(...values);
    return values.length > 0 ? minimum === maximum ? currency(minimum) : currency(minimum) + ' - ' + currency(maximum) : currency(0);
  };
  return <section className={warehouseRows ? styles.page : 'panel padded'}>
    <h1>{warehouseRows && location ? location.name : label} Inventory</h1>
    <form className="location-filters" action={adminPath(path)}>
      <input type="hidden" name="region" value={region}/>
      <label>Select {label}<select name={key} defaultValue={selected ?? ''}>
        <option value="">Select {label}</option>
        {locations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <label>Items per page<select name="limit" defaultValue={size}>{limitOptions.map(value => <option key={value} value={value}>{value === 'all' ? 'All' : value}</option>)}</select></label>
      <button className="button secondary" type="submit">View inventory</button>
    </form>
    {!location ? <p>Please select a {label}.</p> : !(warehouseRows ? rows.length : outlets.length) ? <p>No inventory found for this {type}.</p> :
      warehouseRows ? <div className={styles.recordList}>{rows.map(row => {
        const variants = arr(row.variants).map(obj);
        const units = variants.reduce((sum, variant) => sum + (typeof variant.quantity === 'number' ? variant.quantity : 0), 0);
        return <details className={styles.card} key={str(row.product)}>
          <summary className={styles.productSummary}><ProductThumbnail source={row.image} size={48}/><strong>{str(row.name)}</strong>
            <span>{units} units</span><span>{variants.length} {variants.length === 1 ? 'variant' : 'variants'}</span></summary>
          <div className={styles.table} role="region" aria-label={str(row.name) + ' inventory'} tabIndex={0}>
            <table><thead><tr>{['Items', 'SKU', 'Regular Price', 'Sale Price', 'Quantity', 'Barcode'].map(column =>
              <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{variants.map((variant, index) => <tr key={str(variant.sku) + index}>
                <td>{str(row.name)}{Object.keys(obj(variant.attribute_values)).length > 0 && ' (' + Object.values(obj(variant.attribute_values)).map(str).join(' - ') + ')'}</td>
                <td>{str(variant.sku)}</td><td>{region === 'BD' ? '৳' : ''}{amount(variant.regular_price)}</td>
                <td>{region === 'BD' ? '৳' : ''}{amount(variant.sale_price)}</td><td>{amount(variant.quantity)}</td><td><InventoryBarcode code={str(variant.barcode)}/></td>
              </tr>)}</tbody></table>
          </div>
        </details>;
      })}</div> : <div className="table-scroll" role="region" aria-label={label + ' stock'} tabIndex={0}>
        <table><thead><tr>{['Image', 'Product Name', 'Variants', 'Total Qty', 'Regular Price', 'Sale Price'].map(column =>
          <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>{outlets.slice((page - 1) * Number(size), page * Number(size)).map(({ product, variants }) => {
            const quantity = variants.reduce((sum, variant) => sum + (coordinate(variant.available_quantity ?? variant.quantity) ?? 0), 0);
            return <tr key={str(product._id)}><td><ProductThumbnail source={product.thumbnail} size={80}/></td>
              <td>{str(product.name)}</td><td><ul className={styles.outletVariants}>{variants.map((variant, index) =>
                <li key={str(variant._id) + index}><strong>{str(variant.sku)}</strong><span>Stock: {amount(variant.available_quantity ?? variant.quantity)}</span>
                  {Boolean(variant.barcode) && <InventoryBarcode code={str(variant.barcode)}/>}</li>)}</ul></td>
              <td><strong>{quantity}</strong> units</td><td>{range(variants, 'regular_price')}</td><td>{range(variants, 'sale_price')}</td></tr>;
          })}</tbody>
        </table>
      </div>}
    {size !== 'all' && total > Number(size) && <nav className="pagination" aria-label={label + ' inventory pages'}>
      {page > 1 && <Link href={link(page - 1)}>Previous</Link>}
      {page * Number(size) < total && <Link href={link(page + 1)}>Next</Link>}
    </nav>}
  </section>;
}
