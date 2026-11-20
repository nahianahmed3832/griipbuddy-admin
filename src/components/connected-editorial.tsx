'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import type { EditorialDraft, EditorialDocument, EditorialEditorData, HomepageScope } from '@/lib/homepage-merchandising';
import type { Region } from '@/lib/sections';
import { TaxonomyFeedback, useTaxonomyDirty } from './connected-catalog-product/taxonomy-controls';
import { HomepageAsset, HomepageReferencePicker } from './connected-homepage-reference';

export function ConnectedEditorial({ scope, initial, region, writable }: {
  scope: HomepageScope; initial: EditorialEditorData; region: Region; writable: boolean;
}) {
  const router = useRouter();
  const setPendingNavigation = useTaxonomyDirty();
  const [draft, setDraft] = useState<EditorialDraft>(initial.draft);
  const [selection, setSelection] = useState(initial.draft.documents[0]?.id ?? '');
  const [revision, setRevision] = useState(initial.revision);
  const [live, setLive] = useState(initial.publishedId);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const locked = useRef(false);
  const selected = draft.documents.find(item => item.id === selection);
  const market = scope.previews[0];
  function change(next: EditorialDraft) {
    setDraft(next);
    setDirty(true);
    setPendingNavigation(true);
  }
  function edit(fields: Partial<EditorialDocument>) {
    change({ ...draft, documents: draft.documents.map(item => item.id === selection ? { ...item, ...fields } : item) });
  }
  function add(kind: EditorialDocument['kind']) {
    const item: EditorialDocument = { id: crypto.randomUUID(), kind, slug: '', title: '', summary: '', body: [''] };
    change({ ...draft, documents: [...draft.documents, item] });
    setSelection(item.id);
  }
  async function write(action: 'save' | 'publish' | 'withdraw', event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!writable || locked.current || (action !== 'save' && dirty)) return;
    if (action === 'publish' && !window.confirm('Publish the saved editorial draft in this market and language?')) return;
    if (action === 'withdraw' && !window.confirm('Withdraw this editorial publication from the storefront?')) return;
    locked.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await catalogRequest<{ revision: number; publishedId: string | null }>({
        action: `homepage.editorial-${action}`, input: {
          homepageScope: scope.key, expectedRevision: revision, ...(action === 'save' && { content: draft }),
        },
      }, region);
      setRevision(result.revision);
      setLive(result.publishedId);
      setDirty(false);
      setPendingNavigation(false);
      setNotice(action === 'save' ? 'Editorial draft saved.' : action === 'publish' ? 'Editorial content published.' : 'Editorial publication withdrawn.');
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The editorial update could not be completed.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return <section className="taxonomy-card" aria-labelledby="editorial-authoring">
    <header className="taxonomy-card-heading">
      <h2 id="editorial-authoring">Pages and articles</h2>
      <span className="taxonomy-badge">{live ? 'Published' : 'Draft only'}</span>
    </header>
    <p className="taxonomy-muted">This publication affects {market?.label} in {market?.defaultLocale}. Schedules use {market?.timeZone}.</p>
    {initial.revision > revision && <p role="alert">Another editor saved a new revision. Reload before publishing.</p>}
    <form className="taxonomy-form" onSubmit={event => void write('save', event)}>
      <fieldset className="homepage-fieldset" disabled={!writable || busy}>
        <div className="taxonomy-actions">
          <button type="button" className="taxonomy-button" disabled={draft.documents.length >= 16} onClick={() => add('ARTICLE')}>Add article</button>
          <button type="button" className="taxonomy-button" disabled={draft.documents.length >= 16} onClick={() => add('PAGE')}>Add page</button>
          <button type="button" className="taxonomy-button" disabled={draft.categories.length >= 16} onClick={() =>
            change({ ...draft, categories: [...draft.categories, { slug: '', label: '' }] })}>Add blog category</button>
        </div>
        {draft.categories.length > 0 && <details open>
          <summary>Blog categories</summary>
          {draft.categories.map((category, index) => <fieldset key={index} className="taxonomy-card homepage-row">
            <legend>{category.label || 'New blog category'}</legend>
            <div className="taxonomy-fields">
              <label>Category name<input required maxLength={70} value={category.label}
                onChange={event => change({ ...draft, categories: draft.categories.map((item, row) =>
                  index === row ? { ...item, label: event.target.value } : item) })}/></label>
              <label>Category slug<input required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={70} value={category.slug}
                onChange={event => {
                  const slug = event.currentTarget.value;
                  change({ categories: draft.categories.map((item, row) => index === row ? { ...item, slug } : item),
                    documents: draft.documents.map(item => category.slug && item.category === category.slug ? { ...item, category: slug || undefined } : item) });
                }}/></label>
            </div>
            <button type="button" className="taxonomy-button" onClick={() => change({
              categories: draft.categories.filter((_, row) => index !== row),
              documents: draft.documents.map(item => item.category === category.slug ? { ...item, category: undefined } : item),
            })}>Remove category</button>
          </fieldset>)}
        </details>}
        {draft.documents.length > 0 && <label>Selected document<select value={selection} onChange={event => {
          setSelection(event.currentTarget.value);
          setPreview(false);
        }}>{draft.documents.map(item => <option key={item.id} value={item.id}>{item.title || (item.kind === 'ARTICLE' ? 'Untitled article' : 'Untitled page')}</option>)}
        </select></label>}
        {selected && <fieldset key={selected.id} className="taxonomy-card homepage-row">
          <legend>{selected.kind === 'ARTICLE' ? 'Blog article' : 'Editorial page'}</legend>
          <div className="taxonomy-fields homepage-fields">
            <label>Document title<input value={selected.title} required maxLength={100} onChange={event => edit({ title: event.currentTarget.value })}/></label>
            <label>Public slug<input value={selected.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={70}
              onChange={event => edit({ slug: event.currentTarget.value })}/></label>
            {selected.kind === 'ARTICLE' && <label>Blog category<select value={selected.category ?? ''}
              onChange={event => edit({ category: event.currentTarget.value || undefined })}>
              <option value="">Uncategorized</option>
              {draft.categories.flatMap((item, index) => item.slug ? [<option key={index} value={item.slug}>{item.label || item.slug}</option>] : [])}
            </select></label>}
            <label>Summary<textarea rows={3} value={selected.summary} required maxLength={220}
              onChange={event => edit({ summary: event.currentTarget.value })}/></label>
            <label>Document text<textarea rows={8} required maxLength={6814} defaultValue={selected.body.join('\n\n')}
              onChange={event => edit({ body: event.currentTarget.value.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean) })}/>
              <small>Separate up to eight paragraphs with a blank line. Each paragraph can contain up to 850 characters.</small></label>
            <label>Search title<input value={selected.seoTitle ?? ''} maxLength={70}
              onChange={event => edit({ seoTitle: event.currentTarget.value || undefined })}/></label>
            <label>Search description<textarea rows={2} value={selected.seoDescription ?? ''} maxLength={160}
              onChange={event => edit({ seoDescription: event.currentTarget.value || undefined })}/></label>
            <label>Starts in market local time<input type="datetime-local" value={selected.startsLocal ?? ''}
              onChange={event => edit({ startsLocal: event.currentTarget.value || undefined })}/></label>
            <label>Ends in market local time<input type="datetime-local" value={selected.endsLocal ?? ''}
              onChange={event => edit({ endsLocal: event.currentTarget.value || undefined })}/></label>
          </div>
          {selected.image && <HomepageAsset image={selected.image} region={region}/>}
          <HomepageReferencePicker kind="media" label="Approved cover image" region={region} scope={scope.key}
            value={selected.image ? [selected.image.src] : []}
            selected={selected.image ? [{ id: selected.image.src, label: selected.image.alt, image: selected.image }] : []}
            disabled={!writable || busy} maximum={1}
            onChange={([src], picked) => edit({ image: src ? { src, alt: picked?.image?.alt ?? '' } : undefined })}/>
          {selected.image && <label>Cover image alternative text<input required value={selected.image.alt} maxLength={130}
            onChange={event => edit({ image: { src: selected.image!.src, alt: event.currentTarget.value } })}/></label>}
          <div className="taxonomy-actions">
            <button type="button" className="taxonomy-button" onClick={() => setPreview(value => !value)}>{preview ? 'Close preview' : 'Preview document'}</button>
            <button type="button" className="taxonomy-button" onClick={() => {
              const remaining = draft.documents.filter(item => item.id !== selection);
              change({ ...draft, documents: remaining });
              setSelection(remaining[0]?.id ?? '');
            }}>Remove from draft</button>
          </div>
          {preview && <article className="taxonomy-card" aria-label="Editorial draft preview">
            <h3>{selected.title}</h3><p>{selected.summary}</p>{selected.body.map((text, index) => <p key={index}>{text}</p>)}
          </article>}
        </fieldset>}
        {writable && <button className="taxonomy-button taxonomy-button--primary" type="submit" disabled={!dirty}>Save editorial draft</button>}
      </fieldset>
    </form>
    {writable && <div className="taxonomy-actions">
      <button type="button" className="taxonomy-button taxonomy-button--primary" disabled={dirty || busy || !revision}
        onClick={() => void write('publish')}>Publish editorial draft</button>
      {live && <button type="button" className="taxonomy-button" disabled={dirty || busy}
        onClick={() => void write('withdraw')}>Withdraw live editorial</button>}
    </div>}
    {busy && <p role="status">Updating editorial content…</p>}
    <TaxonomyFeedback error={error} message={notice}/>
    {initial.history.length > 0 && <details>
      <summary>Publication history</summary>
      <ul className="homepage-reference-list">{initial.history.map(item => <li key={item.id}>
        <time dateTime={item.publishedAt}>{new Intl.DateTimeFormat(market?.defaultLocale ?? 'en', {
          dateStyle: 'medium', timeStyle: 'short', timeZone: market?.timeZone,
        }).format(new Date(item.publishedAt))}</time>
        {item.id === live && <span>Live</span>}
      </li>)}</ul>
    </details>}
  </section>;
}
