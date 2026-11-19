'use client';

import Link from 'next/link';
import { useState } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import { taxonomyHref, type CategoryPermission, type CollectionKind, type Collections, type MenuItem, type MenuPage, type Navigation } from '@/lib/connected-category-data';
import { adminPath } from '@/lib/paths';
import type { Region } from '@/lib/sections';
import { Feedback, ImageFields, imageInput, moveInList, OrderButtons, readField, TextInput, useTaxonomyCommand } from './connected-category-controls';
import css from './connected-categories.module.css';
import catalog from './production-catalog.module.css';

const menuId = (item: MenuItem) => item.type === 'category' ? item.categoryId : item.type === 'collection' ? item.collectionId : item.page;
const menuItem = (type: MenuItem['type'], id: string, { label, visible }: Pick<MenuItem, 'label' | 'visible'>): MenuItem =>
  type === 'category' ? { label, visible, type, categoryId: id } :
    type === 'collection' ? { label, visible, type, collectionId: id } : { label, visible, type, page: id as MenuPage };

export function ConnectedMenus({ navigation, region, canEdit, collections }: {
  navigation: Navigation; region: Region; canEdit: boolean; collections: Collections['collections'];
}) {
  const { marketId, marketName, key, locale, existingKeys, revision, inheritsMenu } = navigation;
  const [rows, setRows] = useState(() => navigation.items.map((item, id) => ({ item, id })));
  const [nextRow, setNextRow] = useState(navigation.items.length);
  const command = useTaxonomyCommand(region);
  const editDisabled = !canEdit || command.pending;
  const collectionTargets = new Map(navigation.collections.map(target => [target.id, target]));
  const targets = {
    category: navigation.categories,
    collection: collections.map(row => collectionTargets.get(row.id) ?? { id: row.id, label: row.name, visible: false, href: '' }),
    page: navigation.pages.map(({ page, ...target }) => ({ id: page, ...target })),
  };
  const preview = rows.flatMap(({ id, item }) => {
    const target = targets[item.type].find(choice => choice.id === menuId(item));
    return item.visible && target?.visible ? [{ id, label: item.label?.trim() || target.label, href: target.href }] : [];
  });
  function amend(index: number, item: MenuItem) {
    command.changed(true);
    setRows(values => values.map((value, position) => position === index ? { ...value, item } : value));
  }
  return <div className={css.grid}>
    <section className={css.panel}><h2>{marketName} menus</h2><p>Menus link to categories, collections or storefront pages.</p>
      <form action={adminPath('/dashboard/categories')} className={css.form}>
        <input type="hidden" name="view" value="menus"/>{region === 'INTERNATIONAL' && <input type="hidden" name="region" value={region}/>}
        <label>Menu key<input name="menuKey" list="connected-menu-keys" defaultValue={key} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" required/></label>
        <datalist id="connected-menu-keys">{existingKeys.map(value => <option key={value} value={value}/>)}</datalist>
        <label>Language<select name="menuLocale" defaultValue={locale}><option value="">Default for market</option>
          {navigation.languages.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
        <div><button className={catalog.outline}>Open menu</button></div>
      </form>
      {inheritsMenu && <p>This language inherits the market menu. Saving creates an override.</p>}
      <nav aria-label="Menu preview">
        <h3>Menu preview</h3>
        <p>{navigation.previewLocale}</p>
        {preview.length > 0
          ? <ol className={css.preview}>{preview.map(row => <li key={row.id}>{row.label}<br/><small>{row.href}</small></li>)}</ol>
          : <p>No links are visible in this menu.</p>}
      </nav>
    </section>
    <section className={css.panel}><h2>Menu links</h2>
      {!rows.length && <p>No items configured.</p>}
      {rows.map(({ item, id }, index) => {
        const chosen = menuId(item);
        const choices = targets[item.type];
        const target = choices.find(choice => choice.id === chosen);
        return <div className={css.item} key={id}><h3>{item.label || choices.find(target => target.id === chosen)?.label || 'Menu item'}</h3>
          <div className={css.form}><div className={css.fields}>
            <label>Target type<select value={item.type} disabled={editDisabled} onChange={event => {
              const type = event.target.value as MenuItem['type'];
              amend(index, menuItem(type, targets[type][0]?.id ?? '', item));
            }}><option value="category">Category</option><option value="collection">Collection</option><option value="page">Storefront page</option></select></label>
            <label>Destination<select value={chosen} disabled={editDisabled} onChange={event => amend(index, menuItem(item.type, event.target.value, item))}>
              {(!chosen || !choices.some(target => target.id === chosen)) && <option value={chosen}>{chosen || 'Select destination'}</option>}
              {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}{choice.visible ? '' : ' (hidden in this market)'}</option>)}</select></label>
            <label>Custom label<input value={item.label ?? ''} maxLength={80} disabled={editDisabled}
              onChange={event => amend(index, { ...item, label: event.target.value || null })}/></label>
            <label className={css.check}><input type="checkbox" checked={item.visible} disabled={editDisabled}
              onChange={event => amend(index, { ...item, visible: event.target.checked })}/>Visible</label>
          </div></div>
          {item.visible && !target?.visible && <small>Hidden by this target’s market settings.</small>}
          {canEdit && <div className={css.actions}><OrderButtons index={index} length={rows.length} disabled={command.pending}
            label={item.label || 'item ' + (index + 1)} move={delta => {
              command.changed(true);
              setRows(values => moveInList(values, index, delta));
            }}/>
            <button type="button" className={catalog.outline + ' ' + css.compact} disabled={command.pending}
              onClick={() => {
                command.changed(true);
                setRows(values => values.filter(value => value.id !== id));
              }}>Remove</button></div>}
        </div>;
      })}
      {canEdit && <div className={css.actions}>
        <button type="button" className={catalog.outline} disabled={command.pending || rows.length >= 100} onClick={() => {
          command.changed(true);
          setRows(values => [...values, { id: nextRow, item: { type: 'page', page: 'HOME', label: null, visible: true } }]);
          setNextRow(value => value + 1);
        }}>Add item</button>
        <button type="button" className={catalog.primary} disabled={command.pending || rows.some(({ item }) => !menuId(item))}
          onClick={() => void command.send({ action: 'menu.save', input: { marketId, key, locale, expectedRevision: revision,
            items: rows.map(({ item }) => ({ ...item, label: item.label?.trim() || null })) } }, 'Menu saved.')}>Save menu</button>
      </div>}
      <Feedback value={command.feedback}/>
    </section>
  </div>;
}

