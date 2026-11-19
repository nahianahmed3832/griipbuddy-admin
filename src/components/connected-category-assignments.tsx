'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useSyncExternalStore } from 'react';
import { CatalogRequestError, catalogRequest } from '@/lib/connected-catalog-client';
import { taxonomyHref, type CatalogCategory, type CategoryAssignments } from '@/lib/connected-category-data';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { useTaxonomyDirty } from './connected-catalog-product/taxonomy-controls';
import { Feedback } from './connected-category-controls';
import css from './connected-categories.module.css';
import catalog from './production-catalog.module.css';

type Product = CategoryAssignments['products'][number];
type Scope = 'direct' | 'descendants' | 'all' | 'search';
type Choice = { id: string; label: string };

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

function placementChoices(categories: CatalogCategory[]) {
  const byId = new Map(categories.map(category => [category.id, category]));
  return categories.flatMap(leaf => {
    const branch = leaf.parentId && byId.get(leaf.parentId);
    const root = branch && branch.parentId && byId.get(branch.parentId);
    return leaf.kind === 'SUBCATEGORY' && leaf.state === 'ACTIVE' && branch && branch.kind === 'CATEGORY' &&
      branch.state === 'ACTIVE' && root && root.kind === 'DEPARTMENT' && root.state === 'ACTIVE' && !root.parentId
      ? [{ id: leaf.id, label: [root.name, branch.name, leaf.name].join(' / ') }] : [];
  }).sort((a, b) => a.label.localeCompare(b.label));
}

function savePlacement(region: Region, row: Product, primaryCategoryId: string, secondaryCategoryIds: string[]) {
  return catalogRequest({ action: 'product.assignments', input: {
    productId: row.id, revision: row.revision, primaryCategoryId, secondaryCategoryIds,
  } }, region);
}

