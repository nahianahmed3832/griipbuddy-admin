'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Download, Eye, Filter, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import type { basePricing, CatalogFilters, CategoryOption, Choice } from '@/lib/catalog-list';
import { downloadCsv } from '@/lib/csv';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { saveCatalog } from './catalog-edit-form';
import { ProductionCatalogActions } from './production-catalog-actions';
import { WorkspaceEmpty, WorkspaceHeading, WorkspaceStatus } from './workspace-screen';
import styles from './production-catalog.module.css';

export type ProductListing = {
  id: string;
  name: string;
  sku: string;
  thumbnail: string;
  categories: string[];
  price: ReturnType<typeof basePricing>;
  channels: string[];
  outlets?: string[];
  published: boolean;
};
const pageSizes = [20, 40, 60, 80, 100];
const categoryLabels = ['Category', 'Sub Category', 'Sub Sub Category', 'Third Sub Category'];
const categoryKeys = ['category', 'subcategory', 'subSubcategory', 'thirdSubcategory'];
const basePrice = new Intl.NumberFormat('en-BD', { maximumFractionDigits: 2 });

function routes(filters: CatalogFilters, region: Region, destination = '/dashboard/products') {
  const next = new URLSearchParams();
  if (region === 'INTERNATIONAL') next.set('region', region);
  if (filters.q) next.set('q', filters.q);
  if (filters.searchBy === 'text') next.set('searchBy', 'text');
  if (filters.filter) next.set('filter', filters.filter);
  if (filters.sort !== 'newest') next.set('sort', filters.sort);
  if (filters.stock) next.set('stock', filters.stock);
  filters.category.forEach((id, index) => { if (id) next.set(categoryKeys[index], id); });
  if (filters.location) next.set('location', filters.location);
  if (filters.page > 1) next.set('page', String(filters.page));
  if (filters.size !== 20) next.set('size', String(filters.size));
  return destination + (next.size ? '?' + next : '');
}

function Dropdown({ label, children, value, onChange, disabled }: {
  label: string; children: ReactNode; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  return <span className={styles.productSelect}>
    <select aria-label={label} value={value} onChange={event => onChange(event.currentTarget.value)} disabled={disabled}>{children}</select>
    <ChevronDown size={15} aria-hidden="true"/>
  </span>;
}

async function publishProduct(id: string, enabled: boolean, region: Region) {
  const response = await fetch(adminPath('/api/operations'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'product-publication', recordId: id, region, values: { enabled: String(enabled) } }),
  });
  if (!response.ok) throw new Error((await response.text()).slice(0, 320) || 'Could not change product status.');
}

