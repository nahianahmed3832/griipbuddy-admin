'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Eye, Filter, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import type { basePricing, CatalogFilters, CategoryOption, Choice } from '@/lib/catalog-list';
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
  const [filterOpen, setFilterOpen] = useState(Boolean(filters.location || filters.category.some(Boolean)));
  const [loading, startNavigation] = useTransition();
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [removeRecord, setRemoveRecord] = useState<ProductListing>();
  const removeDialog = useRef<HTMLDialogElement>(null);
  const removeLabel = useId();
  const filterId = useId();
  const busy = useRef(false);
  current.current = filters;
  useEffect(() => {
    setInput(filters.q);
  }, [filters.q]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (removeRecord && !removeDialog.current?.open) removeDialog.current?.showModal();
  }, [removeRecord]);

  function navigate(changes: Partial<CatalogFilters>) {
    clearTimeout(timer.current);
    startNavigation(() => router.replace(routes({ ...filters, q: input.trim(), page: 1, ...changes }, region), { scroll: false }));
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
  async function change(row: ProductListing, action: 'delete' | 'publish') {
    if (busy.current) return;
    busy.current = true;
    setError('');
    setSaving(row.id);
    try {
      if (action === 'delete') await saveCatalog({ kind: 'products', region, action: 'delete', id: row.id, values: {} });
      else await publishProduct(row.id, !row.published, region);
      const message = action === 'delete' ? 'Product deleted successfully!' :
        (row.published ? 'Product unpublished successfully!' : 'Product published successfully!');
      window.dispatchEvent(new CustomEvent('griip-admin-saved', { detail: message }));
      setRemoveRecord(undefined);
      removeDialog.current?.close();
      router.refresh();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'The product change could not be saved.');
    } finally {
      busy.current = false;
      setSaving('');
    }
  }
  return <section className={`${styles.page} ${styles.productPage}`}>
    <WorkspaceHeading title={`All Products (${total})`} detail={`${region === 'INTERNATIONAL' ? 'International' : 'Bangladesh'} catalog · Legacy variant base prices in BDT`}>
      {canCreate && <Link className={styles.primary} href={routes(filters, region, '/dashboard/create-product')}>Create Product</Link>}
    </WorkspaceHeading>
    <div className={styles.productPanel}>
      <div className={styles.productToolbar}>
        <label className={styles.field}>SKU
          <input type="search" placeholder="Search by sku" value={input} maxLength={80} onChange={event => {
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
        {levels}
        {viewStock && <label className={styles.field}>Business Location
          <Dropdown value={filters.location} label="Business Location" onChange={location => navigate({ location })}>
            <option value="">All</option>{locations.map(row => <option value={row.value} key={row.value}>{row.label}</option>)}
          </Dropdown>
        </label>}
      </div>
    </div>
    {error && !removeRecord && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.productPanel} aria-busy={loading}>
      {loading && <p className={styles.resultStatus} role="status">Updating products…</p>}
      {rows.length ? <>
      <div className={styles.productScroll} role="region" aria-label="Product table" tabIndex={0}>
        <table className={styles.productTable} role="table">
          <thead role="rowgroup"><tr role="row">
            {['Product', 'Base price (BDT)', 'Publication', 'Category', 'Sales channels', ...(viewStock ? ['Stocked outlets'] : []), 'Actions'].map(column =>
              <th scope="col" role="columnheader" key={column}>{column}</th>)}
          </tr></thead>
          <tbody role="rowgroup">{rows.map(row => <tr key={row.id} role="row">
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
              {canPublish && <button type="button" disabled={saving === row.id} onClick={() => void change(row, 'publish')}>
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
               {(canEdit || canDelete) && <ProductionCatalogActions label={'Product actions: ' + row.name} outlined>
                {close => <>{canEdit && <Link href={routes(filters, region, '/dashboard/update-product/' + row.id)} onClick={close}>Update Product</Link>}
                  {canDelete && <button type="button" onClick={() => {
                    close();
                    setError('');
                    setRemoveRecord(row);
                  }}>Delete Product</button>}</>}
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
      onCancel={event => { if (busy.current) event.preventDefault(); }} onClose={() => setRemoveRecord(undefined)}>
      <h2 id={removeLabel}>Delete Product</h2>
      <p>Are you sure you want to delete {removeRecord?.name}?</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div><button type="button" className={styles.outline} disabled={Boolean(saving)} onClick={() => removeDialog.current?.close()}>Cancel</button>
        <button type="button" className={styles.deleteAction} disabled={Boolean(saving)} onClick={() => {
          if (removeRecord) void change(removeRecord, 'delete');
        }}>Delete Product</button></div>
    </dialog>
  </section>;
}
