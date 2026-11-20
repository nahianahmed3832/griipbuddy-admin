'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import { categoryKinds, categoryLabel, parentKind, taxonomyHref, type Attributes, type Attribute, type CatalogCategory,
  type CategoryData, type CategoryKind, type CategoryPermission, type Template } from '@/lib/connected-category-data';
import type { Region } from '@/lib/sections';
import { ChoiceCheck, Feedback, ImageFields, imageInput, moveInList, OrderButtons, readField, TextInput, useTaxonomyCommand } from './connected-category-controls';
import { ConnectedCategoryAssignments } from './connected-category-assignments';
import { ConnectedCollections, ConnectedMenus } from './connected-organization';
import { TaxonomyPendingChanges, useConfirmTaxonomyNavigation } from './connected-catalog-product/taxonomy-controls';
import css from './connected-categories.module.css';
import catalog from './production-catalog.module.css';

export type TaxonomyView = 'categories' | 'attributes' | 'menus' | 'collections';
type Props = { data: CategoryData; region: Region; permissions: CategoryPermission; view: TaxonomyView;
  requested?: string; mode?: string; query?: string; childrenOnly?: boolean; assignmentScope: 'direct' | 'descendants' | 'all' | 'search' };

const preorder = (nodes: CatalogCategory[]) => {
  const byParent = new Map<string | null, CatalogCategory[]>();
  for (const node of nodes) byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
  const visited = new Set<string>();
  const rows: { node: CatalogCategory; depth: number }[] = [];
  function visit(node: CatalogCategory, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    rows.push({ node, depth });
    for (const child of byParent.get(node.id) ?? []) visit(child, depth + 1);
  }
  for (const node of byParent.get(null) ?? []) visit(node, 0);
  for (const node of nodes) visit(node, 0);
  return rows;
};
const archive = (node: CatalogCategory) => node.state === 'ARCHIVED';
const marketName = (region: Region) => region === 'INTERNATIONAL' ? 'United States' : 'Bangladesh';
const marketId = (region: Region) => region === 'INTERNATIONAL' ? 'us' : 'bd';