const collectionLabels = { CURATED: 'Manual', NEW: 'New arrivals', FEATURED: 'Featured products' } satisfies Record<CollectionKind, string>;

export function ConnectedCollections({ data, region, permissions, canUpload }: {
  data: Collections; region: Region; permissions: CategoryPermission; canUpload: boolean;
}) {
  const current = data.current;
  const canCreate = !current && permissions.update;
  const command = useTaxonomyCommand(region);
  return <div className={css.grid}>
    <section className={css.panel}><div className={catalog.header}><h2>{data.marketName} collections</h2>
      {permissions.update && <Link className={catalog.outline} href={taxonomyHref(region, { view: 'collections', collection: 'new' })}>New collection</Link>}</div>
      <div className={css.scroll}><table className={catalog.table}><thead><tr><th scope="col">Collection</th><th scope="col">Selection</th>
        <th scope="col">Publication</th></tr></thead>
        <tbody>{data.collections.map(collection => <tr key={collection.id} className={collection.id === current?.id ? css.selected : undefined}>
          <td><Link href={taxonomyHref(region, { view: 'collections', collection: collection.id })}>{collection.name}</Link></td>
          <td>{collectionLabels[collection.selection]}</td><td>{collection.published ? 'Published' : 'Hidden'}</td></tr>)}
          {!data.collections.length && <tr><td colSpan={3} className={catalog.empty}>No collections.</td></tr>}</tbody></table></div>
    </section>
    <div className={css.stack}>
      {(canCreate || current) && <section className={css.panel}><h2>{current?.name ?? 'Create collection'}</h2>
        {permissions.update ? <CollectionEditor current={current} region={region} canUpload={canUpload}/> : current && <p>{current.description}</p>}
      </section>}
      {current && <section className={css.panel}><h2>Market publication</h2>
        <p>{current.published ? 'Published' : 'Hidden'} · {data.eligibleCount} eligible products · {current.hasOverride ? 'Market override' : 'Default setting'}</p>
        {permissions.merchandise && <div><button type="button" className={catalog.outline} disabled={command.pending} onClick={() => void command.send({
          action: 'collection.publish', input: { collectionId: current.id, marketId: data.marketId, expectedRevision: current.revision, published: !current.published },
        }, current.published ? 'Collection hidden in this market.' : 'Collection published in this market.')}>
          {current.published ? 'Hide from this market' : 'Publish in this market'}</button></div>}
        <Feedback value={command.feedback}/>
      </section>}
      {current && current.selection === 'CURATED' && permissions.update && <CuratedProducts current={current} region={region}/>}
      {current && current.selection !== 'CURATED' && <section className={css.panel}><h2>Product selection</h2>
        <p>Eligible products are selected automatically from products marked {current.selection === 'NEW' ? 'as new arrivals' : 'as featured'}.</p></section>}
    </div>
  </div>;
}

