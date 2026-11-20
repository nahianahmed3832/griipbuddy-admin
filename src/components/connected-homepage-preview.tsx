'use client';

import { useState, type FormEvent } from 'react';
import { catalogRequest } from '@/lib/connected-catalog-client';
import { homepageSectionLabels, homepageTileLayouts, type HomepagePreviewData, type HomepageScope } from '@/lib/homepage-merchandising';
import type { Region } from '@/lib/sections';
import { HomepageAsset } from './connected-homepage-reference';

export function ConnectedHomepagePreview({ scope, region, disabled }: { scope: HomepageScope; region: Region; disabled: boolean }) {
  const [marketId, setMarketId] = useState(scope.previews[0]?.marketId ?? '');
  const market = scope.previews.find(option => option.marketId === marketId);
  const [locale, setLocale] = useState(market?.defaultLocale ?? '');
  const [previewAt, setPreviewAt] = useState('');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [data, setData] = useState<HomepagePreviewData>();
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!market || waiting || disabled) return;
    setWaiting(true);
    setData(undefined);
    setError('');
    try {
      setData(await catalogRequest<HomepagePreviewData>({ read: 'homepage-preview', homepageScope: scope.key,
        marketId, locale, ...(previewAt ? { previewAt } : {}) }, region));
    } catch (err) { setError(err instanceof Error ? err.message : 'The draft preview could not be loaded.'); }
    finally { setWaiting(false); }
  }
  return <section className="taxonomy-card" aria-labelledby="homepage-preview">
    <h2 id="homepage-preview">Draft preview</h2>
    <p className="taxonomy-muted">Preview eligible content from the saved draft at the selected market’s local time. Shopping actions and measurement are disabled here.</p>
    {disabled ? <p>Save a draft to preview its shopping sections.</p> : <form className="taxonomy-form" onSubmit={preview}>
      <fieldset className="homepage-fieldset" disabled={waiting}>
        <div className="taxonomy-fields">
          <label>Preview market<select value={marketId} onChange={event => {
            setMarketId(event.target.value);
            setLocale(scope.previews.find(option => option.marketId === event.target.value)?.defaultLocale ?? '');
            setData(undefined);
          }}>{scope.previews.map(option => <option key={option.marketId} value={option.marketId}>{option.label}</option>)}</select></label>
          <label>Preview language<select value={locale} onChange={event => { setLocale(event.target.value); setData(undefined); }}>
            {market?.locales.map(value => <option key={value} value={value}>{value}</option>)}
          </select></label>
          <label>Preview date and time {market?.timeZone && `(${market.timeZone})`}
            <input type="datetime-local" value={previewAt} onChange={event => { setPreviewAt(event.target.value); setData(undefined); }} /></label>
        </div>
        <button type="submit" className="taxonomy-button" disabled={!market}>{waiting ? 'Loading preview…' : 'Preview saved draft'}</button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="taxonomy-error">{error}</p>}
    {waiting && <p role="status">Finding eligible content for this market…</p>}
    {data && <div className="homepage-preview-content" aria-live="polite">
      <p>Draft preview · {market?.label} · {data.locale} · {data.currency}</p>
      <div className="taxonomy-actions" role="group" aria-label="Preview viewport">
        <button type="button" className="taxonomy-button" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>Desktop</button>
        <button type="button" className="taxonomy-button" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}>Mobile</button>
      </div>
      {!data.sections.length && <p>No shopping sections have eligible content in this preview.</p>}
      <div className="homepage-preview-frame" data-viewport={viewport}>{data.sections.map(section => <article className="taxonomy-card" key={section.id}>
        <h3>{section.title}</h3>
        <p className="taxonomy-muted">{section.tileLayout ? homepageTileLayouts[section.tileLayout] : homepageSectionLabels[section.type]}</p>
        {section.description && <p>{section.description}</p>}
        {section.image && <HomepageAsset image={section.image} region={region} />}
        {section.destination && <p className="taxonomy-muted">Destination {typeof section.destination === 'string'
          ? section.destination : section.destination.label ?? section.destination.href}</p>}
        {section.tiles?.length ? <ul className="homepage-preview-showcase" data-layout={section.tileLayout}>
          {section.tiles.map(tile => {
            const mobile = viewport === 'mobile';
            const image = mobile ? tile.mobileImage ?? tile.image : tile.image;
            const focalPoint = mobile ? tile.mobileFocalPoint ?? tile.focalPoint : tile.focalPoint;
            return <li key={tile.id}>
              <div className="homepage-preview-tile">
                {image && <div className="homepage-preview-tile-image"><HomepageAsset image={image} region={region} focalPoint={focalPoint} cover /></div>}
                <div className="homepage-preview-tile-copy">
                  <strong>{tile.title}</strong>
                  {section.tileLayout !== 'SHORTCUTS' && <span>{tile.ctaLabel}</span>}
                  {tile.product && <span>{new Intl.NumberFormat(data.locale, { style: 'currency', currency: data.currency }).format(tile.product.amountMinor / 100)}</span>}
                </div>
              </div>
              <code className="homepage-preview-destination">{tile.href}</code>
            </li>;
          })}
        </ul> : <div className="homepage-preview-tiles">
          {[...(section.categories ?? []), ...(section.collections ?? []), ...(section.products ?? [])].map(item => <div key={`${'amountMinor' in item ? 'product' : 'reference'}:${item.id}`} >
            {item.image && <HomepageAsset image={item.image} region={region} />}
            <strong>{item.name}</strong>
            {'amountMinor' in item && typeof item.amountMinor === 'number' && <p>{new Intl.NumberFormat(data.locale, {
              currency: data.currency, style: 'currency',
            }).format(item.amountMinor / 100)}</p>}
          </div>)}
        </div>}
      </article>)}</div>
    </div>}
  </section>;
}