function categoryBreadcrumb(current: CatalogCategory, nodes: CatalogCategory[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const seen = new Set([current.id]);
  const path = [current];
  let parent = current.parentId ? byId.get(current.parentId) : undefined;
  while (parent && !seen.has(parent.id)) {
    path.unshift(parent);
    seen.add(parent.id);
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return path;
}

export function ConnectedCategories({ data, region, permissions, view, requested, mode, query, childrenOnly, assignmentScope }: Props) {
  const current = data.categories.find(row => row.id === (data.selectedId ?? requested));
  const create = mode === 'create' || mode === 'create-child';
  const rows = preorder(data.categories);
  const visibility = new Map(data.navigation?.categories.map(category => [category.id, category.visible]));
  const options: { key: TaxonomyView; name: string }[] = [
    { key: 'categories', name: 'Categories' }, { key: 'attributes', name: 'Attributes' },
    { key: 'menus', name: 'Menus' }, { key: 'collections', name: 'Collections' },
  ];
  return <TaxonomyPendingChanges><div className={catalog.page}>
    <div className={catalog.header}><div><h1>Catalog organization</h1><p>{marketName(region)}</p></div>
      {view === 'categories' && <div className={catalog.headerActions}>
        {region === 'BD' && <Link className={catalog.outline} href={taxonomyHref(region, { catalog: 'legacy' })}>Recovered category records</Link>}
        {permissions.create && <Link className={catalog.primary} href={taxonomyHref(region, { mode: 'create' })}><Plus size={16}/>New category</Link>}
      </div>}
    </div>
    <nav aria-label="Catalog organization" className={css.tabs}>{options.map(option => <Link key={option.key} className={catalog.outline}
      href={taxonomyHref(region, { view: option.key, record: option.key === 'attributes' ? current?.id : undefined })}
      aria-current={view === option.key ? 'page' : undefined}>{option.name}</Link>)}</nav>
    {current && (view === 'categories' || view === 'attributes') && <nav className={css.actions} aria-label="Category breadcrumb">
      {categoryBreadcrumb(current, data.categories).map((node, index) => <span className={css.actions} key={node.id}>
        {index > 0 && <ChevronRight size={14} aria-hidden/>}{node.id === current.id ? <span aria-current="page">{node.name}</span> :
          <Link href={taxonomyHref(region, { view, record: node.id })}>{node.name}</Link>}
      </span>)}
    </nav>}
    {view === 'menus' && (data.navigation ? <ConnectedMenus key={`${data.navigation.key}:${data.navigation.locale}:${data.navigation.revision}`}
      navigation={data.navigation} region={region} canEdit={permissions.merchandise} collections={data.collections?.collections ?? []}/>
      : <section className={css.panel}><h2>Menus</h2><p>Menu access is unavailable for this market and account.</p></section>)}
    {view === 'collections' && (data.collections ? <ConnectedCollections key={`${data.collections.current?.id}:${data.collections.current?.revision}`}
      data={data.collections} region={region} permissions={permissions} canUpload={data.uploadEnabled === true}/> :
      <section className={css.panel}><h2>Collections</h2><p>Collection access is unavailable for this market and account.</p></section>)}
    {view === 'attributes' && <div className={css.grid}>
      <section className={css.panel}><h2>Category templates</h2>
        <p>Choose a category to inspect its effective attribute rules.</p>
        <div className={css.scroll}><table className={catalog.table}><thead><tr><th scope="col">Category</th><th scope="col">State</th></tr></thead>
          <tbody>{rows.filter(({ node }) => node.kind).map(({ node, depth }) => <tr key={node.id} className={current?.id === node.id ? css.selected : undefined}>
            <td><Link className={css.treeName} data-depth={depth} href={taxonomyHref(region, { view: 'attributes', record: node.id })}>{node.name}</Link></td>
            <td>{node.state}</td></tr>)}</tbody></table></div>
      </section>
      {current && data.attributes ? <AttributePanel key={current.id + ':' + current.revision} category={current} attributes={data.attributes}
        region={region} canEdit={permissions.update && !archive(current)}/>
        : <section className={css.panel}><h2>Attribute rules</h2><p>{current ? 'Attribute templates require central catalog access.' : 'Select a category.'}</p></section>}
    </div>}
    {view === 'categories' && <div className={css.grid}>
      <section className={css.panel}><h2>{childrenOnly ? 'Subcategories' : 'Category hierarchy'}</h2>
        <CategoryTree rows={childrenOnly ? rows.filter(({ node }) => node.kind === 'SUBCATEGORY') : rows}
          current={current} region={region} visibility={visibility}/>
        {current && permissions.update && current.kind && !archive(current) && <SiblingOrder key={current.id + ':' + current.revision}
          current={current} nodes={data.categories} region={region}/>}
      </section>
      <div className={css.stack}>
        {requested && !current && <section className={css.panel}><h2>Category reference</h2><p role="status">No verified connected category was found for {requested}.</p>
          {region === 'BD' && <div><Link className={catalog.outline} href={taxonomyHref(region, { catalog: 'legacy', record: requested })}>
            Check recovered records</Link></div>}
        </section>}
        {create && permissions.create ? <CategoryEditor key={mode} nodes={data.categories} region={region}
          canUpload={data.uploadEnabled === true} startKind={mode === 'create-child' ? 'SUBCATEGORY' : 'CATEGORY'}/> :
          current ? <>
            {current.kind && !archive(current) && permissions.update ? <CategoryEditor key={current.id + ':' + current.revision} current={current}
              nodes={data.categories} region={region} canUpload={data.uploadEnabled === true}/> : <CategorySummary current={current}/>}
            {data.businessCodes.length > 0 && <section className={css.panel}><h2>Verified business codes</h2>
              {data.businessCodes.map(({ namespace, value }) => <div key={namespace + ':' + value}><span className={css.muted}>{namespace}</span>
                {' '}<code className={css.mono}>{value}</code></div>)}
            </section>}
            {current.kind && !archive(current) && permissions.update && <Translations key={current.id + ':' + current.revision} current={current} region={region}/>}
            {current.kind && !archive(current) && permissions.merchandise && <MarketPresentation key={current.id + ':' + current.revision + ':' + region}
              current={current} region={region} owner={data.owner} canUpload={data.uploadEnabled === true}
              hiddenByParent={visibility.get(current.id) === false && current.marketPresentations[0]?.visibleInNavigation !== false}/>}
            {data.assignments && <ConnectedCategoryAssignments key={JSON.stringify([current.id, assignmentScope, query, data.assignments.page])}
              data={data.assignments} current={current} categories={data.categories} query={query} region={region}
              scope={assignmentScope} canEdit={permissions.update}/>}
            {data.owner && current.kind && <CategoryLifecycle key={current.id + ':' + current.revision} current={current} region={region}
              nodes={data.categories} canMove={permissions.update && !archive(current)} canArchive={permissions.archive && !archive(current)}/>}
            {data.owner && <CategoryHistory history={data.history ?? []}/>}
          </> : <section className={css.panel}><h2>Category details</h2><p>Select a category to view its placements and settings.</p></section>}
      </div>
    </div>}
  </div></TaxonomyPendingChanges>;
}

function CategoryTree({ rows, current, region, visibility }: {
  rows: ReturnType<typeof preorder>; current?: CatalogCategory; region: Region; visibility: Map<string, boolean>;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim().normalize('NFC').toLowerCase();
  const parents = new Map(rows.map(({ node }) => [node.id, node.parentId]));
  const visible = new Set<string>();
  for (const { node } of rows) {
    const fields = [node.name, node.shortName, node.slug, node.id, ...node.translations.flatMap(row => [row.name, row.shortName, row.slug ?? '']),
      ...node.aliases.map(alias => alias.slug)];
    if (!term || fields.some(value => value.normalize('NFC').toLowerCase().includes(term))) {
      for (let id: string | null = node.id; id && !visible.has(id); id = parents.get(id) ?? null) visible.add(id);
    }
  }
  const matches = rows.filter(({ node }) => visible.has(node.id));
  return <><label className={css.search}>Search category tree<input type="search" value={search} maxLength={120}
    onChange={event => setSearch(event.target.value)}/></label>
    <div className={css.scroll}><table className={catalog.table}><thead><tr><th scope="col">Category</th>
    <th scope="col">Level</th><th scope="col">State</th><th scope="col">Navigation</th></tr></thead>
    <tbody>{matches.length ? matches.map(({ node, depth }) => <tr key={node.id} className={current?.id === node.id ? css.selected : undefined}>
      <td><Link className={css.treeName} data-depth={depth} href={taxonomyHref(region, { record: node.id })}>
        {depth > 0 && <ChevronRight size={13} aria-hidden/>}{node.name}</Link></td>
      <td>{node.kind ? categoryLabel[node.kind] : 'Unclassified'}</td><td>{node.state}</td>
      <td>{!visibility.has(node.id) ? 'Unavailable' : node.marketPresentations[0]?.visibleInNavigation === false ? 'Hidden' :
        visibility.get(node.id) === false ? 'Hidden by parent' : node.marketPresentations[0]?.visibleInNavigation === true ? 'Shown' : 'Default'}</td>
    </tr>) : <tr><td colSpan={4} className={catalog.empty}>{term ? 'No categories match.' : 'No categories to show.'}</td></tr>}</tbody></table></div></>;
}

function CategorySummary({ current }: { current: CatalogCategory }) {
  return <section className={css.panel}><h2>{current.name}</h2><p>{current.description}</p>
    <div><p>Catalog ID <span className={css.mono}>{current.id}</span></p>
      <p>{current.kind ? categoryLabel[current.kind] : 'Unclassified'} · {current.state}</p></div>
  </section>;
}

function CategoryEditor({ current, nodes, region, canUpload, startKind = 'CATEGORY' }: { current?: CatalogCategory; nodes: CatalogCategory[];
  region: Region; canUpload: boolean; startKind?: CategoryKind }) {
  const [kind, setKind] = useState(current?.kind ?? startKind);
  const [id, setId] = useState('');
  const command = useTaxonomyCommand(region);
  const validParents = nodes.filter(node => node.kind === parentKind[kind] && !archive(node));
  return <section className={css.panel}><h2>{current?.name ?? 'Create category'}</h2>
    {current && <p>Catalog ID <span className={css.mono}>{current.id}</span></p>}
    <form className={css.form} onChange={() => command.changed(true)} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const categoryId = current?.id ?? (id || 'cat-' + crypto.randomUUID());
      setId(categoryId);
      void command.send({ action: 'category.save', input: { id: categoryId, revision: current?.revision ?? null,
        kind, parentId: current ? current.parentId : kind === 'DEPARTMENT' ? null : readField(data, 'parentId'), state: readField(data, 'state'),
        name: readField(data, 'name'), shortName: readField(data, 'shortName'), slug: readField(data, 'slug'),
        description: readField(data, 'description'), position: Number(readField(data, 'position')),
        image: imageInput(data, 'image'), banner: imageInput(data, 'banner'), seoTitle: readField(data, 'seoTitle') || null,
        seoDescription: readField(data, 'seoDescription') || null } }, 'Category saved.',
        current ? undefined : taxonomyHref(region, { record: categoryId }));
    }}>
      <div className={css.fields}>
        <TextInput name="name" label="Name" value={current?.name} required max={100}/>
        <TextInput name="shortName" label="Short name" value={current?.shortName} required max={32}/>
        <TextInput name="slug" label="Slug" value={current?.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*"/>
        <label>Level<select value={kind} disabled={Boolean(current)} onChange={event => setKind(event.target.value as CategoryKind)}>
          {categoryKinds.map(value => <option key={value} value={value}>{categoryLabel[value]}</option>)}</select></label>
        {kind !== 'DEPARTMENT' && (current ? <p>Parent category · {nodes.find(node => node.id === current.parentId)?.name ?? current.parentId ?? 'Missing'}</p> :
          <label>Parent category<select key={kind} name="parentId" defaultValue="" required>
            <option value="">Select a parent</option>{validParents.map(node => <option key={node.id} value={node.id}>{node.name} · {node.id}</option>)}
          </select></label>)}
        <label>State<select name="state" defaultValue={current?.state ?? 'DRAFT'}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option></select></label>
        <label>Display order<input name="position" type="number" min={0} max={9999} defaultValue={current?.position ?? 0} required/></label>
      </div>
      <label>Description<textarea name="description" maxLength={1200} defaultValue={current?.description ?? ''}/></label>
      <ImageFields name="image" title="Category image" src={current?.imageSrc} alt={current?.imageAlt} required region={region}
        canUpload={canUpload} onUpload={() => command.changed(true)}/>
      <ImageFields name="banner" title="Banner image" src={current?.bannerSrc} alt={current?.bannerAlt} region={region}
        canUpload={canUpload} onUpload={() => command.changed(true)}/>
      <div className={css.fields}><TextInput name="seoTitle" label="SEO title" value={current?.seoTitle}/>
        <TextInput name="seoDescription" label="SEO description" value={current?.seoDescription} max={320}/></div>
      <div className={css.actions}><button className={catalog.primary} disabled={command.pending}>{current ? 'Save category' : 'Create category'}</button></div>
      <Feedback value={command.feedback}/>
    </form>
  </section>;
}

function SiblingOrder({ current, nodes, region }: { current: CatalogCategory; nodes: CatalogCategory[]; region: Region }) {
  const [entries, setEntries] = useState(() => nodes.filter(node => node.parentId === current.parentId && node.kind && !archive(node))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)));
  const command = useTaxonomyCommand(region);
  if (entries.length < 2) return null;
  return <details><summary>Reorder sibling categories</summary><div className={css.stack}>
    {entries.map((entry, index) => <div className={css.actions} key={entry.id}><span>{entry.name}</span>
      <OrderButtons label={entry.name} index={index} length={entries.length} disabled={command.pending} move={delta => {
        command.changed(true);
        setEntries(values => moveInList(values, index, delta));
      }}/></div>)}
    <div><button type="button" className={catalog.outline} disabled={command.pending} onClick={() => void command.send({
      action: 'category.reorder', input: { parentId: current.parentId, siblings: entries.map(({ id, revision }) => ({ id, revision })) },
    }, 'Category order saved.')}>Save order</button></div><Feedback value={command.feedback}/>
  </div></details>;
}