function CollectionEditor({ current, region, canUpload }: { current: Collections['current']; region: Region; canUpload: boolean }) {
  const command = useTaxonomyCommand(region);
  const [id, setId] = useState('');
  return <form className={css.form} onChange={() => command.changed(true)} onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const collectionId = current?.id ?? (id || 'collection-' + crypto.randomUUID());
    setId(collectionId);
    void command.send({ action: 'collection.save', input: { id: collectionId, expectedRevision: current?.revision ?? null,
      name: readField(data, 'name'), slug: readField(data, 'slug'), description: readField(data, 'description'),
      selection: readField(data, 'selection'), position: Number(readField(data, 'position')), image: imageInput(data, 'image') } }, 'Collection saved.',
      current ? undefined : taxonomyHref(region, { view: 'collections', collection: collectionId }));
  }}>
    <div className={css.fields}>
      <TextInput name="name" label="Collection name" value={current?.name} required max={100}/>
      <TextInput name="slug" label="Slug" value={current?.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*"/>
      <label>Product selection<select name="selection" defaultValue={current?.selection ?? 'CURATED'}>
        {Object.entries(collectionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Display order<input name="position" type="number" min={0} max={9999} defaultValue={current?.position ?? 0}/></label>
    </div>
    <label>Description<textarea name="description" maxLength={1200} defaultValue={current?.description ?? ''}/></label>
    <ImageFields name="image" title="Collection image" src={current?.imageSrc} alt={current?.imageAlt} region={region}
      canUpload={canUpload} onUpload={() => command.changed(true)}/>
    <div><button className={catalog.primary} disabled={command.pending}>Save collection</button></div>
    <Feedback value={command.feedback}/>
  </form>;
}

type CollectionPage = { products: NonNullable<Collections['current']>['products']; page: number; pages: number };
function CuratedProducts({ current, region }: { current: NonNullable<Collections['current']>; region: Region }) {
  const command = useTaxonomyCommand(region);
  const [members, setMembers] = useState(current.products);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CollectionPage>();
  const [searching, setSearching] = useState(false);
  const [issue, setIssue] = useState('');
  async function search(page = 1) {
    setIssue(''); setSearching(true);
    try { setResult(await catalogRequest<CollectionPage>({ read: 'collection-products', id: current.id, q: query.trim(), page }, region)); }
    catch (error) { setIssue(error instanceof Error ? error.message : 'Product search could not be completed.'); }
    finally { setSearching(false); }
  }
  return <section className={css.panel}><h2>Curated products</h2>
    <form className={css.search} onSubmit={event => { event.preventDefault(); void search(); }}>
      <label>Product name or SKU<input type="search" maxLength={120} value={query} disabled={searching || command.pending}
        onChange={event => { setQuery(event.target.value); setResult(undefined); }}/></label>
      <button className={catalog.outline} disabled={searching || command.pending}>Search products</button>
    </form>
    {searching && <p role="status">Searching products…</p>}
    {issue && <p className={css.error} role="alert">{issue}</p>}
    {result && <div className={css.item}>
      {result.products.map(product => <div className={css.actions} key={product.id}><span>{product.name}</span>
        <button type="button" className={catalog.outline + ' ' + css.compact} disabled={searching || command.pending || members.some(member => member.id === product.id)}
          onClick={() => { command.changed(true); setMembers(values => [...values, product]); }}>Add</button></div>)}
      {!result.products.length && <p>No matching products.</p>}
      <div className={css.actions}><button type="button" className={catalog.outline} disabled={searching || command.pending || result.page <= 1} onClick={() => void search(result.page - 1)}>Previous</button>
        <button type="button" className={catalog.outline} disabled={searching || command.pending || result.page >= result.pages} onClick={() => void search(result.page + 1)}>Next</button></div>
    </div>}
    {members.map((product, index) => <div className={css.item} key={product.id}><span>{product.name} {!product.visibleInMarket && <small>Unavailable in this market</small>}</span>
      <div className={css.actions}><OrderButtons index={index} length={members.length} label={product.name} disabled={command.pending}
        move={delta => { command.changed(true); setMembers(values => moveInList(values, index, delta)); }}/>
        <button type="button" className={catalog.outline + ' ' + css.compact} disabled={command.pending} onClick={() => {
          command.changed(true);
          setMembers(values => values.filter(row => row.id !== product.id));
        }}>Remove</button></div>
    </div>)}
    {!members.length && <p>No curated products.</p>}
    <div><button type="button" className={catalog.primary} disabled={searching || command.pending} onClick={() => void command.send({
      action: 'collection.products', input: { collectionId: current.id, expectedRevision: current.revision,
        expectedProductIds: current.products.map(row => row.id), productIds: members.map(row => row.id) },
    }, 'Collection products saved.')}>Save product order</button></div>
    <Feedback value={command.feedback}/>
  </section>;
}
