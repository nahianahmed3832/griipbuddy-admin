'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { catalogBeforeRegionChange, catalogRequest } from '@/lib/connected-catalog-client';
import { catalogUploadLimit } from '@/lib/connected-catalog-contract';
import { adminPath } from '@/lib/paths';
import { homepageSectionLabels, homepageTileKinds, type HomepageDraft, type HomepageEditorData, type HomepageReference,
  type HomepageReferenceKind, type HomepageScope, type HomepageSection, type HomepageSectionType } from '@/lib/homepage-merchandising';
import type { Region } from '@/lib/sections';
import { TaxonomyFeedback, useTaxonomyDirty } from './connected-catalog-product/taxonomy-controls';
import { ConnectedHomepagePreview } from './connected-homepage-preview';
import { HomepageAsset, HomepageReferencePicker } from './connected-homepage-reference';
import { HomepageTilesEditor, homepageMediaTypes, type UploadHomepageImage } from './connected-homepage-tiles';

const authorable: HomepageSectionType[] = ['DEPARTMENTS', 'TILES', 'CURATED', 'COLLECTIONS', 'CATEGORY_SPOTLIGHT', 'NEW', 'DEALS'];
const byPosition = (a: HomepageSection, b: HomepageSection) => a.position - b.position || a.key.localeCompare(b.key);
const mainHero = 'hero';
const catalogDestinations = { categories: 'Category page', collections: 'Collection page', products: 'Product page' } as const;
const standaloneDestinations = { '/shop': 'Shop all', '/gifts': 'Gift registry' } as const;
type DestinationKind = '' | keyof typeof catalogDestinations | keyof typeof standaloneDestinations;

function destinationKind(href?: string): DestinationKind {
  if (href === '/shop' || href === '/gifts') return href;
  if (href?.startsWith('/departments/')) return 'categories';
  if (href?.startsWith('/collections/')) return 'collections';
  if (href?.startsWith('/products/')) return 'products';
  return '';
}

export function HomepageScopeForm({ path, scopes, scope, region }: { path: string; scopes: HomepageScope[]; scope: HomepageScope; region: Region }) {
  return <form method="get" action={adminPath(path)} className="taxonomy-actions homepage-scope-form"
    onSubmit={event => { if (!window.dispatchEvent(new Event(catalogBeforeRegionChange, { cancelable: true }))) event.preventDefault(); }}>
    <input type="hidden" name="region" value={region} />
    <label>Market and language<select name="scope" defaultValue={scope.key}>
      {scopes.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}
    </select></label>
    <button className="taxonomy-button" type="submit">Open template</button>
  </form>;
}