function Translations({ current, region }: { current: CatalogCategory; region: Region }) {
  const command = useTaxonomyCommand(region);
  const confirmNavigation = useConfirmTaxonomyNavigation();
  const [locale, setLocale] = useState(current.translations[0]?.locale ?? '');
  const translation = current.translations.find(row => row.locale === locale);
  return <section className={css.panel}><h2>Translations</h2>
    <label className={css.form}>Language<select value={locale} disabled={command.pending} onChange={event => {
      if (!confirmNavigation()) return;
      command.changed(false);
      setLocale(event.target.value);
    }}>
      <option value="">Add a language</option>{current.translations.map(row => <option key={row.locale}>{row.locale}</option>)}
    </select></label>
    <form key={locale} className={css.form} onChange={() => command.changed(true)} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      void command.send({ action: 'category.translation', input: { id: current.id, revision: current.revision,
        locale: locale || readField(data, 'locale'), translation: { name: readField(data, 'name'), shortName: readField(data, 'shortName'),
          description: readField(data, 'description'), slug: readField(data, 'slug') || null } } }, 'Translation saved.');
    }}>
      <div className={css.fields}>{!locale && <TextInput name="locale" label="Language tag" required max={35} pattern="[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*"/>}
        <TextInput name="name" label="Localized name" value={translation?.name} required max={100}/>
        <TextInput name="shortName" label="Localized short name" value={translation?.shortName} required max={32}/>
        <TextInput name="slug" label="Localized slug" value={translation?.slug}/></div>
      <label>Localized description<textarea name="description" defaultValue={translation?.description ?? ''} maxLength={1200}/></label>
      <div className={css.actions}><button className={catalog.primary} disabled={command.pending}>Save translation</button>
        {translation && <button type="button" className={catalog.outline} disabled={command.pending} onClick={() => {
          if (window.confirm('Remove this translation? Its previous URL may still resolve to the same category.')) void command.send({
            action: 'category.translation', input: { id: current.id, revision: current.revision, locale, translation: null },
          }, 'Translation removed.');
        }}>Remove translation</button>}</div>
      {current.aliases.length > 0 && <details><summary>Previous URLs</summary><ul>{current.aliases.map(alias =>
        <li key={alias.locale + ':' + alias.slug}><code>{alias.slug}</code> {alias.locale}</li>)}</ul></details>}
      <Feedback value={command.feedback}/>
    </form>
  </section>;
}