export function ProductionProductList({ rows, filters, total, tree, locations, region, canCreate, canEdit, canDelete, canPublish, viewStock }: {
  rows: ProductListing[]; filters: CatalogFilters; total: number; tree: CategoryOption[]; locations: Choice[]; region: Region;
  canCreate: boolean; canEdit: boolean; canDelete: boolean; canPublish: boolean; viewStock: boolean;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef(filters);
  const [input, setInput] = useState(filters.q);
  const [filterOpen, setFilterOpen] = useState(Boolean(filters.location || filters.category.some(Boolean)
    || filters.filter || filters.sort !== 'newest' || filters.stock));
  const [loading, startNavigation] = useTransition();
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [archiveRows, setArchiveRows] = useState<ProductListing[]>([]);
  const [copyFrom, setCopyFrom] = useState<ProductListing>();
  const [newSku, setNewSku] = useState('');
  const removeDialog = useRef<HTMLDialogElement>(null);
  const copyDialog = useRef<HTMLDialogElement>(null);
  const removeLabel = useId();
  const copyLabel = useId();
  const filterId = useId();
  const busy = useRef(false);
  const market = region === 'INTERNATIONAL' ? 'International' : 'Bangladesh';
  current.current = filters;
  useEffect(() => {
    setInput(filters.q);
  }, [filters.q]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (archiveRows.length && !removeDialog.current?.open) removeDialog.current?.showModal();
  }, [archiveRows]);
  useEffect(() => {
    if (copyFrom && !copyDialog.current?.open) copyDialog.current?.showModal();
  }, [copyFrom]);

  function navigate(changes: Partial<CatalogFilters>) {
    clearTimeout(timer.current);
    startNavigation(() => router.replace(routes({ ...filters, q: input.trim(), page: 1, ...changes }, region), { scroll: false }));
  }

  function exportPage() {
    const header = ['Product ID', 'Product', 'Product SKU', 'Region', 'Category', 'Publication', 'Sales channels',
      'Min legacy base price (BDT)', 'Max legacy base price (BDT)'];
    const records = rows.map(row => [row.id, row.name, row.sku, market, row.categories.filter(Boolean).join(' / '),
      row.published ? 'Published' : 'Unpublished', row.channels.join(', '),
      row.price ? String(row.price.min) : '', row.price ? String(row.price.max) : '']);
    downloadCsv(`recovered-products-${region === 'BD' ? 'bd' : 'international'}-page-${filters.page}.csv`, [header, ...records]);
  }

  let options = tree;
  const levels = categoryLabels.map((label, index) => {
    const available = options;
    const active = filters.category[index] ?? '';
    options = available.find(item => item.id === active)?.children ?? [];
    return <label key={label} className={styles.field}>{label}
      <Dropdown label={label} value={active} disabled={index > 0 && !filters.category[index - 1]} onChange={id =>
        navigate({ category: [...filters.category.slice(0, index), id] })}>
        <option value="">All</option>
        {active && !available.some(row => row.id === active) && <option value={active}>Unavailable selection</option>}
        {available.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </Dropdown>
    </label>;
  });
  const selectedRows = rows.filter(row => selected.includes(row.id));
  function confirmArchive(products: ProductListing[]) {
    setError('');
    setArchiveRows(products);
  }
  async function archive() {
    if (busy.current || !archiveRows.length) return;
    busy.current = true;
    setError('');
    setSaving('archive');
    try {
      await saveCatalog({ kind: 'products', region, action: 'archive-many', values: { ids: archiveRows.map(row => row.id) } });
      window.dispatchEvent(new CustomEvent('griip-admin-saved', { detail: `Archived ${archiveRows.length} ${archiveRows.length === 1 ? 'product' : 'products'}.` }));
      setSelected([]);
      removeDialog.current?.close();
      router.refresh();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'The products could not be archived.');
    } finally {
      busy.current = false;
      setSaving('');
    }
  }
  async function duplicate() {
    if (busy.current || !copyFrom) return;
    busy.current = true;
    setError('');
    setSaving('copy');
    try {
      const id = await saveCatalog({ kind: 'products', region, action: 'duplicate', id: copyFrom.id, values: { sku: newSku } });
      copyDialog.current?.close();
      router.push(routes(filters, region, '/dashboard/update-product/' + encodeURIComponent(id)));
      window.dispatchEvent(new CustomEvent('griip-admin-saved', { detail: 'Draft copy created.' }));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'The draft copy could not be created.');
    } finally {
      busy.current = false;
      setSaving('');
    }
  }
  async function changePublication(row: ProductListing) {
    if (busy.current) return;
    busy.current = true;
    setError('');
    setSaving(row.id);
    try {
      await publishProduct(row.id, !row.published, region);
      const message = row.published ? 'Product unpublished successfully!' : 'Product published successfully!';
      window.dispatchEvent(new CustomEvent('griip-admin-saved', { detail: message }));
      router.refresh();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'The product change could not be saved.');
    } finally {
      busy.current = false;
      setSaving('');
    }
  }
  return <section className={`${styles.page} ${styles.productPage}`}>
    <WorkspaceHeading title={`All Products (${total})`} detail={`${market} catalog · Legacy variant base prices in BDT`}>
      {rows.length > 0 && <button type="button" className={styles.outline} onClick={exportPage}
        disabled={loading || Boolean(saving) || input.trim() !== filters.q}>
        <Download size={16} aria-hidden="true"/> Export listing page
      </button>}
      {canCreate && <Link className={styles.primary} href={routes(filters, region, '/dashboard/create-product')}>Create Product</Link>}
      {canDelete && selectedRows.length > 0 && <button type="button" className={styles.outline}
        disabled={Boolean(saving) || loading || selectedRows.length > 40}
        onClick={() => confirmArchive(selectedRows)}>Archive selected ({selectedRows.length})</button>}
    </WorkspaceHeading>
    <div className={styles.productPanel}>
      <div className={styles.productToolbar}>
        <label className={styles.field}>{filters.searchBy === 'sku' ? 'SKU' : 'Product search'}
          <input type="search" placeholder={filters.searchBy === 'sku' ? 'Search by sku' : 'Search by product name'} value={input} maxLength={80} onChange={event => {
            const text = event.target.value;
            setInput(text);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => startNavigation(() => router.replace(
              routes({ ...current.current, page: 1, q: text.trim() }, region), { scroll: false },
            )), 500);
          }}/>
        </label>
        <button type="button" className={styles.filterBar} aria-expanded={filterOpen} aria-controls={filterId} onClick={() => setFilterOpen(current => !current)}>
          <Filter size={16} aria-hidden="true"/> Filters
        </button>
      </div>
      <div className={styles.productFilters} id={filterId} hidden={!filterOpen}>
        <label className={styles.field}>Search mode
          <Dropdown label="Search mode" value={filters.searchBy} onChange={value => navigate({ searchBy: value })}>
            <option value="sku">SKU</option><option value="text">Product name</option>
          </Dropdown>
        </label>
        <label className={styles.field}>Publication
          <Dropdown label="Publication" value={filters.filter} onChange={filter => navigate({ filter })}>
            <option value="">All</option><option value="true">Published</option><option value="false">Unpublished</option>
          </Dropdown>
        </label>
        <label className={styles.field}>Sort products
          <Dropdown label="Sort products" value={filters.sort} onChange={sort => navigate({ sort: sort as CatalogFilters['sort'] })}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option><option value="nameDesc">Name Z–A</option>
          </Dropdown>
        </label>
        {levels}
        {viewStock && <label className={styles.field}>Business Location
          <Dropdown value={filters.location} label="Business Location" onChange={location => navigate({ location })}>
            <option value="">All</option>{locations.map(row => <option value={row.value} key={row.value}>{row.label}</option>)}
          </Dropdown>
        </label>}
      </div>
    </div>
    {error && !archiveRows.length && !copyFrom && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.productPanel} aria-busy={loading}>
      {loading && <p className={styles.resultStatus} role="status">Updating products…</p>}
      {rows.length ? <>
      <div className={styles.productScroll} role="region" aria-label="Product table" tabIndex={0}>
        <table className={styles.productTable} role="table">
          <thead role="rowgroup"><tr role="row">
            {canDelete && <th scope="col" role="columnheader">Select</th>}
            {['Product', 'Base price (BDT)', 'Publication', 'Category', 'Sales channels', ...(viewStock ? ['Stocked outlets'] : []), 'Actions'].map(column =>
              <th scope="col" role="columnheader" key={column}>{column}</th>)}
          </tr></thead>
          <tbody role="rowgroup">{rows.map(row => <tr key={row.id} role="row">
            {canDelete && <td role="cell" data-field="Select"><input type="checkbox" aria-label={'Select ' + row.name}
              checked={selected.includes(row.id)} disabled={Boolean(saving) || !selected.includes(row.id) && selectedRows.length >= 40}
              onChange={event => {
                const checked = event.currentTarget.checked;
                setSelected(current => checked
                  ? [...current.filter(id => rows.some(product => product.id === id)), row.id] : current.filter(id => id !== row.id));
              }}/></td>}
            <td role="cell"><div className={styles.productIdentity}>
              <Image unoptimized src={row.thumbnail || adminPath('/production-admin/no-image-available.jpg')} alt="" width={54} height={54}/>
              <div><Link className={styles.productTitle} href={routes(filters, region, '/dashboard/product-details/' + row.id)}>{row.name}</Link>
                <small>{row.sku || 'No SKU'}</small></div>
            </div></td>
            <td role="cell" data-field="Base price">{row.price ? <>
              {row.price.was !== undefined && <s aria-label={`Regular price ${basePrice.format(row.price.was)} BDT`}>{basePrice.format(row.price.was)}</s>}
              <strong className={styles.productCurrency}>{basePrice.format(row.price.min)}
                {row.price.max !== row.price.min && ` – ${basePrice.format(row.price.max)}`} BDT</strong></> : 'Unavailable'}</td>
            <td role="cell" data-field="Publication"><div className={styles.publication}>
              <WorkspaceStatus tone={row.published ? 'success' : 'neutral'}>{row.published ? 'Published' : 'Unpublished'}</WorkspaceStatus>
              {canPublish && <button type="button" disabled={Boolean(saving)} onClick={() => void changePublication(row)}>
                {row.published ? 'Make it Unpublish' : 'Make it Publish'}
                {saving === row.id && <LoaderCircle className={styles.spinner} size={12} aria-hidden="true"/>}
              </button>}
            </div></td>
            <td role="cell" data-field="Category" className={styles.productCategories}>{row.categories.filter(Boolean).join(' / ') || 'Uncategorized'}</td>
            <td role="cell" data-field="Sales channels" className={styles.channels}>{row.channels.join(', ') || '—'}</td>
            {viewStock && <td role="cell" data-field="Stocked outlets" className={styles.productLocations}>
              {row.outlets?.join(', ') || (row.outlets ? 'No stocked outlets' : 'Unavailable')}</td>}
            <td role="cell"><div className={styles.productActions}>
              <Link aria-label={'Product details: ' + row.name} className={styles.iconOutline}
                href={routes(filters, region, '/dashboard/product-details/' + row.id)}><Eye size={16} aria-hidden="true"/></Link>
               {(canEdit || canDelete || canCreate) && <ProductionCatalogActions label={'Product actions: ' + row.name} outlined>
                {close => <>{canEdit && <Link href={routes(filters, region, '/dashboard/update-product/' + row.id)} onClick={close}>Update Product</Link>}
                  {canCreate && <button type="button" onClick={() => {
                    close();
                    setError('');
                    setNewSku(row.sku.replace(/[^\p{L}\p{N}._/-]/gu, '-').slice(0, 75) + '-COPY');
                    setCopyFrom(row);
                  }}>Duplicate as draft</button>}
                  {canDelete && <button type="button" onClick={() => { close(); confirmArchive([row]); }}>Archive product</button>}</>}
              </ProductionCatalogActions>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div></> : <WorkspaceEmpty title="No products found" detail="Try another SKU or adjust the catalog filters."/>}
    </div>
    <div className={`${styles.productPanel} ${styles.productPagination}`} aria-label="Product pages">
      <Dropdown label="Products per page" value={String(filters.size)} onChange={value => navigate({ size: Number(value) })}>
        {pageSizes.map(size => <option key={size} value={size}>{size}</option>)}
      </Dropdown>
      <span>{total ? Math.min(total, (filters.page - 1) * filters.size + 1) : 0} - {Math.min(total, filters.page * filters.size)} of {total}</span>
      <div>
        <button className={styles.primary} type="button" disabled={filters.page === 1} onClick={() => navigate({ page: filters.page - 1 })}>Previous</button>
        <button className={styles.primary} type="button" disabled={filters.page * filters.size >= total} onClick={() => navigate({ page: filters.page + 1 })}>Next</button>
      </div>
    </div>
    <dialog className={styles.deleteDialog} ref={removeDialog} aria-labelledby={removeLabel}
      onCancel={event => { if (busy.current) event.preventDefault(); }} onClose={() => setArchiveRows([])}>
      <h2 id={removeLabel}>{archiveRows.length === 1 ? 'Archive product' : 'Archive products'}</h2>
      <p>{archiveRows.length === 1 ? archiveRows[0]?.name : `${archiveRows.length} selected products`} · {market}</p>
      <p>Archived products leave the active catalog. Product and variant IDs are preserved. The whole selection stays untouched if any product has protected inventory or supplier links.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div><button type="button" className={styles.outline} disabled={Boolean(saving)} onClick={() => removeDialog.current?.close()}>Cancel</button>
        <button type="button" className={styles.deleteAction} disabled={Boolean(saving)} onClick={() => void archive()}>Archive</button></div>
    </dialog>
    <dialog className={styles.deleteDialog} ref={copyDialog} aria-labelledby={copyLabel}
      onCancel={event => { if (busy.current) event.preventDefault(); }} onClose={() => setCopyFrom(undefined)}>
      <h2 id={copyLabel}>Duplicate as draft</h2>
      <p>{copyFrom?.name} · {market}. The copy gets new variant IDs and SKUs. Add approved media before publication. Stock starts empty.</p>
      <form onSubmit={event => { event.preventDefault(); void duplicate(); }}>
        <label className={styles.field}>New product SKU<input value={newSku} required maxLength={80} onChange={event => setNewSku(event.target.value)}/></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="button" disabled={Boolean(saving)} className={styles.outline} onClick={() => copyDialog.current?.close()}>Cancel</button>
        <button type="submit" disabled={Boolean(saving)} className={styles.primary}>Create draft copy</button>
      </form>
    </dialog>
  </section>;
}