function PlacementEditor({ row, choices, region, onSaved, onCancel }: {
  row: Product; choices: Choice[]; region: Region; onSaved: () => void; onCancel: () => void;
}) {
  const markDirty = useTaxonomyDirty();
  const [primary, setPrimary] = useState(row.primaryCategoryId);
  const [additional, setAdditional] = useState(row.secondaryCategoryIds);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const isDirty = primary !== row.primaryCategoryId || additional.length !== row.secondaryCategoryIds.length ||
    additional.some(id => !row.secondaryCategoryIds.includes(id));
  const available = new Set(choices.map(choice => choice.id));
  const visible = choices.filter(choice => choice.id !== primary &&
    (additional.includes(choice.id) || choice.label.toLowerCase().includes(search.trim().toLowerCase())));
  const unavailable = additional.filter(id => !available.has(id));
  return <form className={css.item + ' ' + css.form} aria-label={'Edit assignments for ' + row.name}
    onSubmit={async event => {
      event.preventDefault();
      if (pending || !isDirty) return;
      setPending(true);
      setError('');
      try {
        await savePlacement(region, row, primary, additional);
        markDirty(false);
        onSaved();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The assignment could not be saved.');
      } finally { setPending(false); }
    }}>
    <h3>{row.name} placements</h3>
    <label>Primary category<select value={primary} disabled={pending} onChange={event => {
      const next = event.target.value;
      setPrimary(next);
      setAdditional(values => values.filter(id => id !== next));
      markDirty(true);
    }}>
      {!available.has(row.primaryCategoryId) && <option value={row.primaryCategoryId}>Current placement · {row.primaryCategoryId}</option>}
      {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
    </select></label>
    <fieldset disabled={pending} className={css.form}>
      <legend>Additional categories</legend>
      <label>Filter additional categories<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className={css.choiceList}>
        {visible.map(choice => <label className={css.check} key={choice.id}>
          <input type="checkbox" checked={additional.includes(choice.id)} onChange={event => {
            const chosen = event.target.checked;
            setAdditional(values => chosen ? [...values, choice.id] : values.filter(id => id !== choice.id));
            markDirty(true);
          }} />{choice.label}
        </label>)}
        {unavailable.map(id => <label className={css.check} key={id}>
          <input type="checkbox" checked onChange={() => {
            setAdditional(values => values.filter(value => value !== id));
            markDirty(true);
          }} />Unavailable placement · {id}
        </label>)}
        {!visible.length && !unavailable.length && <p>No matching categories.</p>}
      </div>
    </fieldset>
    {error && <p role="alert" className={css.error}>{error}</p>}
    <div className={css.actions}>
      <button className={catalog.primary} disabled={pending || !isDirty}>{pending ? 'Saving assignments…' : 'Save assignments'}</button>
      <button className={catalog.outline} type="button" disabled={pending} onClick={() => {
        if (!isDirty || window.confirm('Discard unsaved assignment changes?')) onCancel();
      }}>Cancel</button>
    </div>
  </form>;
}

export function ConnectedCategoryAssignments({ data, current, categories, query, region, scope, canEdit }: {
  data: CategoryAssignments; current: CatalogCategory; categories: CatalogCategory[]; query?: string;
  region: Region; scope: Scope; canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Product>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [failures, setFailures] = useState<string[]>([]);
  const saving = useRef(false);
  const ready = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const choices = placementChoices(categories);
  const canAdd = canEdit && choices.some(choice => choice.id === current.id);
  const eligible = canAdd ? data.products.filter(row => row.primaryCategoryId !== current.id && !row.secondaryCategoryIds.includes(current.id)) : [];
  const selectedRows = eligible.filter(row => selected.includes(row.id));
  const selectAll = selectedRows.length > 0 && selectedRows.length === eligible.length;

  async function addSelected() {
    if (saving.current || !selectedRows.length) return;
    saving.current = true;
    setPending(true);
    setNotice('');
    setFailures([]);
    const failed: string[] = [];
    const errors: string[] = [];
    try {
      for (const [index, row] of selectedRows.entries()) {
        try {
          await savePlacement(region, row, row.primaryCategoryId, [...row.secondaryCategoryIds, current.id]);
        } catch (error) {
          failed.push(row.id);
          errors.push(row.name + ' · ' + (error instanceof Error ? error.message : 'The assignment could not be saved.'));
          if (!(error instanceof CatalogRequestError) || [401, 403, 429].includes(error.status) || error.status >= 500) {
            failed.push(...selectedRows.slice(index + 1).map(item => item.id));
            if (index + 1 < selectedRows.length) errors.push('Remaining assignments were paused. Review the refreshed selections before retrying.');
            break;
          }
        }
      }
      setSelected(failed);
      setFailures(errors);
      setNotice('Added ' + (selectedRows.length - failed.length) + ' of ' + selectedRows.length + ' selected products as additional placements.');
      router.refresh();
    } finally { saving.current = false; setPending(false); }
  }

  return <section className={css.panel} aria-label="Product assignments"><h2>Product assignments</h2>
    <form action={adminPath('/dashboard/categories')} className={css.search}>
      <input type="hidden" name="record" value={current.id}/>{region === 'INTERNATIONAL' && <input type="hidden" name="region" value={region}/>}
      <label>Placement<select name="scope" defaultValue={scope} disabled={pending}><option value="all">Category and descendants</option>
        <option value="direct">Direct</option><option value="descendants">Descendants</option><option value="search">All products</option></select></label>
      <label>Product or SKU<input type="search" name="q" defaultValue={query} maxLength={120}/></label>
      <button className={catalog.outline} disabled={pending}>Search</button>
    </form>
    {canAdd && <div className={css.actions}>
      <button type="button" className={catalog.outline} disabled={!selectedRows.length || pending || Boolean(editing)}
        onClick={() => void addSelected()}>{pending ? 'Saving selected assignments…' : 'Add selected as additional'}</button>
      <small>{selectedRows.length} selected on this page</small>
    </div>}
    {notice && <Feedback value={{ error: false, text: notice }}/>}
    {failures.length > 0 && <ul role="alert" className={css.error}>{failures.map(detail => <li key={detail}>{detail}</li>)}</ul>}
    <div className={css.scroll}><table className={catalog.table}><thead><tr>
      {canAdd && <th scope="col"><input aria-label="Select eligible products on this page" type="checkbox" checked={selectAll}
        disabled={!ready || !eligible.length || pending || Boolean(editing)} onChange={event => setSelected(event.target.checked ? eligible.map(row => row.id) : [])}/></th>}
      <th scope="col">Product</th><th scope="col">Placement</th>{canEdit && <th scope="col">Action</th>}
    </tr></thead><tbody>{data.products.map(row => <tr key={row.id}>
      {canAdd && <td><input aria-label={'Select ' + row.name} type="checkbox" checked={selected.includes(row.id)}
        disabled={!ready || pending || Boolean(editing) || !eligible.some(item => item.id === row.id)} onChange={event => {
          const chosen = event.target.checked;
          setSelected(values => chosen ? [...values, row.id] : values.filter(id => id !== row.id));
        }}/></td>}
      <th scope="row"><Link href={'/dashboard/product-details/' + encodeURIComponent(row.id) +
        (region === 'INTERNATIONAL' ? '?region=INTERNATIONAL' : '')}>{row.name}</Link></th>
      <td>{row.primaryCategoryId === current.id ? 'Primary' : row.secondaryCategoryIds.includes(current.id) ? 'Additional' :
        row.placement === 'descendant' ? 'Descendant' : 'Unassigned'}</td>
      {canEdit && <td><button className={catalog.outline + ' ' + css.compact} type="button" aria-label={'Edit assignments for ' + row.name}
        disabled={!ready || pending || Boolean(editing)} onClick={() => setEditing(row)}>Edit</button></td>}
    </tr>)}
      {!data.products.length && <tr><td colSpan={2 + Number(canAdd) + Number(canEdit)} className={catalog.empty}>No matching products.</td></tr>}
    </tbody></table></div>
    <div className={css.actions}><small>{data.total} products</small>{[data.page - 1, data.page + 1].filter(page => page >= 1 && page <= data.pages)
      .map(page => <Link className={catalog.outline} key={page} href={taxonomyHref(region, { record: current.id, q: query, scope, page: String(page) })}>
        {page < data.page ? 'Previous' : 'Next'}</Link>)}</div>
    {editing && <PlacementEditor row={editing} choices={choices} region={region} onCancel={() => setEditing(undefined)}
      onSaved={() => {
        setNotice('Saved category assignments for ' + editing.name + '.');
        setFailures([]);
        setEditing(undefined);
        router.refresh();
      }}/>}
  </section>;
}