function MarketPresentation({ current, region, owner, canUpload, hiddenByParent }: {
  current: CatalogCategory; region: Region; owner: boolean; canUpload: boolean; hiddenByParent: boolean;
}) {
  const command = useTaxonomyCommand(region);
  const value = current.marketPresentations[0];
  const base = { id: current.id, revision: current.revision, marketId: marketId(region) };
  return <section className={css.panel}><h2>{marketName(region)} presentation</h2>
    <p>Navigation visibility leaves product sale eligibility unchanged.</p>
    {hiddenByParent && <p>This category inherits hidden navigation from a parent.</p>}
    <form className={css.form} onChange={() => command.changed(true)} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const visibility = readField(data, 'visibility');
      const position = readField(data, 'position');
      const image = imageInput(data, 'image');
      const presentation = { ...(visibility && { visibleInNavigation: visibility === 'show' }),
        ...(position && { position: Number(position) }), ...(image && { image }) };
      void command.send({ action: 'category.presentation', input: { ...base, presentation: Object.keys(presentation).length ? presentation : null } },
        'Market presentation saved.');
    }}>
      <div className={css.fields}><label>Navigation visibility<select name="visibility"
        defaultValue={value?.visibleInNavigation == null ? '' : value.visibleInNavigation ? 'show' : 'hide'}>
        <option value="">Use default</option><option value="show">Show</option><option value="hide">Hide</option>
      </select></label><label>Market display order<input name="position" type="number" min={0} max={9999} defaultValue={value?.position ?? ''}/></label></div>
      <ImageFields name="image" title="Market image" src={value?.imageSrc} alt={value?.imageAlt} region={region}
        canUpload={canUpload} canPreview={owner} onUpload={() => command.changed(true)}/>
      {!owner && <p>Use an asset already approved for this market.</p>}
      <div className={css.actions}><button className={catalog.primary} disabled={command.pending}>Save market presentation</button>
        {value && <button type="button" className={catalog.outline} disabled={command.pending} onClick={() => void command.send({
          action: 'category.presentation', input: { ...base, presentation: null }, }, 'Market presentation reset.')}>Reset to defaults</button>}</div>
      <Feedback value={command.feedback}/>
    </form>
  </section>;
}

