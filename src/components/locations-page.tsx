import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, MapPin, Package, Pencil, Plus, Search } from 'lucide-react';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type Session } from '@/lib/api';
import { param, type Query } from '@/lib/data';
import { locationsEndpoint, locationsPath, locationTypes, marketLabel, type LocationRecord } from '@/lib/locations';
import { adminPath } from '@/lib/paths';
import { has, type Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { LocationForm } from './location-form';

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

export async function LocationsPage({ auth, region, q, id }: { auth: Session; region: Region; q: Query; id?: string }) {
  if (!has(auth.staff, 'business_locations.view')) throw new ApiError(403);
  const allowCreate = canWrite(auth.staff) && has(auth.staff, 'business_locations.create');
  const allowEdit = canWrite(auth.staff) && has(auth.staff, 'business_locations.update');
  if (!id) return Directory({ auth, region, q, allowCreate });

  const listHref = url(locationsPath, { region });
  const creating = id === 'create';
  const editing = !creating && param(q, 'edit') === '1';
  if (creating && !allowCreate || editing && !allowEdit) throw new ApiError(403);
  if (!creating && !mongoId(id)) throw new ApiError(404);
  const location = creating ? undefined : record(await api(url(locationsEndpoint + '/' + id, { region }), auth.token));
  const detailHref = url(locationsPath + '/' + id, { region });
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
          <div><dt>Address</dt><dd><Address address={location.address}/></dd></div></dl>
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