function fileData(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

function materialPayload(draft: HomepageDraft): HomepageDraft {
  return { hiddenSections: draft.hiddenSections, sections: draft.sections.map(section => {
    if (section.key === mainHero) return section;
    const { description, bannerImage, tileLayout, tiles, ...rest } = section;
    const layout = tileLayout ?? 'PORTRAIT';
    if (section.type === 'TILES' && (!tiles?.length || tiles.some(tile => !tile.referenceId || !homepageTileKinds[layout].includes(tile.kind)))) {
      throw new Error(`Choose a valid destination for every tile in ${section.title}.`);
    }
    return { ...rest, ...(description?.trim() ? { description: description.trim() } : {}),
      ...(bannerImage?.src ? { bannerImage } : {}), ...(section.type === 'TILES' && { tileLayout: layout,
        tiles: tiles?.map(tile => ({ ...tile, title: tile.title?.trim() || undefined, ctaLabel: tile.ctaLabel?.trim() || undefined })) }) };
  }) };
}

function SectionFields({ section, region, scope, refData, disabled, onEdit, onAsset }: {
  section: HomepageSection; region: Region; scope: HomepageScope; refData: HomepageEditorData['references']; disabled: boolean;
  onEdit: (fields: Partial<HomepageSection>) => void; onAsset: UploadHomepageImage;
}) {
  const [picked, setPicked] = useState<HomepageReference[]>([]);
  const market = scope.key.startsWith('global:') ? undefined : scope.previews[0];
  const kind = section.type;
  const linked = section.link;
  const [destination, setDestination] = useState<DestinationKind>(() => destinationKind(linked?.href));
  const isCatalogDestination = destination === 'categories' || destination === 'collections' || destination === 'products';
  function refs(resource: HomepageReferenceKind, label: string, ids: string[], max: number,
    update: (value: string[], picked?: HomepageReference) => void, useHref = false) {
    return <HomepageReferencePicker kind={resource} label={label} region={region} scope={scope.key} value={ids} maximum={max}
      disabled={disabled} useHref={useHref} selected={[...(refData?.[resource] ?? []), ...picked,
        ...(useHref && linked ? [{ id: linked.href, label: linked.label }] : [])]} onChange={(newIds, ref) => {
        if (ref) setPicked(rows => [...rows.filter(row => row.id !== ref.id), ref]);
        update(newIds, ref);
      }} />;
  }
  return <>
    <div className="taxonomy-fields homepage-fields">
      <label>Section type<select value={section.type} onChange={event => {
        const type = event.target.value as HomepageSectionType;
        setDestination('');
        onEdit({ type, productIds: undefined, categoryIds: undefined, categoryId: undefined, collectionIds: undefined,
          collection: undefined, budget: undefined, fallbackIds: undefined, link: undefined,
          tileLayout: type === 'TILES' ? 'PORTRAIT' : undefined, tiles: undefined,
          limit: type === 'TILES' ? undefined : section.limit });
      }}>{(authorable.includes(kind) ? authorable : [...authorable, kind]).map(type =>
        <option key={type} value={type}>{homepageSectionLabels[type]}</option>)}</select></label>
      <label>Display order<input type="number" required min={2} max={100} value={section.position || ''}
        onChange={event => onEdit({ position: Number(event.target.value) })} /></label>
      <label>Section title<input required minLength={2} maxLength={90} value={section.title}
        onChange={event => onEdit({ title: event.target.value })} /></label>
      <label>Supporting text<textarea rows={2} maxLength={300} value={section.description ?? ''}
        onChange={event => onEdit({ description: event.target.value })} /></label>
      <label>Starts in market local time<input type="datetime-local" value={section.startsLocal ?? ''}
        onChange={event => onEdit({ startsLocal: event.target.value || undefined })} /></label>
      <label>Ends in market local time<input type="datetime-local" value={section.endsLocal ?? ''}
        onChange={event => onEdit({ endsLocal: event.target.value || undefined })} /></label>
      {kind !== 'TILES' && <label>Maximum items<input type="number" min={1} max={12} value={section.limit ?? ''}
        onChange={event => onEdit({ limit: event.target.value ? Number(event.target.value) : undefined })} /></label>}
      <label className="homepage-checkbox"><input type="checkbox" checked={section.enabled !== false}
        onChange={event => onEdit({ enabled: event.target.checked })} /> Enabled</label>
    </div>
    {kind === 'TILES' && <HomepageTilesEditor section={section} region={region} scope={scope} refData={refData}
      disabled={disabled} onEdit={onEdit} onUpload={onAsset} />}
    {['CURATED', 'FEATURED', 'BANNER'].includes(kind) && refs('products', 'Products', section.productIds ?? [], 16, productIds => onEdit({ productIds }))}
    {kind === 'DEPARTMENTS' && refs('categories', 'Categories', section.categoryIds ?? [], 12, categoryIds => onEdit({ categoryIds: categoryIds.length ? categoryIds : undefined }))}
    {kind === 'CATEGORY_SPOTLIGHT' && refs('categories', 'Spotlight category', section.categoryId ? [section.categoryId] : [], 1, values => onEdit({ categoryId: values[0] }))}
    {kind === 'COLLECTIONS' && refs('collections', 'Collections', section.collectionIds ?? [], 12, collectionIds => onEdit({ collectionIds: collectionIds.length ? collectionIds : undefined }))}
    {kind === 'COLLECTION' && <label>Existing collection slug<input required maxLength={101} value={section.collection ?? ''}
      onChange={event => onEdit({ collection: event.target.value })} /></label>}
    {['CURATED', 'FEATURED', 'NEW', 'BESTSELLERS', 'TRENDING'].includes(kind) && refs('products', 'Fallback products', section.fallbackIds ?? [], 16, fallbackIds => onEdit({ fallbackIds }))}
    {kind === 'DEALS' && (market ? <label>Budget ceiling in {market.currency}<input type="number" min="0.01" step="0.01"
      value={section.budget ? section.budget.amountMinor / 100 : ''} onChange={event => onEdit({ budget: event.target.value
        ? { currency: market.currency, amountMinor: Math.round(Number(event.target.value) * 100) } : undefined })} />
      <small>Leave blank to show eligible active offers. Enter a ceiling to select products by local price.</small></label>
      : <p className="taxonomy-muted">Active offers use each market’s pricing. Set a budget ceiling in a market template.</p>)}
    {kind === 'CATEGORY_SPOTLIGHT' ? <p className="taxonomy-muted">The destination is the published page for the selected category.</p>
    : <>
      <div className="taxonomy-fields">
        <label>Section destination<select value={destination} onChange={event => {
          const next = event.target.value as DestinationKind;
          setDestination(next);
          if (next === '/shop' || next === '/gifts') onEdit({ link: { href: next, label: standaloneDestinations[next] } });
          else onEdit({ link: undefined });
        }}>
          <option value="">Use the catalog destination when available</option>
          {Object.entries(standaloneDestinations).map(([href, label]) => <option key={href} value={href}>{label}</option>)}
          {Object.entries(catalogDestinations).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select></label>
        {linked && <label>Destination label<input required minLength={2} maxLength={40} value={linked.label}
          onChange={event => onEdit({ link: { href: linked.href, label: event.target.value } })} /></label>}
      </div>
      {isCatalogDestination && refs(destination, `Destination ${catalogDestinations[destination].toLowerCase()}`, linked ? [linked.href] : [], 1,
        ([href], ref) => onEdit({ link: href ? { href, label: (ref?.label ?? 'Shop now').slice(0, 40) } : undefined }), true)}
    </>}
    <div className="homepage-fieldset">
      <h3>Section image</h3>
      {section.bannerImage && <HomepageAsset image={section.bannerImage} region={region} />}
      {refs('media', 'Approved image', section.bannerImage?.src ? [section.bannerImage.src] : [], 1, ([src], ref) =>
        onEdit({ bannerImage: src ? { src, alt: ref?.image?.alt ?? '' } : undefined }))}
      <label>Upload section image<input type="file" accept={homepageMediaTypes.join(',')} aria-label="Upload section image"
        onChange={event => { const file = event.target.files?.[0]; if (file) onAsset(file, bannerImage => onEdit({ bannerImage })); event.target.value = ''; }} /></label>
      {section.bannerImage?.src && <label>Image alternative text<input maxLength={130} value={section.bannerImage.alt}
        onChange={event => onEdit({ bannerImage: { src: section.bannerImage!.src, alt: event.target.value } })} /></label>}
    </div>
  </>;
}

export function ConnectedHomepageEditor({ scope, data, region, writable }: { scope: HomepageScope; data: HomepageEditorData; region: Region; writable: boolean }) {
  const router = useRouter();
  const setPendingNavigation = useTaxonomyDirty();
  const revisionRef = useRef(data.revision);
  const [posted, setPosted] = useState<{ revision: number; publishedId: string | null; hasDraft: boolean }>({
    revision: data.revision, publishedId: data.publishedId, hasDraft: data.hasDraft,
  });
  const [draft, setDraft] = useState<HomepageDraft>(data.draft);
  const rows = [...draft.sections].filter(section => section.key !== mainHero).sort(byPosition);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const liveVersion = posted.revision > data.revision ? posted : data;
  const available = data.inheritedSections?.filter(section => section.key !== mainHero) ?? [];

  function change(next: HomepageDraft) { setDraft(next); setDirty(true); setPendingNavigation(true); }
  function edit(key: string, fields: Partial<HomepageSection>) {
    change({ ...draft, sections: draft.sections.map(section => section.key === key ? { ...section, ...fields } : section) });
  }
  function add(type: HomepageSectionType, inheritedKey?: string) {
    const previous = available.find(entry => entry.key === inheritedKey);
    const key = inheritedKey ?? `section-${crypto.randomUUID().slice(0, 12)}`;
    const position = Math.min(100, Math.max(1, ...draft.sections.map(section => section.position)) + 1);
    const section = previous?.section ?? { key, type, title: '', position };
    change({ sections: [...draft.sections, section],
      hiddenSections: draft.hiddenSections.filter(hidden => hidden !== key) });
  }
  function move(index: number, direction: -1 | 1) {
    const next = rows.slice();
    const swap = index + direction;
    [next[swap], next[index]] = [next[index], next[swap]];
    const positions = new Set(rows.map(section => section.position));
    change({ ...draft, sections: [...draft.sections.filter(section => section.key === mainHero), ...next.map((section, keyIndex) =>
      ({ ...section, position: positions.size === rows.length ? rows[keyIndex].position : keyIndex + 2 }))] });
  }
  async function operation(label: string, work: () => Promise<void>, success: string) {
    if (lock.current || !writable) return;
    lock.current = true;
    setBusy(label); setNotice(''); setError('');
    try { await work(); setNotice(success); }
    catch (err) { setError(err instanceof Error ? err.message : 'The homepage could not be updated.'); }
    finally { lock.current = false; setBusy(''); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty) return;
    void operation('Saving draft…', async () => {
      const { revision } = await catalogRequest<{ revision: number }>({ action: 'homepage.save', input: {
        homepageScope: scope.key, expectedRevision: revisionRef.current, content: materialPayload(draft),
      } }, region);
      revisionRef.current = revision;
      setPosted({ revision, hasDraft: true, publishedId: liveVersion.publishedId });
      setDirty(false); setPendingNavigation(false); router.refresh();
    }, 'Draft saved. Preview or publish when ready.');
  }
  function publish(action: 'homepage.publish' | 'homepage.restore' | 'homepage.inherit', releaseId?: string) {
    const verb = action === 'homepage.publish' ? 'Publish this saved draft?' : action === 'homepage.restore'
      ? 'Publish this earlier version?' : 'Replace this published override with inherited content?';
    if (dirty || !window.confirm(verb)) return;
    void operation('Updating publication…', async () => {
      const { revision, releaseId: publishedId } = await catalogRequest<{ revision: number; releaseId: string | null }>({ action, input: {
        homepageScope: scope.key, expectedRevision: revisionRef.current, ...(releaseId ? { releaseId } : {}),
      } }, region);
      revisionRef.current = revision;
      setPosted({ revision, hasDraft: true, publishedId });
      router.refresh();
    }, action === 'homepage.inherit' ? 'Published template now uses inherited content.' : 'Homepage publication updated.');
  }
  const upload: UploadHomepageImage = (file, assignImage) => {
    void operation('Uploading image…', async () => {
      if (!homepageMediaTypes.includes(file.type) || file.size > catalogUploadLimit) throw new Error('Choose a JPEG, PNG or WebP image no larger than 4 MB.');
      const { src } = await catalogRequest<{ src: string }>({ action: 'homepage.media', input: {
        homepageScope: scope.key, contentType: file.type, data: await fileData(file),
      } }, region);
      assignImage({ src, alt: '' });
    }, 'Image uploaded. Add alternative text and save the draft.');
  };
  return <>
    <section className="taxonomy-card" aria-labelledby="homepage-sections">
      <div className="taxonomy-card-heading"><h2 id="homepage-sections">Shopping sections</h2>
        <span className="taxonomy-badge">{liveVersion.publishedId ? 'Published override' : 'Inheriting content'}</span></div>
      <p className="taxonomy-muted">Sections without eligible market content will be skipped. Image, catalog and schedule changes require publication.</p>
      {data.revision > revisionRef.current && <p role="status">Another editor changed this template. Reload the saved draft before editing.</p>}
      {!writable && <p className="taxonomy-muted">You can view this template and preview saved content.</p>}
      <form onSubmit={save} className="taxonomy-form">
        <fieldset className="homepage-fieldset" disabled={!writable || Boolean(busy)}>
          {!rows.length && <p>This template has no local shopping sections.</p>}
          {available.length > 0 && <details className="homepage-inherited"><summary>Inherited sections</summary>
            <ul className="homepage-reference-list">{available.map(section => <li key={section.key}><span>{section.title}</span>
              {rows.some(row => row.key === section.key) ? <small>Edited here</small> : <div className="taxonomy-actions">
                <button type="button" className="taxonomy-button" disabled={!section.type || draft.sections.length >= 16}
                  onClick={() => section.type && add(section.type, section.key)}>Override {section.title}</button>
                <button type="button" className="taxonomy-button" aria-pressed={draft.hiddenSections.includes(section.key)}
                  onClick={() => change({ ...draft, hiddenSections: draft.hiddenSections.includes(section.key)
                    ? draft.hiddenSections.filter(key => key !== section.key) : [...draft.hiddenSections, section.key] })}>
                  {draft.hiddenSections.includes(section.key) ? 'Show inherited' : 'Hide inherited'}</button>
              </div>}
            </li>)}</ul>
          </details>}
          {rows.map((section, index) => <fieldset className="taxonomy-card homepage-row" key={section.key}>
            <legend>{section.title || 'Untitled section'}</legend>
            <SectionFields section={section} region={region} scope={scope} refData={data.references}
              disabled={!writable || Boolean(busy)} onEdit={fields => edit(section.key, fields)} onAsset={upload} />
            <div className="taxonomy-actions">
              <button type="button" disabled={index === 0} className="taxonomy-button" onClick={() => move(index, -1)}>Move section up</button>
              <button type="button" disabled={index + 1 === rows.length} className="taxonomy-button" onClick={() => move(index, 1)}>Move section down</button>
              <button type="button" className="taxonomy-button" onClick={() => change({ ...draft,
                sections: draft.sections.filter(row => row.key !== section.key) })}>Remove section</button>
            </div>
          </fieldset>)}
          {writable && <div className="taxonomy-actions">
            <button type="button" className="taxonomy-button" disabled={draft.sections.length >= 16} onClick={() => add('DEPARTMENTS')}>Add section</button>
            <button type="submit" className="taxonomy-button taxonomy-button--primary" disabled={!dirty}>Save draft</button>
            <button type="button" className="taxonomy-button" onClick={() => {
              if (!dirty || window.confirm('Discard unsaved homepage changes?')) { setPendingNavigation(false); window.location.reload(); }
            }}>Reload saved draft</button>
          </div>}
        </fieldset>
      </form>
      {busy && <p role="status">{busy}</p>}
      <TaxonomyFeedback error={error} message={notice} />
    </section>
    <ConnectedHomepagePreview key={`${scope.key}:${liveVersion.revision}`} scope={scope} region={region} disabled={!liveVersion.hasDraft} />
    <section className="taxonomy-card" aria-labelledby="homepage-publishing">
      <h2 id="homepage-publishing">Publication and history</h2>
      {writable && <div className="taxonomy-actions">
        <button className="taxonomy-button taxonomy-button--primary" type="button" disabled={dirty || Boolean(busy) || !liveVersion.hasDraft}
          onClick={() => publish('homepage.publish')}>Publish saved draft</button>
        {liveVersion.publishedId && <button className="taxonomy-button" type="button" disabled={dirty || Boolean(busy)}
          onClick={() => publish('homepage.inherit')}>Use inherited content</button>}
      </div>}
      {dirty && <p className="taxonomy-muted">Save your changes before updating the publication.</p>}
      {data.history.length === 0 ? <p>No versions published for this template yet.</p> : <ul className="homepage-reference-list">
        {data.history.map(release => <li key={release.id}><div><time dateTime={release.publishedAt}>{new Intl.DateTimeFormat('en', {
          dateStyle: 'medium', timeStyle: 'short', timeZone: scope.key.startsWith('global:') ? 'UTC' : scope.previews[0]?.timeZone ?? 'UTC',
        }).format(new Date(release.publishedAt))}</time>{release.actorName && <span> · {release.actorName}</span>}
          {release.id === liveVersion.publishedId && <span> · Live</span>}{release.restoredFrom && <span> · Restored</span>}</div>
          {writable && release.id !== liveVersion.publishedId && <button className="taxonomy-button" type="button" disabled={dirty || Boolean(busy)}
            onClick={() => publish('homepage.restore', release.id)}>Restore version</button>}
        </li>)}
      </ul>}
    </section>
  </>;
}