function CategoryLifecycle({ current, region, nodes, canMove, canArchive }: {
  current: CatalogCategory; region: Region; nodes: CatalogCategory[]; canMove: boolean; canArchive: boolean;
}) {
  const command = useTaxonomyCommand(region);
  const [impact, setImpact] = useState<CategoryData['impact']>();
  const [problem, setProblem] = useState('');
  const [checking, setChecking] = useState(false);
  const [destination, setDestination] = useState('');
  const kind = current.kind;
  const parents = kind && kind !== 'DEPARTMENT' && canMove ? nodes.filter(node =>
    node.kind === parentKind[kind] && node.id !== current.parentId && node.id !== current.id &&
    !archive(node) && (current.state !== 'ACTIVE' || node.state === 'ACTIVE')) : [];
  async function check() {
    setChecking(true);
    setProblem('');
    try { setImpact(await catalogRequest({ read: 'category-impact', id: current.id }, region)); }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Impact could not be loaded.'); }
    finally { setChecking(false); }
  }
  return <section className={css.panel}><h2>Category impact</h2>
    <div><button type="button" className={catalog.outline} disabled={checking} onClick={() => void check()}>Check category impact</button></div>
    {impact && <div className={css.stack}><p>{impact.primary} primary assignments · {impact.additional} additional assignments · {impact.descendantProducts} descendant products</p>
      <p>{impact.childCategories} descendant categories · {impact.activeDirect} active directly assigned products · {impact.menuLinks} menu links</p>
      {parents.length > 0 && <form className={css.form} onSubmit={event => {
        event.preventDefault();
        if (!destination || !window.confirm('Move ' + current.name + ' and its branch to the selected parent?')) return;
        void command.send({ action: 'category.move', input: { id: current.id, revision: current.revision, parentId: destination } },
          'Category moved. Product assignments were preserved.');
      }}>
        <label>Move to parent<select value={destination} disabled={command.pending} required onChange={event => {
          setDestination(event.target.value);
          command.changed(Boolean(event.target.value));
        }}>
          <option value="">Choose a parent</option>{parents.map(parent => <option key={parent.id} value={parent.id}>{parent.name} · {parent.id}</option>)}
        </select></label>
        <p>Products keep their category IDs. The new parent determines inherited settings.</p>
        <div><button className={catalog.outline} disabled={command.pending || !destination}>Move category</button></div>
      </form>}
      {canArchive && (impact.canArchive ? <div><button type="button" className={catalog.outline} disabled={command.pending} onClick={() => {
        if (window.confirm('Archive ' + current.name + '?')) void command.send({ action: 'category.archive',
          input: { id: current.id, revision: current.revision } }, 'Category archived.');
      }}>Archive category</button></div> : <p>Move active product assignments and active child categories before archiving.</p>)}</div>}
    {problem && <p role="alert" className={css.error}>{problem}</p>}
    <Feedback value={command.feedback}/>
  </section>;
}

const auditDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
function categoryChange(changes: Record<string, unknown> | null) {
  if (changes?.state === 'ARCHIVED') return 'Category archived';
  if (changes?.kind === 'attribute-template') return 'Attribute template updated';
  if (typeof changes?.locale === 'string') return (changes.removed ? 'Translation removed · ' : 'Translation saved · ') + changes.locale;
  if (typeof changes?.marketId === 'string') return 'Market presentation updated · ' + changes.marketId.toUpperCase();
  if (Array.isArray(changes?.siblings)) return 'Child categories reordered';
  if (changes && 'parentId' in changes && changes.parentId !== changes.previousParentId) return 'Parent category changed';
  return 'Category details saved';
}

function CategoryHistory({ history }: { history: NonNullable<CategoryData['history']> }) {
  return <section className={css.panel}><h2>Category change history</h2>
    {history.length ? <div className={css.scroll}><table className={catalog.table}>
      <thead><tr><th scope="col">Change</th><th scope="col">Staff</th><th scope="col">Time (UTC)</th></tr></thead>
      <tbody>{history.map(row => <tr key={row.id}><td>{categoryChange(row.changes)}</td><td>{row.actor?.name ?? '—'}</td>
        <td><time dateTime={row.createdAt}>{auditDate.format(new Date(row.createdAt))}</time></td></tr>)}</tbody>
    </table></div> : <p>No recorded changes.</p>}
  </section>;
}

