'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Eye, Filter, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { CatalogFilters, CategoryOption, Choice } from '@/lib/catalog-list';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { saveCatalog } from './catalog-edit-form';
import { ProductionCatalogActions } from './production-catalog-actions';
import styles from './production-catalog.module.css';

export type ProductListing = {
  id: string;
  name: string;
  sku: string;
  thumbnail: string;
  categories: string[];
  regular: number | null;
  sale: number | null;
  channels: string[];
  outlets: string[];
  published: boolean;
};
const pageSizes = [20, 40, 60, 80, 100];
const categoryLabels = ['Category', 'Sub Category', 'Sub Sub Category', 'Third Sub Category'];
const categoryKeys = ['category', 'subcategory', 'subSubcategory', 'thirdSubcategory'];
const columns = ['SL NO:', 'Image', 'Name', 'Category', 'SKU', 'Price', 'Sale Channels', 'Available in Outlets', 'Active Status', 'Actions'];

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
  const [filterOpen, setFilterOpen] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [removeRecord, setRemoveRecord] = useState<ProductListing>();
  const removeDialog = useRef<HTMLDialogElement>(null);
  const removeLabel = useId();
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
    router.replace(routes({ ...filters, q: input.trim(), page: 1, ...changes }, region), { scroll: false });
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
  return <section className={styles.page}>
    <header className={styles.header}><h1>All Products ({total})</h1>
      {canCreate && <Link className={styles.primary} href={routes(filters, region, '/dashboard/create-product')}>Create Product</Link>}
    </header>
    <div className={styles.productPanel}>
      <button type="button" className={styles.filterBar} aria-expanded={filterOpen} onClick={() => setFilterOpen(current => !current)}>
        <Filter size={20} aria-hidden="true"/> Filter
      </button>
      {filterOpen && <div className={styles.productFilters}>
        <label className={styles.field}>SKU
          <input placeholder="Search by sku" value={input} maxLength={80} onChange={event => {
            const text = event.target.value;
            setInput(text);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => router.replace(routes({ ...current.current, page: 1, q: text.trim() }, region), { scroll: false }), 500);
          }}/>
        </label>
        {levels}
        <label className={styles.field}>Business Location
          <Dropdown value={filters.location} label="Business Location" disabled={!viewStock} onChange={location => navigate({ location })}>
            <option value="">All</option>{locations.map(row => <option value={row.value} key={row.value}>{row.label}</option>)}
          </Dropdown>
        </label>
      </div>}
    </div>
    {error && !removeRecord && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.productPanel}>
      <div className={styles.productScroll} role="region" aria-label="Product table" tabIndex={0}>
        <table className={styles.productTable}>
          <thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.id}>
            <td>{String(index + 1).padStart(2, '0')}</td>
            <td><Image unoptimized src={row.thumbnail || adminPath('/production-admin/no-image-available.jpg')}
              alt={row.name} width={72} height={72}/></td>
            <td><span className={styles.productTitle}>{row.name}</span></td>
            <td className={styles.productCategories}>{['Category', 'Subcategory', 'Sub-subcategory', 'Third Subcategory'].map((label,i) =>
              (i < 2 || row.categories[i]) && <p key={label}>{label}: <span>{row.categories[i]}</span></p>)}</td>
            <td>{row.sku}</td>
            <td>{row.regular === null && row.sale === null ? 'N/A' : <>{row.regular !== null && <s>৳{row.regular}</s>}
              {' '}<span className={styles.productCurrency}>৳{row.sale ?? row.regular}</span></>}</td>
            <td className={styles.channels}>{row.channels.join(', ')}</td>
            <td className={styles.productLocations}>{viewStock && (row.outlets.length ? row.outlets.join(',') + ',' :
              <span className={styles.noStock}>No Stocks Found</span>)}</td>
            <td><div className={styles.publication}>
              <span className={styles.publicationBadge} data-published={row.published}>{row.published ? 'Published' : 'Unpublished'}</span>
              {canPublish && <button type="button" disabled={saving === row.id} onClick={() => void change(row, 'publish')}>
                {row.published ? 'Make it Unpublish' : 'Make it Publish'}
                {saving === row.id && <LoaderCircle className={styles.spinner} size={12}/>}
              </button>}
            </div></td>
            <td><div className={styles.productActions}>
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
        {!rows.length && <p className={styles.productEmpty}>No data found!</p>}
      </div>
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
