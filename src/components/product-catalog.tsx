import Link from 'next/link';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Boxes, PackageSearch, Plus, X } from 'lucide-react';
import { ApiError, arr, canWrite, legacyUrl, mongoId, obj, str, url, type Session } from '@/lib/api';
import { loadLocations } from '@/lib/advanced';
import { basePricing, catalogFilters, catalogPageSizes, catalogParams, catalogPath, catalogSorts, categoryKeys,
  loadCatalog, loadCategoryTree, productCategory, stockOverview } from '@/lib/catalog-list';
import { permitted, type Query } from '@/lib/data';
import { managedViewsFor } from '@/lib/managed';
import { adminPath } from '@/lib/paths';
import { has, resources, type Region } from '@/lib/sections';
import { CatalogExport, CatalogFiltersForm } from './catalog-controls';
import { ProductThumbnail } from './product-thumbnail';

const count = (value: number) => value.toLocaleString('en');
const money = (value: number) => '৳' + value.toLocaleString('en', { maximumFractionDigits: 2 });

export async function ProductCatalog({ auth, q, region }: { auth: Session; q: Query; region: Region }) {
  if (!permitted(resources.catalog.products, auth)) throw new ApiError(403);
  const showStock = has(auth.staff, 'stock.view');
  const showLocations = showStock && has(auth.staff, 'business_locations.view');
  const f = catalogFilters(q, showStock, showLocations);
  const params = catalogParams(f, region);
  const href = (changes: Record<string, string | undefined> = {}) => url(catalogPath, { ...params, page: undefined, ...changes });
  const reset = url(catalogPath, { region });
  const [data, treeResult, locationResult] = await Promise.all([
    loadCatalog(auth, f, region),
    loadCategoryTree(auth).catch((error: unknown) => { if (!(error instanceof ApiError)) throw error; return null; }),
    showLocations ? loadLocations(auth, region).catch((error: unknown) => { if (!(error instanceof ApiError)) throw error; return null; }) : [],
  ]);
  const tree = treeResult ?? [];
  const locations = locationResult ?? [];
  const classic = legacyUrl('products');
  const mayCreate = has(auth.staff, 'product.create');
  const classicCreate = mayCreate ? legacyUrl('create-product') : undefined;
  const studio = managedViewsFor(auth.staff, 'catalog').some(([key]) => key === 'listing-studio');
  const createInStudio = studio && mayCreate && canWrite(auth.staff);
  const stockHref = url('/desk/inventory/stock', { region, location: f.location });
  const market = region === 'INTERNATIONAL' ? 'International' : 'Bangladesh';
  const entries = data.rows.map((row, index) => {
    const id = str(row._id);
    const name = str(row.name) || 'Untitled product';
    const sku = str(row.sku);
    const category = productCategory(row);
    const variants = arr(row.variants).map(obj);
    const price = basePricing(variants);
    const stock = showStock ? stockOverview(row, variants, showLocations) : undefined;
    const stockLabel = stock?.known ? stock.units ? count(stock.units) + ' available' : 'No available stock' : 'Stock unavailable';
    const publication = row.is_published ?? row.isPublished;
    const status = publication === true ? 'Published' : publication === false ? 'Unpublished' : 'Status unknown';
    const channels = obj(row.sale_channels);
    const channelNames = [channels.website === true ? 'Website' : '', channels.pos === true ? 'POS' : ''].filter(Boolean);
    const priceLabel = price ? price.min === price.max ? money(price.min) : money(price.min) + ' – ' + money(price.max) : 'No price';
    const details = mongoId(id) ? url(catalogPath + '/' + id, params) : undefined;
    return { key: id || String(index), name, sku, category, variants: variants.length, price, stock, stockLabel, status, channelNames, priceLabel,
      thumbnail: row.thumbnail, details, stockLink: showStock && details ? url('/desk/inventory/stock', { region, product: id, location: f.location }) : undefined };
  });

  const active: Array<{ label: string; remove: string }> = [];
  if (f.q) active.push({ label: (f.searchBy === 'sku' ? 'SKU: ' : 'Search: ') + f.q, remove: href({ q: undefined, searchBy: undefined }) });
  let choices = tree;
  if (f.category.length) {
    const path = f.category.map(id => {
      const node = choices.find(choice => choice.id === id);
      choices = node?.children ?? [];
      return node?.name ?? 'Unavailable category';
    });
    active.push({ label: path.join(' / '), remove: href(Object.fromEntries(categoryKeys.map(key => [key, undefined]))) });
  }
  if (f.stock) active.push({ label: f.stock === 'in' ? 'In stock' : 'No available stock', remove: href({ stock: undefined }) });
  if (f.location) active.push({ label: locations.find(item => item.value === f.location)?.label || 'Selected location', remove: href({ location: undefined }) });
  if (f.filter) active.push({ label: f.filter === 'true' ? 'Published' : 'Unpublished', remove: href({ filter: undefined }) });

  const offset = (f.page - 1) * f.size;
  const hasNext = data.total === undefined ? entries.length === f.size : offset + entries.length < data.total;
  const rowRange = entries.length ? count(offset + 1) + '–' + count(offset + entries.length) : '0';
  const results = data.total === undefined ? count(entries.length) + ' on this page' : count(data.total) + (data.total === 1 ? ' product' : ' products');
  const header = ['Product', 'SKU', 'Category', 'Variants', 'Base price (BDT)', ...(showStock ? ['Availability', 'Stocked locations'] : []), 'Publication', 'Sales channels'];
  const exportRows = entries.map(row => [row.name, row.sku, row.category.join(' / '), String(row.variants), row.priceLabel,
    ...(showStock ? [row.stockLabel, row.stock?.locations.join(', ') ?? ''] : []), row.status, row.channelNames.join(', ')]);

  return <div className="catalog-list">
    <header className="catalog-heading">
      <div><div className="eyebrow">COMMERCE / CATALOG</div><h1>All Products</h1>
        <p>Find a listing and check its category, price and publication in one place.</p></div>
      <div className="page-actions">
        {showStock && <Link className="button secondary" href={stockHref}><Boxes size={16} aria-hidden="true"/> Stock report</Link>}
        {classicCreate ? <a className="button primary" href={classicCreate} target="_blank" rel="noreferrer"><Plus size={16} aria-hidden="true"/> Create product</a>
          : createInStudio && <Link className="button primary" href={url('/desk/catalog/listing-studio', { region }) + '#create-product'}>
            <Plus size={16} aria-hidden="true"/> Create product</Link>}
      </div>
    </header>
    <section className="panel catalog-filter-panel" aria-label="Filter products">
      <div className="catalog-filter-bar">
        <nav aria-label="Publication status" className="catalog-segments">
          {[['', 'All listings'], ['true', 'Published'], ['false', 'Unpublished']].map(([filter, label]) =>
            <Link key={label} href={href({ filter })} aria-current={filter === f.filter ? 'page' : undefined}>{label}</Link>)}
        </nav>
        <span className="catalog-market"><span aria-hidden="true"/>{market} catalog</span>
      </div>
      <CatalogFiltersForm key={JSON.stringify(f)} action={adminPath(catalogPath)} region={region} filters={f}
        tree={tree} locations={locations} sorts={catalogSorts} showStock={showStock} showLocations={showLocations}/>
      {(treeResult === null || locationResult === null) && <p className="catalog-filter-notice" role="status">
        {treeResult === null && locationResult === null ? 'Categories and locations' : treeResult === null ? 'Categories' : 'Locations'} could not be loaded. You can still search and use the other filters.
      </p>}
      {!!active.length && <div className="catalog-active-filters">
        <span>Applied:</span>{active.map(item => <Link key={item.remove} href={item.remove} aria-label={'Remove filter: ' + item.label}>{item.label}<X size={13} aria-hidden="true"/></Link>)}
        <Link className="catalog-clear" href={reset}>Clear filters</Link>
      </div>}
    </section>
    <section className="panel catalog-results" aria-labelledby="catalog-results">
      <div className="catalog-results-heading">
        <div><h2 id="catalog-results">{results}</h2><p>{entries.length ? 'Showing ' + rowRange : f.page > 1 ? 'This page is empty' : active.length ? 'No results for these filters' : 'No listings in this region'}</p></div>
        <div className="page-actions">
          {classic && <a className="button secondary" href={classic} target="_blank" rel="noreferrer">Classic products <ArrowUpRight size={14} aria-hidden="true"/></a>}
          {!!entries.length && <CatalogExport header={header} rows={exportRows}/>}
        </div>
      </div>
      {entries.length ? <table className={'catalog-table' + (showStock ? '' : ' catalog-no-stock')} role="table">
        <caption className="catalog-sr-only">Product listings and available actions</caption>
        <thead role="rowgroup"><tr role="row">
          <th scope="col" role="columnheader">Product</th><th scope="col" role="columnheader">Base price <small>BDT</small></th>
          {showStock && <th scope="col" role="columnheader">Availability</th>}
          <th scope="col" role="columnheader">Publication</th><th scope="col" role="columnheader" className="catalog-actions-header"><span className="catalog-sr-only">Listing link</span></th>
        </tr></thead>
        <tbody role="rowgroup">{entries.map(row => <tr role="row" key={row.key}>
          <td role="cell" className="catalog-product-cell">
            <ProductThumbnail source={row.thumbnail} size={46}/>
            <div className="catalog-product-text">
              {row.details ? <Link className="catalog-product-name" href={row.details} prefetch={false}>{row.name}</Link> : <strong>{row.name}</strong>}
              <span className="catalog-product-meta">{row.sku ? <code>{row.sku}</code> : <span>No SKU</span>}
                <span aria-hidden="true">·</span><span>{row.variants} {row.variants === 1 ? 'variant' : 'variants'}</span></span>
              <span className="catalog-category" title={row.category.join(' / ')}>{row.category.join(' / ') || 'No category assigned'}</span>
            </div>
          </td>
          <td role="cell" className="catalog-price"><span className="catalog-cell-label">Base price · BDT</span>
            <strong>{row.priceLabel}</strong>{row.price?.was !== undefined && <s aria-label={'Regular price ' + money(row.price.was)}>{money(row.price.was)}</s>}
          </td>
          {showStock && <td role="cell" className="catalog-stock"><span className="catalog-cell-label">Availability</span>
            <span className={'catalog-quantity ' + (!row.stock?.known ? 'muted' : row.stock.units ? 'catalog-quantity-available' : 'catalog-quantity-zero')}>
              {row.stockLink ? <Link prefetch={false} href={row.stockLink} aria-label={'View stock for ' + row.name + ': ' + row.stockLabel}>{row.stockLabel} <ArrowDownRight size={13} aria-hidden="true"/></Link> : row.stockLabel}
            </span>
            {row.stock?.locations.length ? <small title={row.stock.locations.join(', ')}>{row.stock.locations[0]}{row.stock.locations.length > 1 && ' +' + (row.stock.locations.length - 1)}</small> : null}
          </td>}
          <td role="cell" className="catalog-publication"><span className="catalog-cell-label">Publication</span>
            <span className={'badge ' + (row.status === 'Published' ? 'green' : 'catalog-neutral')}><span aria-hidden="true"/>{row.status}</span>
            <small>{row.channelNames.join(' · ') || 'No channels enabled'}</small>
          </td>
          <td role="cell" className="catalog-row-action">{row.details && <Link className="button secondary" href={row.details} prefetch={false}
            aria-label={'Open listing for ' + row.name}>Open <ArrowRight size={14} aria-hidden="true"/></Link>}</td>
        </tr>)}</tbody>
      </table> : <div className="catalog-empty">
        <span className="empty-icon"><PackageSearch size={23} aria-hidden="true"/></span>
        <h3>{f.page > 1 ? 'No products on this page' : active.length ? 'No matching products' : 'No products in this catalog yet'}</h3>
        <p>{f.page > 1 ? 'Return to the first page of results.' : active.length ? 'Try a different search or remove a filter.' : 'New listings will appear here when they are added.'}</p>
        {f.page > 1 ? <Link className="button secondary" href={href()}>Go to first page</Link>
          : !!active.length && <Link className="button secondary" href={reset}>Clear filters</Link>}
      </div>}
      {(entries.length > 0 || f.page > 1) && <nav className="catalog-pagination" aria-label="Product pages">
        <div className="catalog-page-sizes"><span>Per page</span>{catalogPageSizes.map(size => <Link key={size} href={href({ size: String(size) })}
          aria-label={size + ' products per page'} aria-current={size === f.size ? 'true' : undefined}>{size}</Link>)}</div>
        <div className="catalog-page-buttons">
          {f.page > 1 && <Link className="button secondary" href={href({ page: String(f.page - 1) })}><ArrowLeft size={15} aria-hidden="true"/> Previous</Link>}
          <span>Page {count(f.page)}{data.total ? ' of ' + count(Math.ceil(data.total / f.size)) : ''}</span>
          {hasNext && <Link className="button secondary" href={href({ page: String(f.page + 1) })}>Next <ArrowRight size={15} aria-hidden="true"/></Link>}
        </div>
      </nav>}
    </section>
  </div>;
}