function AttributePanel({ category, attributes, region, canEdit }: { category: CatalogCategory; attributes: Attributes; region: Region; canEdit: boolean }) {
  const [attributeId, setAttributeId] = useState(attributes.local[0]?.attributeId ?? attributes.definitions[0]?.id ?? '');
  const confirmNavigation = useConfirmTaxonomyNavigation();
  const selected = attributes.definitions.find(item => item.id === attributeId);
  const local = attributes.local.find(item => item.attributeId === attributeId);
  const rule = local ?? attributes.effective.find(item => item.id === attributeId);
  const [definitionId, setDefinitionId] = useState('');
  return <div className={css.stack}>
    <section className={css.panel}><h2>{category.name}</h2>
      <div className={css.scroll}><table className={catalog.table}><thead><tr><th scope="col">Effective attribute</th><th scope="col">Scope</th>
        <th scope="col">Rule</th><th scope="col">Source</th></tr></thead>
        <tbody>{attributes.effective.map(rule => <tr key={rule.id}><td>{rule.position} · {rule.name}</td><td>{rule.scope}</td>
          <td>{rule.required ? 'Required' : 'Optional'}{rule.filterable && ' · Filterable'}</td>
          <td>{rule.sourceDepartmentId === category.id ? 'This category' :
            attributes.inheritedSources.find(source => source.id === rule.sourceDepartmentId)?.name ?? rule.sourceDepartmentId}</td></tr>)}
          {!attributes.effective.length && <tr><td className={catalog.empty} colSpan={4}>No effective attributes.</td></tr>}
        </tbody></table></div>
      {attributes.local.some(rule => rule.excluded) && <p>Excluded here: {attributes.local.filter(rule => rule.excluded)
        .map(rule => attributes.definitions.find(item => item.id === rule.attributeId)?.name ?? rule.attributeId).join(', ')}</p>}
    </section>
    {canEdit && <>
      <section className={css.panel}><h2>Attribute rule</h2><label className={css.form}>Attribute<select value={attributeId}
        onChange={event => { if (confirmNavigation()) setAttributeId(event.target.value); }}><option value="">Choose an attribute</option>
        {attributes.definitions.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
        {selected && <AttributeRule key={attributeId} selected={selected} category={category} rule={rule} local={Boolean(local)} region={region}/>}
      </section>
      <section className={css.panel}><h2>Reusable attribute definitions</h2><label className={css.form}>Definition<select value={definitionId}
        onChange={event => { if (confirmNavigation()) setDefinitionId(event.target.value); }}><option value="">Create a definition</option>
        {attributes.definitions.map(definition => <option key={definition.id} value={definition.id}>{definition.name}</option>)}</select></label>
        <AttributeDefinition key={definitionId} definition={attributes.definitions.find(item => item.id === definitionId)} region={region}/>
      </section>
    </>}
  </div>;
}

type AttributeImpact = { total: number; published: number; page: number; pages: number;
  products: { id: string; name: string; reasons: string[] }[] };
function AttributeRule({ selected, category, rule, local, region }: { selected: Attribute; category: CatalogCategory;
  rule?: Omit<Template, 'excluded'> & { excluded?: boolean }; local: boolean; region: Region }) {
  const command = useTaxonomyCommand(region);
  const [review, setReview] = useState<{ impact: AttributeImpact; input: Record<string, unknown> }>();
  const [problem, setProblem] = useState('');
  const [checking, setChecking] = useState(false);
  async function check(input: Record<string, unknown>, page = 1) {
    if (checking || command.pending) return;
    setChecking(true);
    setProblem('');
    if (input !== review?.input) setReview(undefined);
    try { setReview({ impact: await catalogRequest<AttributeImpact>({ read: 'attribute-impact', input, page }, region), input }); }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Impact could not be loaded.'); }
    finally { setChecking(false); }
  }
  function preview(template: Template | null) {
    return check({ departmentId: category.id, attributeId: selected.id, expectedRevision: category.revision, template });
  }
  return <form className={css.form} onChange={() => {
    setReview(undefined);
    command.changed(true);
  }} onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void preview({ required: data.has('required'), filterable: data.has('filterable'), inheritable: data.has('inheritable'),
      excluded: data.has('excluded'), position: Number(readField(data, 'position')) });
  }}>
    <p>{selected.scope} · {selected.dataType}{selected.variantOptionKey ? ' · Option ' + selected.variantOptionKey : ''}</p>
    <fieldset className={`${css.fields} ${css.ruleFields}`} disabled={checking || command.pending}>
      <ChoiceCheck name="required" defaultChecked={rule?.required}>Required</ChoiceCheck>
      <ChoiceCheck name="filterable" defaultChecked={rule?.filterable}>Filterable</ChoiceCheck>
      <ChoiceCheck name="inheritable" defaultChecked={rule?.inheritable ?? true}>Inherit to descendants</ChoiceCheck>
      <ChoiceCheck name="excluded" defaultChecked={rule?.excluded}>Exclude inherited rule here</ChoiceCheck>
      <label>Display order<input name="position" type="number" min={0} max={9999} defaultValue={rule?.position ?? 0}/></label>
    </fieldset>
    <div className={css.actions}><button className={catalog.outline} disabled={checking || command.pending}>Preview rule change</button>
      {local && <button type="button" className={catalog.outline} disabled={checking || command.pending} onClick={() => void preview(null)}>Preview removing override</button>}</div>
    {checking && <p role="status">Reviewing affected products…</p>}
    {review && <div className={css.item}><p>{review.impact.total} affected products · {review.impact.published} published</p>
      {review.impact.products.length > 0 && <ul>{review.impact.products.map(row => <li key={row.id}>{row.name} · {row.reasons.map(reason => reason.replaceAll('_', ' ')).join(', ')}</li>)}</ul>}
      {review.impact.pages > 1 && <nav className={css.actions} aria-label="Affected products pages">
        <button type="button" className={catalog.outline} disabled={checking || command.pending || review.impact.page <= 1}
          onClick={() => void check(review.input, review.impact.page - 1)}>Previous page</button>
        <span role="status">Page {review.impact.page} of {review.impact.pages}</span>
        <button type="button" className={catalog.outline} disabled={checking || command.pending || review.impact.page >= review.impact.pages}
          onClick={() => void check(review.input, review.impact.page + 1)}>Next page</button>
      </nav>}
      <div><button type="button" className={catalog.primary} disabled={checking || command.pending} onClick={() => void command.send({
        action: 'category.attribute', input: review.input,
      }, 'Attribute rule saved.')}>Save reviewed change</button></div>
    </div>}
    {problem && <p className={css.error} role="alert">{problem}</p>}
    <Feedback value={command.feedback}/>
  </form>;
}

function AttributeDefinition({ definition, region }: { definition?: Attribute; region: Region }) {
  const command = useTaxonomyCommand(region);
  const [scope, setScope] = useState(definition?.scope ?? 'PRODUCT');
  const [dataType, setDataType] = useState(definition?.dataType ?? 'TEXT');
  return <form className={css.form} onChange={() => command.changed(true)} onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void command.send({ action: 'attribute.save', input: {
      id: definition?.id ?? readField(data, 'id'), name: readField(data, 'name'), scope, dataType,
      allowedValues: dataType === 'ENUM' ? readField(data, 'allowedValues').split('\n').map(value => value.trim()).filter(Boolean) : [],
      variantOptionKey: definition?.variantOptionKey ?? (scope === 'VARIANT' && ['TEXT', 'ENUM'].includes(dataType) ? readField(data, 'option') || null : null),
    } }, 'Attribute definition saved.');
  }}>
    <div className={css.fields}>
      {definition ? <p>Attribute ID <span className={css.mono}>{definition.id}</span></p> :
        <TextInput name="id" label="Stable attribute ID" required max={80} pattern="[a-z0-9]([a-z0-9]|-)*"/>}
      <TextInput name="name" label="Display name" required value={definition?.name} max={100}/>
      <label>Scope<select value={scope} disabled={Boolean(definition)} onChange={event => setScope(event.target.value as Attribute['scope'])}>
        <option value="PRODUCT">Product</option><option value="VARIANT">Variant</option></select></label>
      <label>Type<select value={dataType} disabled={Boolean(definition)} onChange={event => setDataType(event.target.value as Attribute['dataType'])}>
        <option value="TEXT">Text</option><option value="NUMBER">Number</option><option value="BOOLEAN">Yes or no</option><option value="ENUM">Allowed values</option></select></label>
      {!definition && scope === 'VARIANT' && ['TEXT', 'ENUM'].includes(dataType) && <TextInput name="option" label="Existing variant option key" max={40}/>}
      {definition?.variantOptionKey && <p>Existing variant option <span className={css.mono}>{definition.variantOptionKey}</span></p>}
    </div>
    {dataType === 'ENUM' && <label>Allowed values, one per line<textarea name="allowedValues" required defaultValue={definition?.allowedValues.join('\n') ?? ''}/></label>}
    <div><button className={catalog.primary} disabled={command.pending}>Save definition</button></div>
    <Feedback value={command.feedback}/>
  </form>;
}
